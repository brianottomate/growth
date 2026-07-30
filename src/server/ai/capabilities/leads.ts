import "server-only";

import { z } from "zod";
import { and, desc, eq, exists, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  hubspotListMembershipTable,
  leadContactTable,
  leadDomainTable,
  leadOutreachTable,
} from "@/server/db/leads-schema";
import { PLACEHOLDER_EMAIL_DOMAINS_SQL } from "@/server/services/lead-channel.service";
import { generatePregenHubspotDraft } from "@/server/services/pregen-hubspot-outreach.service";
import { growthAction } from "./types";

/**
 * Leads headline numbers. NOTE: the `leads` schema is single-tenant / global in
 * this app (decoupled, droppable), so this ignores `ctx.orgId` — it mirrors the
 * `leads.stats` tRPC query the /app/leads page already shows.
 */
export const leadsSummary = growthAction({
  description:
    "Headline numbers for the lead prospecting database: total domains and contacts, HubSpot and Instantly coverage, ranked prospects, send-batch membership, the untouched expansion pool, the net-new sendable cohort, and the top PMS platforms. Use for 'how big is the leads pool / how many leads are we ready to send / what PMS do prospects use' questions.",
  inputSchema: z.object({}),
  execute: async () => {
    const [totals] = await db
      .select({
        domains: sql<number>`count(*)::int`,
        inHubspot: sql<number>`count(*) filter (where ${leadDomainTable.inHubspot})::int`,
        inInstantly: sql<number>`count(*) filter (where ${leadDomainTable.inInstantly})::int`,
        ranked: sql<number>`count(*) filter (where ${leadDomainTable.scorePregenPotential} is not null)::int`,
        sendBatch: sql<number>`count(*) filter (where ${leadDomainTable.pregenBatch} is not null)::int`,
        withPreviewUrl: sql<number>`count(*) filter (where ${leadDomainTable.pregenSiteUrl} is not null)::int`,
        untouched: sql<number>`count(*) filter (where ${leadDomainTable.inBuiltwith} and not ${leadDomainTable.inHubspot})::int`,
      })
      .from(leadDomainTable);

    // Net-new sendable target — same correlated EXISTS the leads list filter and
    // pill badge use (a multi-aggregate FILTER renders unreliably under Drizzle).
    const [netNewRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadDomainTable)
      .where(
        and(
          eq(leadDomainTable.inHubspot, false),
          eq(leadDomainTable.hasHubspotDeal, false),
          eq(leadDomainTable.isExistingCustomer, false),
          eq(leadDomainTable.excludeFromOutreach, false),
          sql`${leadDomainTable.scorePregenPotential} is not null`,
          exists(
            db
              .select({ one: sql`1` })
              .from(leadContactTable)
              .where(
                and(
                  eq(leadContactTable.domainId, leadDomainTable.id),
                  isNull(leadContactTable.deletedAt),
                  // A placeholder mailbox is not a sendable contact, and 62% of
                  // this table is one, so leaving it in overstated "net-new
                  // sendable" by more than the number itself.
                  sql`lower(split_part(${leadContactTable.email}, '@', 2)) <> all(${PLACEHOLDER_EMAIL_DOMAINS_SQL})`,
                  sql`(${leadContactTable.firstName} is not null or ${leadContactTable.lastName} is not null or ${leadContactTable.email} !~* '@(gmail|yahoo|hotmail|aol|outlook|msn|icloud)\\.')`,
                ),
              ),
          ),
        ),
      );

    const [contacts] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadContactTable);

    const topPms = await db
      .select({ pms: leadDomainTable.pms, count: sql<number>`count(*)::int` })
      .from(leadDomainTable)
      .where(sql`${leadDomainTable.pms} is not null`)
      .groupBy(leadDomainTable.pms)
      .orderBy(desc(sql`count(*)`))
      .limit(8);

    return {
      ...totals,
      contacts: contacts?.count ?? 0,
      netNew: netNewRow?.count ?? 0,
      topPms,
    };
  },
});

/**
 * Read the current sequence draft for one company, so a reviewer can pull it up
 * in chat before steering it.
 */
export const leadsSequence = growthAction({
  description:
    "Read the latest generated outreach sequence for one lead domain: the angle, what it personalized on, and every touch with its subject, body and send day. Use for 'show me the sequence for example.com' or before rewriting one.",
  inputSchema: z.object({
    domain: z
      .string()
      .trim()
      .min(3)
      .describe("The lead domain, e.g. example.com"),
  }),
  execute: async ({ domain }) => {
    const row = await db.query.leadDomainTable.findFirst({
      where: eq(leadDomainTable.domain, domain.toLowerCase()),
    });
    if (!row) return { found: false as const, domain };

    const [draft] = await db
      .select()
      .from(leadOutreachTable)
      .where(eq(leadOutreachTable.domainId, row.id))
      .orderBy(desc(leadOutreachTable.createdAt))
      .limit(1);

    if (!draft) {
      return { found: false as const, domain: row.domain, reason: "no draft" };
    }
    return {
      found: true as const,
      domain: row.domain,
      companyName: row.companyName,
      owningRep: row.hubspotOwner,
      previewUrl: row.pregenSiteUrl,
      status: draft.status,
      angle: draft.angle,
      personalizedOn: draft.personalizedOn ?? [],
      model: draft.model,
      touches: (draft.steps ?? []).map((step, index) => ({
        touch: index + 1,
        subject: step.subject,
        body: step.body,
        sendOnDay: step.delayDays,
      })),
    };
  },
});

/**
 * Rewrite a sequence from chat.
 *
 * Regeneration rather than patching: the copy policy gate runs over a whole
 * four-touch draft, so hand-editing one paragraph could quietly produce a
 * sequence that would never have passed review. `steer` is threaded in as
 * authoritative operator context, which is the same channel the review UI uses.
 *
 * Always lands as `draft`. Nothing here writes to HubSpot or enrolls anyone —
 * publishing stays a separate, explicit human action.
 */
export const leadsRewriteSequence = growthAction({
  description:
    "Rewrite the outreach sequence for one lead domain, steered by an instruction (e.g. 'lead with the call Halli logged', 'shorter, drop the proof point in touch 1'). Regenerates all four touches through the copy-policy gate and saves as a DRAFT. Never publishes to HubSpot and never enrolls anyone.",
  inputSchema: z.object({
    domain: z
      .string()
      .trim()
      .min(3)
      .describe("The lead domain to rewrite the sequence for"),
    steer: z
      .string()
      .trim()
      .min(3)
      .max(2000)
      .describe(
        "What to change, in plain language. Treated as authoritative operator context.",
      ),
  }),
  execute: async ({ domain, steer }) => {
    const row = await db.query.leadDomainTable.findFirst({
      where: eq(leadDomainTable.domain, domain.toLowerCase()),
    });
    if (!row) throw new Error(`Lead domain not found: ${domain}`);
    if (!row.pregenSiteUrl) {
      throw new Error(
        `${row.domain} has no assigned pregen preview, so there is nothing to write about yet.`,
      );
    }

    // Cohort decides the motion, exactly as the tRPC path does — a recycled
    // company has prior outreach to acknowledge.
    const [membership] = await db
      .select({ cohort: hubspotListMembershipTable.cohort })
      .from(hubspotListMembershipTable)
      .where(
        and(
          eq(hubspotListMembershipTable.domainId, row.id),
          eq(hubspotListMembershipTable.objectType, "company"),
        ),
      )
      .limit(1);

    const result = await generatePregenHubspotDraft(row.domain, {
      motion: membership?.cohort === "recycled" ? "reengagement" : "fresh",
      previewUrl: row.pregenSiteUrl,
      steer,
    });

    await db
      .delete(leadOutreachTable)
      .where(
        and(
          eq(leadOutreachTable.domainId, row.id),
          eq(leadOutreachTable.status, "draft"),
        ),
      );
    const [created] = await db
      .insert(leadOutreachTable)
      .values({
        domainId: row.id,
        domain: row.domain,
        status: "draft",
        angle: result.draft.angle,
        personalizedOn: [
          ...result.draft.personalizedOn,
          ...result.draft.historyUsed.map((value) => `History: ${value}`),
        ],
        steps: result.renderedSteps,
        model: result.model,
      })
      .returning();

    return {
      domain: row.domain,
      status: "draft" as const,
      outreachId: created?.id ?? null,
      angle: result.draft.angle,
      touches: result.renderedSteps.map((step, index) => ({
        touch: index + 1,
        subject: step.subject,
        body: step.body,
        sendOnDay: step.delayDays,
      })),
      note: "Saved as a draft. Review it before publishing to HubSpot.",
    };
  },
});
