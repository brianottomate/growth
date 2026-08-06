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
import { growthAction, GrowthActionError } from "./types";

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
 * Regeneration rather than patching, even when `touch` narrows the intent: the
 * copy policy gate runs over a whole four-touch draft, so editing one paragraph
 * in place could quietly produce a sequence that would never have passed review.
 * A targeted change therefore regenerates everything and *holds* the untargeted
 * touches as written, which gets section-level intent without a hole in the gate.
 *
 * `steer` is threaded in as authoritative operator context, the same channel the
 * review UI uses.
 *
 * Always lands as `draft`. Nothing here writes to HubSpot or enrolls anyone —
 * publishing stays a separate, explicit human action.
 */
export const leadsRewriteSequence = growthAction({
  description:
    "Rewrite the outreach sequence for one lead domain, steered by an instruction (e.g. 'lead with the call Halli logged', 'drop the proof point'). Pass `touch` to change one touch and keep the rest. Re-checks all four touches against the copy-policy gate and saves as a DRAFT. Works before a real preview exists, in which case the draft is marked as written against a stand-in and cannot be published. Never publishes to HubSpot and never enrolls anyone.",
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
    touch: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional()
      .describe(
        "Limit the change to one touch, 1-4. The other touches are held as written and the whole sequence is still re-checked. Omit to rewrite all four.",
      ),
  }),
  execute: async ({ domain, steer, touch }) => {
    const row = await db.query.leadDomainTable.findFirst({
      where: eq(leadDomainTable.domain, domain.toLowerCase()),
    });
    if (!row) throw new Error(`Lead domain not found: ${domain}`);
    // Same suppression rule the tRPC generator got in 5081f64. A finished draft
    // lands in Send Review reading as cleared to send, so generating one for a
    // company a rep is already talking to is the failure, not publishing it.
    if (row.excludeFromOutreach) {
      throw new Error(
        `${row.domain} is excluded from outreach${row.excludeReason ? ` (${row.excludeReason})` : ""}, so no sequence should be written for it.`,
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

    // Narrowing to one touch is expressed as operator context rather than a
    // field-level patch: the model is told which touch to change and given the
    // others verbatim to preserve, so the draft the gate sees is still a whole
    // sequence written in one pass.
    const [current] = await db
      .select({ steps: leadOutreachTable.steps })
      .from(leadOutreachTable)
      .where(eq(leadOutreachTable.domainId, row.id))
      .orderBy(desc(leadOutreachTable.createdAt))
      .limit(1);
    const existing = current?.steps ?? [];
    if (touch && !existing.length) {
      // `conflict`: the sequence the model assumed exists does not, and the
      // message names the two-step recovery. Untyped it graded `tool_failed`,
      // whose guidance contradicted the instruction in the sentence itself.
      throw new GrowthActionError(
        "conflict",
        `${row.domain} has no sequence yet, so there is no touch ${touch} to change. Generate one first, then steer it.`,
      );
    }
    const scopedSteer =
      touch && existing.length
        ? [
            `Change touch ${touch} only: ${steer}`,
            "Keep every other touch as it is. Reproduce them with the same intent, structure and length — do not rewrite them to suit the new touch:",
            ...existing
              .map((step, index) =>
                index + 1 === touch
                  ? null
                  : `Touch ${index + 1} (keep as written): ${step.body}`,
              )
              .filter((line): line is string => line !== null),
          ].join("\n\n")
        : steer;

    const result = await generatePregenHubspotDraft(row.domain, {
      motion: membership?.cohort === "recycled" ? "reengagement" : "fresh",
      // No preview is the normal case — 33 of 218K domains have one — so chat
      // steering runs against a stand-in and the draft is marked unpublishable
      // rather than refused outright.
      previewUrl: row.pregenSiteUrl ?? "",
      previewMode: row.pregenSiteUrl ? "require-live" : "pretend",
      steer: scopedSteer,
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
        generationContext: result.generationContext,
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
      changed: touch ? `touch ${touch}` : "all four touches",
      note: result.generationContext.preview.pretend
        ? `Saved as a draft. ${row.domain} has no assigned preview, so this was written against a stand-in — anything it says about the page itself is invented, and publishing will refuse it until a real preview is assigned.`
        : "Saved as a draft. Review it before publishing to HubSpot.",
    };
  },
});
