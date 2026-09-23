import "server-only";

import { and, eq, gte, isNotNull, isNull, or } from "drizzle-orm";

import { env } from "@/env";
import {
  isOperatorLead,
  isQualified,
  leadContact,
  parseUnitCount,
  QUALIFIED_LEAD_EVENT,
  type LeadgenNotification,
} from "@/lib/meta-leadgen";
import {
  fetchFormName,
  fetchLead,
  fetchPageAccessToken,
  listActiveLeadForms,
  listFormLeadsSince,
  sendQualifiedLeadEvent,
  type MetaLead,
  WANDER_PAGE_ID,
} from "@/server/clients/meta-leadgen.client";
import { db } from "@/server/db";
import {
  metaLeadgenLeadTable,
  type MetaLeadgenLead,
} from "@/server/db/leads-schema";
import {
  extractDomain,
  extractEmailDomain,
  normalizeSiteUrl,
  osInboundLeadRouter,
} from "@/server/services/inbound-router.service";

type ReceivedVia = "webhook" | "poll";

const HOUR = 3_600_000;
/** How long a ledger row keeps retrying. */
const RETRY_WINDOW = 7 * 24 * HOUR;
/** A failed handoff retries for a day, then stops so Slack isn't paged hourly. */
const ROUTE_RETRY_WINDOW = 24 * HOUR;

/**
 * Leads created before `META_LEADGEN_ROUTE_FROM` stay with Make, so turning
 * routing on never replays a lead Make already handed to HubSpot.
 */
function routeCutoff(now = Date.now()): Date | null {
  if (!env.META_LEADGEN_ROUTE_FROM) return null;
  const from = new Date(env.META_LEADGEN_ROUTE_FROM).getTime();
  return new Date(Math.max(from, now - ROUTE_RETRY_WINDOW));
}

function shouldRoute(row: MetaLeadgenLead, leadCreatedAt: Date | null) {
  const cutoff = routeCutoff();
  const created = leadCreatedAt ?? row.leadCreatedAt;
  return Boolean(cutoff && created && created >= cutoff && !row.routedAt);
}

/** Store the notification before anything slow, so a crash never loses a lead. */
export async function recordLeadNotifications(
  notifications: LeadgenNotification[],
  receivedVia: ReceivedVia,
): Promise<void> {
  if (notifications.length === 0) return;
  await db
    .insert(metaLeadgenLeadTable)
    .values(
      notifications.map((n) => ({
        leadgenId: n.leadgen_id,
        pageId: n.page_id,
        formId: n.form_id ?? null,
        adId: n.ad_id ?? null,
        receivedVia,
        leadCreatedAt: n.created_time ? new Date(n.created_time * 1000) : null,
      })),
    )
    .onConflictDoNothing({ target: metaLeadgenLeadTable.leadgenId });
}

function isDone(row: MetaLeadgenLead): boolean {
  if (row.qualified === null) return false;
  if (row.qualified && !row.capiSentAt) return false;
  if (
    row.email &&
    isOperatorLead(row.fieldData ?? []) &&
    shouldRoute(row, null)
  ) {
    return false;
  }
  return true;
}

type Step = "capiSentAt" | "routedAt";

/**
 * Stamp a step before doing it, so a webhook worker and the cron racing on
 * the same lead can't both send. A failed step releases its claim.
 */
async function claim(rowId: string, step: Step): Promise<boolean> {
  const claimed = await db
    .update(metaLeadgenLeadTable)
    .set({ [step]: new Date() })
    .where(
      and(
        eq(metaLeadgenLeadTable.id, rowId),
        isNull(metaLeadgenLeadTable[step]),
      ),
    )
    .returning({ id: metaLeadgenLeadTable.id });
  return claimed.length > 0;
}

async function release(rowId: string, step: Step) {
  await db
    .update(metaLeadgenLeadTable)
    .set({ [step]: null })
    .where(eq(metaLeadgenLeadTable.id, rowId));
}

async function routeLead(
  lead: MetaLead,
  formName: string | null,
  units: number | null,
) {
  const contact = leadContact(lead.field_data);
  if (!contact.email) return false;
  const siteUrl = contact.siteUrl ? normalizeSiteUrl(contact.siteUrl) : null;
  const query = new URLSearchParams({
    utm_source: "facebook",
    utm_medium: "paid_social",
    ...(lead.campaign_name && { utm_campaign: lead.campaign_name }),
    ...(lead.ad_name && { utm_content: lead.ad_name }),
    leadgen_id: lead.id,
  });
  const { contactId } = await osInboundLeadRouter({
    email: contact.email,
    domain: siteUrl
      ? extractDomain(siteUrl)
      : extractEmailDomain(contact.email),
    siteUrl,
    numberOfProperties: units ?? 0,
    pmsMeta: contact.pms,
    // The router routes Spanish-form leads to the Spanish-speaking AE by source.
    source: `Meta Lead Ad · ${formName ?? lead.form_id ?? "unknown form"}`,
    queryParams: query.toString(),
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
  });
  // The router logs and swallows HubSpot failures; no contact id means the
  // handoff didn't land.
  if (!contactId) throw new Error("HubSpot upsert returned no contact");
  return true;
}

/**
 * Fetch, qualify and act on one lead. Idempotent: the CAPI event and the router
 * handoff each run once, stamped on the row, so webhook redeliveries and the
 * polling cron can both call this freely.
 */
export async function processLead({
  leadgenId,
  pageToken,
  lead: prefetched,
  formName,
}: {
  leadgenId: string;
  pageToken: string;
  lead?: MetaLead;
  formName?: string | null;
}): Promise<MetaLeadgenLead | null> {
  const [row] = await db
    .select()
    .from(metaLeadgenLeadTable)
    .where(eq(metaLeadgenLeadTable.leadgenId, leadgenId))
    .limit(1);
  if (!row || isDone(row)) return row ?? null;

  const errors: string[] = [];
  const patch: Partial<typeof metaLeadgenLeadTable.$inferInsert> = {};
  try {
    const lead = prefetched ?? (await fetchLead(leadgenId, pageToken));
    const units = parseUnitCount(lead.field_data);
    const qualified = isQualified(units);
    Object.assign(patch, {
      fieldData: lead.field_data,
      email: leadContact(lead.field_data).email,
      units,
      qualified,
      formId: lead.form_id ?? row.formId,
      formName: formName ?? row.formName,
      adId: lead.ad_id ?? row.adId,
      campaignName: lead.campaign_name ?? row.campaignName,
      leadCreatedAt: new Date(lead.created_time),
    });

    if (qualified && !row.capiSentAt && (await claim(row.id, "capiSentAt"))) {
      try {
        await sendQualifiedLeadEvent({
          leadgenId,
          eventName: QUALIFIED_LEAD_EVENT,
        });
      } catch (err) {
        await release(row.id, "capiSentAt");
        errors.push(`capi: ${String(err)}`);
      }
    }

    const createdAt = new Date(lead.created_time);
    if (
      patch.email &&
      isOperatorLead(lead.field_data) &&
      shouldRoute(row, createdAt) &&
      (await claim(row.id, "routedAt"))
    ) {
      try {
        if (!(await routeLead(lead, formName ?? row.formName, units))) {
          await release(row.id, "routedAt");
        }
      } catch (err) {
        await release(row.id, "routedAt");
        errors.push(`router: ${String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`fetch: ${String(err)}`);
  }

  patch.lastError = errors.length ? errors.join(" | ") : null;
  const [updated] = await db
    .update(metaLeadgenLeadTable)
    .set(patch)
    .where(eq(metaLeadgenLeadTable.id, row.id))
    .returning();
  const outcome = {
    leadgenId,
    form: patch.formName ?? row.formName,
    units: patch.units,
    qualified: patch.qualified,
    capiSent: Boolean(updated?.capiSentAt),
    routed: Boolean(updated?.routedAt),
    via: row.receivedVia,
  };
  if (errors.length) {
    console.error("[meta-leadgen] lead failed", {
      ...outcome,
      error: patch.lastError,
    });
  } else {
    console.log("[meta-leadgen] lead", outcome);
  }
  return updated ?? null;
}

export async function processNotifications(
  notifications: LeadgenNotification[],
): Promise<void> {
  if (notifications.length === 0) return;
  const pageToken = await fetchPageAccessToken();
  const formNames = new Map<string, string | null>();
  for (const n of notifications) {
    if (n.form_id && !formNames.has(n.form_id)) {
      formNames.set(
        n.form_id,
        await fetchFormName(n.form_id, pageToken).catch(() => null),
      );
    }
    await processLead({
      leadgenId: n.leadgen_id,
      pageToken,
      formName: n.form_id ? formNames.get(n.form_id) : null,
    });
  }
}

/**
 * Safety net for dropped webhooks (and the only path until the Page is
 * subscribed): read every active form's leads since `hoursBack` and process
 * anything not finished. Meta accepts CAPI events up to 7 days old.
 */
export async function pollRecentLeads({ hoursBack }: { hoursBack: number }) {
  const pageToken = await fetchPageAccessToken();
  const since = Math.floor(Date.now() / 1000) - hoursBack * 3600;
  const forms = await listActiveLeadForms(pageToken);
  const summary = {
    forms: forms.length,
    leads: 0,
    qualified: 0,
    capiSent: 0,
    routed: 0,
    errors: 0,
  };

  const seen = new Set<string>();
  const tally = (row: MetaLeadgenLead | null) => {
    summary.leads += 1;
    if (row?.qualified) summary.qualified += 1;
    if (row?.capiSentAt) summary.capiSent += 1;
    if (row?.routedAt) summary.routed += 1;
    if (row?.lastError) summary.errors += 1;
  };

  for (const form of forms) {
    const leads = await listFormLeadsSince(form.id, since, pageToken);
    for (const lead of leads) {
      seen.add(lead.id);
      await recordLeadNotifications(
        [
          {
            leadgen_id: lead.id,
            page_id: WANDER_PAGE_ID,
            form_id: form.id,
            ad_id: lead.ad_id,
            created_time: Math.floor(
              new Date(lead.created_time).getTime() / 1000,
            ),
          },
        ],
        "poll",
      );
      const row = await processLead({
        leadgenId: lead.id,
        pageToken,
        lead,
        formName: form.name,
      });
      tally(row);
    }
  }

  // Rows the window above no longer reaches: a failed step on an older lead,
  // or a webhook lead whose form has since been paused.
  for (const row of await unfinishedLeads()) {
    if (seen.has(row.leadgenId)) continue;
    tally(await processLead({ leadgenId: row.leadgenId, pageToken }));
  }
  return summary;
}

function unfinishedLeads() {
  const t = metaLeadgenLeadTable;
  const cutoff = routeCutoff();
  return db
    .select()
    .from(t)
    .where(
      and(
        gte(t.createdAt, new Date(Date.now() - RETRY_WINDOW)),
        or(
          isNull(t.qualified),
          and(eq(t.qualified, true), isNull(t.capiSentAt)),
          cutoff
            ? and(
                isNotNull(t.email),
                isNull(t.routedAt),
                gte(t.leadCreatedAt, cutoff),
              )
            : undefined,
        ),
      ),
    )
    .limit(200);
}
