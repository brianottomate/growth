import "server-only";

import { and, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";

import { env } from "@/env";
import {
  isPerformanceMetaForm,
  PERFORMANCE_META_FORM_IDS,
  isQualifiedPerformanceLead,
} from "@/lib/performance-lead";
import {
  normalizePerformanceLead,
  routePerformanceLead,
} from "./performance-lead.service";
import {
  isMeetingLinkForm,
  isQualified,
  MEETING_LOOKUP_WINDOW_MS,
  QUALIFIED_LEAD_EVENT,
  shouldWaitForMeeting,
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
import {
  isRevenueHeroLookupConfigured,
  lookupMeetingRep,
} from "@/server/clients/revenuehero.client";
import { db } from "@/server/db";
import {
  type MetaLeadNormalization,
  normalizeMetaLead,
} from "@/server/services/meta-lead-normalization.service";
import {
  metaLeadgenLeadTable,
  type MetaLeadgenLead,
} from "@/server/db/leads-schema";
import {
  extractEmailDomain,
  osInboundLeadRouter,
} from "@/server/services/inbound-router.service";

type ReceivedVia = "webhook" | "poll" | "zernio";

const HOUR = 3_600_000;
/** How far back the backfill drains unfinished ledger rows. */
const RETRY_WINDOW = 7 * 24 * HOUR;
/**
 * How long the meeting cron keeps re-trying a lead it told to wait. Passes run
 * at most an hour apart and a lead needs one after its window, so a lead still
 * waiting past this failed elsewhere and is left to the manual backfill.
 */
const MEETING_DRAIN_MAX_AGE = 6 * HOUR;
/**
 * Stop starting leads this far into a cron pass; the rest wait for the next
 * pass. Leaves the lead in flight 100 s under the route's 300 s, so the pass
 * isn't killed between claiming `routed_at` and the router returning.
 */
const MEETING_DRAIN_BUDGET_MS = 200_000;

/**
 * Leads created before `META_LEADGEN_ROUTE_FROM` stay with Make, so turning
 * routing on never replays a lead Make already handed to HubSpot.
 */
function routeCutoff(): Date | null {
  return env.META_LEADGEN_ROUTE_FROM
    ? new Date(env.META_LEADGEN_ROUTE_FROM)
    : null;
}

function shouldRoute(row: MetaLeadgenLead, leadCreatedAt: Date | null) {
  if (row.pageId === WANDER_PAGE_ID && isPerformanceMetaForm(row.formId))
    return !row.routedAt;
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
  if (row.email && shouldRoute(row, null)) {
    return false;
  }
  return true;
}

type Step = "capiSentAt" | "routedAt";

/**
 * Stamp a step before doing it, so a webhook redelivery and a backfill racing on
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
  normalization: MetaLeadNormalization,
  salesRepEmail: string | null = null,
) {
  const contact = normalization;
  if (!contact.email) return false;
  const siteUrl = contact.bookingSite
    ? `https://${contact.bookingSite.hostname}${contact.bookingSite.pathname}`
    : null;
  const query = new URLSearchParams({
    utm_source: "facebook",
    utm_medium: "paid_social",
    ...(lead.campaign_name && { utm_campaign: lead.campaign_name }),
    ...(lead.ad_name && { utm_content: lead.ad_name }),
    leadgen_id: lead.id,
  });
  const { contactId } = await osInboundLeadRouter({
    email: contact.email,
    domain: contact.bookingSite?.hostname ?? extractEmailDomain(contact.email),
    siteUrl,
    numberOfProperties: normalization.minimumUnits ?? 0,
    pmsMeta: contact.pms,
    // The router routes Spanish-form leads to the Spanish-speaking AE by source.
    source: `Meta Lead Ad · ${formName ?? lead.form_id ?? "unknown form"}`,
    queryParams: query.toString(),
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    // The rep RevenueHero holds a meeting for; the router resolves the owner
    // and falls back to the round robin when it isn't an active owner.
    salesRepEmail,
  });
  // The router logs and swallows HubSpot failures; no contact id means the
  // handoff didn't land.
  if (!contactId) throw new Error("HubSpot upsert returned no contact");
  return true;
}

type LeadPatch = Partial<typeof metaLeadgenLeadTable.$inferInsert>;

let warnedUnconfigured = false;

/**
 * Which rep a meeting-link lead goes to, and whether routing should wait.
 *
 * The lead books its call after the form submit, so the RevenueHero answer
 * lags the Meta webhook by a few minutes. Within `MEETING_LOOKUP_WINDOW_MS`
 * a miss means "not yet": leave `routed_at` unclaimed and let the next pass
 * (cron or backfill) ask again. Past the window a miss, or a lookup error, is
 * final and the lead takes the normal round robin, so a Make outage can delay
 * a lead but never strand it. Other forms are untouched.
 */
async function meetingRepFor({
  row,
  email,
  formName,
  createdAt,
  patch,
  errors,
}: {
  row: MetaLeadgenLead;
  email: string;
  formName: string | null;
  createdAt: Date;
  patch: LeadPatch;
  errors: string[];
}): Promise<{ salesRepEmail: string | null; wait: boolean }> {
  if (!isMeetingLinkForm(formName)) return { salesRepEmail: null, wait: false };
  if (row.meetingRepEmail) {
    return { salesRepEmail: row.meetingRepEmail, wait: false };
  }
  if (!isRevenueHeroLookupConfigured) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[meta-leadgen] REVENUEHERO_LOOKUP_WEBHOOK_URL is not set; meeting-link forms take the round robin",
      );
    }
    return { salesRepEmail: null, wait: false };
  }

  // One instant for the stamp and the wait decision, so "told to wait" in
  // drainMeetingLookups always agrees with what this pass decided.
  const checkedAt = new Date();
  patch.meetingCheckedAt = checkedAt;
  try {
    const rep = await lookupMeetingRep(email);
    if (rep) {
      patch.meetingRepEmail = rep;
      return { salesRepEmail: rep, wait: false };
    }
  } catch (err) {
    errors.push(`meeting: ${String(err)}`);
  }
  return {
    salesRepEmail: null,
    wait: shouldWaitForMeeting({ leadCreatedAt: createdAt, now: checkedAt }),
  };
}

/**
 * Fetch, qualify and act on one lead. Idempotent: the CAPI event and the router
 * handoff each run once, stamped on the row, so webhook redeliveries and the
 * backfill script can both call this freely.
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
  const patch: LeadPatch = {};
  let meetingWait = false;
  let stage = "fetch";
  try {
    // Keep raw answers for inspection even when the AI call fails.
    const lead = prefetched ?? (await fetchLead(leadgenId, pageToken));
    Object.assign(patch, {
      fieldData: lead.field_data,
      formId: lead.form_id ?? row.formId,
      formName: formName ?? row.formName,
      adId: lead.ad_id ?? row.adId,
      campaignName: lead.campaign_name ?? row.campaignName,
      leadCreatedAt: new Date(lead.created_time),
    });
    if (
      row.pageId === WANDER_PAGE_ID &&
      isPerformanceMetaForm(lead.form_id ?? row.formId)
    ) {
      stage = "performance normalize";
      const normalized = await normalizePerformanceLead({
        fields: lead.field_data,
        formName: formName ?? row.formName,
      });
      const qualified = isQualifiedPerformanceLead(normalized);
      Object.assign(patch, {
        email: normalized.email,
        units: normalized.minimumUnits,
        qualified,
      });
      stage = "performance route";
      let routed = Boolean(row.routedAt);
      if (!row.routedAt && (await claim(row.id, "routedAt"))) {
        try {
          await routePerformanceLead({
            lead: normalized,
            source: `Meta Lead Ad · ${formName ?? row.formName ?? lead.form_id ?? row.formId}`,
            queryParams: new URLSearchParams({
              utm_source: "facebook",
              utm_medium: "paid_social",
              leadgen_id: leadgenId,
              form_id: lead.form_id ?? row.formId ?? "",
              ...(lead.campaign_id && { campaign_id: lead.campaign_id }),
              ...(lead.ad_id && { ad_id: lead.ad_id }),
              ...(lead.campaign_name && { utm_campaign: lead.campaign_name }),
            }).toString(),
          });
          routed = true;
        } catch (error) {
          await release(row.id, "routedAt");
          throw error;
        }
      }
      // Only report CRM qualification once delivery to HubSpot has succeeded.
      stage = "performance capi";
      if (
        routed &&
        qualified &&
        !row.capiSentAt &&
        (await claim(row.id, "capiSentAt"))
      ) {
        try {
          await sendQualifiedLeadEvent({
            leadgenId,
            eventName: QUALIFIED_LEAD_EVENT,
          });
        } catch (error) {
          await release(row.id, "capiSentAt");
          throw error;
        }
      }
    } else {
      stage = "normalize";
      const normalization = await normalizeMetaLead({
        fields: lead.field_data,
        formName: formName ?? row.formName,
      });
      const units =
        normalization.audience === "operator"
          ? normalization.minimumUnits
          : null;
      const qualified = isQualified(units);
      Object.assign(patch, {
        email:
          normalization.audience === "operator" ? normalization.email : null,
        units,
        qualified,
      });
      stage = "process";

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
      const resolvedFormName = formName ?? row.formName;
      if (
        patch.email &&
        normalization.audience === "operator" &&
        shouldRoute(row, createdAt)
      ) {
        const meeting = await meetingRepFor({
          row,
          email: patch.email,
          formName: resolvedFormName,
          createdAt,
          patch,
          errors,
        });
        meetingWait = meeting.wait;
        if (!meeting.wait && (await claim(row.id, "routedAt"))) {
          try {
            if (
              !(await routeLead(
                lead,
                resolvedFormName,
                normalization,
                meeting.salesRepEmail,
              ))
            ) {
              await release(row.id, "routedAt");
            }
          } catch (err) {
            await release(row.id, "routedAt");
            errors.push(`router: ${String(err)}`);
          }
        }
      }
    }
  } catch (err) {
    errors.push(
      `${stage}: failed (${err instanceof Error ? err.name : "unknown error"})`,
    );
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
    ...(meetingWait && { meetingWait: true }),
    ...(updated?.meetingRepEmail && { meetingRep: updated.meetingRepEmail }),
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
 * Backfill for leads the webhook missed (`scripts/backfill-meta-leadgen.ts`):
 * read every active form's leads since `hoursBack` and process anything not
 * finished, then drain unfinished ledger rows up to 7 days old.
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

/**
 * Re-ask RevenueHero for meeting-link leads still waiting on their booking
 * (`/api/cron/meta-leadgen`). Only the ledger is read until there is a row to
 * process, so an empty pass never touches Graph.
 *
 * A waiting lead is one told to wait: no rep yet, and its last lookup landed
 * inside the window. A lookup past the window is always followed by a routing
 * attempt, so a lead whose attempt failed drops out here and is left to the
 * manual backfill like any other failure. Retrying it every pass would repost
 * it to Slack each time, since the router posts even when HubSpot fails.
 */
export async function drainMeetingLookups({
  limit = 100,
  budgetMs = MEETING_DRAIN_BUDGET_MS,
} = {}) {
  const t = metaLeadgenLeadTable;
  const cutoff = routeCutoff();
  const summary = { found: 0, routed: 0, waiting: 0, errors: 0, deferred: 0 };
  if (!cutoff) return summary;

  const stopAt = Date.now() + budgetMs;
  const oldest = new Date(Date.now() - MEETING_DRAIN_MAX_AGE);
  const rows = await db
    .select({ leadgenId: t.leadgenId })
    .from(t)
    .where(
      and(
        isNotNull(t.email),
        isNull(t.routedAt),
        isNull(t.meetingRepEmail),
        isNotNull(t.meetingCheckedAt),
        sql`${t.meetingCheckedAt} < ${t.leadCreatedAt} + ${sql.raw(`interval '${MEETING_LOOKUP_WINDOW_MS / 1000} seconds'`)}`,
        gte(t.leadCreatedAt, cutoff > oldest ? cutoff : oldest),
      ),
    )
    .orderBy(t.leadCreatedAt)
    .limit(limit);
  summary.found = rows.length;
  if (rows.length === 0) return summary;

  const pageToken = await fetchPageAccessToken();
  for (const { leadgenId } of rows) {
    if (Date.now() >= stopAt) {
      summary.deferred += 1;
      continue;
    }
    const row = await processLead({ leadgenId, pageToken });
    if (row?.routedAt) summary.routed += 1;
    else summary.waiting += 1;
    if (row?.lastError) summary.errors += 1;
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
          and(
            eq(t.pageId, WANDER_PAGE_ID),
            or(...PERFORMANCE_META_FORM_IDS.map((id) => eq(t.formId, id))),
            isNull(t.routedAt),
          ),
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
