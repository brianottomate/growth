import { z } from "zod";
import {
  and,
  type SQL,
  asc,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { CURRENT_PREGEN_BATCH } from "@/lib/pregen-batch";
import { generateAndStoreSequence } from "@/server/services/pregen/generate-sequence";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  leadChannelTable,
  leadContactTable,
  leadDomainTable,
  hubspotListMembershipTable,
  leadImportTable,
  leadSequenceTable,
  pregenBuildTable,
} from "@/server/db/leads-schema";
import {
  createWebsiteProspect,
  isWanderApiConfigured,
  listWebsiteProspects,
  SETTLED_PROSPECT_STATUSES,
} from "@/server/clients/wander.client";
import { memberTable } from "@/server/db/auth-schema";
import { brandTable } from "@/server/db/brand-schema";
import { createProspectFromLead } from "@/server/services/brand-relationship.service";
import { captureAndPersistChannels } from "@/server/services/channel-discovery.service";
import { capturePreviewVisual } from "@/server/services/pregen/preview-visual";
import { discoverDomain } from "@/server/services/lead-discovery.service";
import {
  extractFromDiscovery,
  LeadEnrichmentSchema,
} from "@/server/services/lead-extraction.service";
import {
  PregenPreconditionError,
  PregenMotionSchema,
} from "@/server/services/pregen-hubspot-outreach.service";
import { storedContactMentions } from "@/server/services/lead-correspondence";
import { hubspotCompanyPropertiesFromRenderedSteps } from "@/server/services/pregen-hubspot-copy";
import {
  enrollContactInSequence,
  getContactEnrollment,
  isHubspotSequencesConfigured,
  PREGEN_SEQUENCE_ID,
  PREGEN_SEQUENCE_SENDER_USER_ID,
} from "@/server/clients/hubspot-sequences.client";
import {
  readHubspotCompanyActivityHistory,
  readHubspotCompanyEmailHistory,
} from "@/server/services/hubspot-company-email-context.service";
import { classifyFetchUrl } from "@/server/ai/url-safety";
import {
  isFreemailEmail,
  isPlaceholderEmail,
  parseContactChannel,
  PLACEHOLDER_EMAIL_DOMAINS_SQL,
  scoreLeadChannel,
  type StoredLeadContact,
} from "@/server/services/lead-channel.service";
import { rankLeadDomain } from "@/server/services/lead-ranker.service";
import { verifyContactPerson } from "@/server/services/lead-verify.service";
import { isMinervaConfigured } from "@/server/clients/minerva.client";
import {
  queueInstantlyLead,
  activateInstantlyCampaign,
} from "@/server/services/instantly-send.service";
import {
  proposeMerge,
  MERGEABLE_FIELDS,
  type MergeableField,
} from "@/server/services/lead-merge.service";
import {
  createCompany,
  findCompanyByDomain,
  getCompanyContacts,
  HUBSPOT_ACCOUNT_ID,
  isHubspotConfigured,
  updateContact,
  updateCompany,
  type CompanyProperties,
} from "@/server/clients/hubspot.client";
import { TRPCError } from "@trpc/server";

/**
 * Leads router — read surface over the leads.* prospecting tables.
 *
 * Domain-centric: the list/stats operate on the `lead_domain` spine; contacts
 * are fetched per-domain in the detail view.
 */

const SOURCE_COLUMN = {
  builtwith: leadDomainTable.inBuiltwith,
  hubspot: leadDomainTable.inHubspot,
  instantly: leadDomainTable.inInstantly,
} as const;

const SORTS = {
  composite: leadDomainTable.scoreComposite,
  units: leadDomainTable.unitCount,
  domain: leadDomainTable.domain,
  updated: leadDomainTable.updatedAt,
} as const;

export type PreviewProbe = {
  url: string | null;
  state: "none" | "live" | "dead" | "blocked";
  status: number | null;
  detail: string;
};

/**
 * Does the assigned preview actually resolve?
 *
 * 26 of the 33 stored preview URLs point at retired per-company localcan
 * tunnels and 502, and nothing in the UI said so — a reviewer read four
 * polished touches about a page nobody could open. Cheap because it hits our
 * own preview host, not a provider.
 */
async function probePreview(url: string | null): Promise<PreviewProbe> {
  if (!url?.trim()) {
    return {
      url: null,
      state: "none",
      status: null,
      detail: "no preview assigned",
    };
  }
  const classified = classifyFetchUrl(url);
  if (!classified.ok || !classified.url) {
    return {
      url,
      state: "blocked",
      status: null,
      detail: classified.reason ?? "invalid URL",
    };
  }
  try {
    const response = await fetch(classified.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: { "user-agent": "WanderGrowth/1.0 (preview check)" },
    });
    return {
      url,
      state: response.ok ? "live" : "dead",
      status: response.status,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      url,
      state: "dead",
      status: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export const leadsRouter = createTRPCRouter({
  // High-level dashboard numbers.
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [totals] = await ctx.db
      .select({
        domains: sql<number>`count(*)::int`,
        builtwith: sql<number>`count(*) filter (where ${leadDomainTable.inBuiltwith})::int`,
        hubspot: sql<number>`count(*) filter (where ${leadDomainTable.inHubspot})::int`,
        instantly: sql<number>`count(*) filter (where ${leadDomainTable.inInstantly})::int`,
        integratedPms: sql<number>`count(*) filter (where ${leadDomainTable.isIntegratedPms})::int`,
        withPregenSite: sql<number>`count(*) filter (where ${leadDomainTable.pregenSiteUrl} is not null)::int`,
        // Expansion pool: known through BuiltWith, never in the CRM.
        untouched: sql<number>`count(*) filter (where ${leadDomainTable.inBuiltwith} and not ${leadDomainTable.inHubspot})::int`,
        ranked: sql<number>`count(*) filter (where ${leadDomainTable.scorePregenPotential} is not null)::int`,
        sendBatch: sql<number>`count(*) filter (where ${leadDomainTable.pregenBatch} is not null)::int`,
        // The batch being worked right now, counted on its own. Send-20 is
        // "any batch ever stamped", so it only grows; this is the one that
        // answers "what am I looking at today".
        currentBatch: sql<number>`count(*) filter (where ${leadDomainTable.pregenBatch} = ${CURRENT_PREGEN_BATCH})::int`,
      })
      .from(leadDomainTable);

    // Net-new sendable target — counted with the SAME exists() the list filter
    // uses. A correlated EXISTS folded into a multi-aggregate count(*) FILTER
    // renders unreliably under Drizzle (came back 0), so the pill badge and the
    // filtered list must share this exact predicate to stay in agreement.
    const [netNewRow] = await ctx.db
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
            ctx.db
              .select({ one: sql`1` })
              .from(leadContactTable)
              .where(
                and(
                  eq(leadContactTable.domainId, leadDomainTable.id),
                  isNull(leadContactTable.deletedAt),
                  // Same credible-contact rule as leadsSummary — a placeholder
                  // mailbox is not a contact. Three definitions of one number
                  // should not differ, even while they happen to agree at 19.
                  sql`lower(split_part(${leadContactTable.email}, '@', 2)) <> all(${PLACEHOLDER_EMAIL_DOMAINS_SQL})`,
                  sql`(${leadContactTable.firstName} is not null or ${leadContactTable.lastName} is not null or ${leadContactTable.email} !~* '@(gmail|yahoo|hotmail|aol|outlook|msn|icloud)\\.')`,
                ),
              ),
          ),
        ),
      );

    const [contacts] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadContactTable);

    const targetMemberships = await ctx.db
      .select({
        cohort: hubspotListMembershipTable.cohort,
        objectType: hubspotListMembershipTable.objectType,
        count: sql<number>`count(*)::int`,
        linked: sql<number>`count(*) filter (where ${hubspotListMembershipTable.domainId} is not null)::int`,
      })
      .from(hubspotListMembershipTable)
      .groupBy(
        hubspotListMembershipTable.cohort,
        hubspotListMembershipTable.objectType,
      );

    // The number that actually gates the pregen send motion: cohort companies
    // we could enroll today. A company counts only if it has a live contact
    // with an email, a HubSpot contact id to enroll against, and no mirrored
    // opt-out. Reviewing or building a site for anything else burns operator
    // attention and a paid site build on someone we cannot email.
    const targetEnrollableRows = await ctx.db.execute<{
      cohort: string;
      linked: number;
      enrollable: number;
    }>(sql`
      select
        membership.cohort as cohort,
        count(distinct membership.domain_id)::int as linked,
        count(distinct membership.domain_id) filter (
          where exists (
            select 1
            from leads.contact as contact
            where contact.domain_id = membership.domain_id
              and contact.deleted_at is null
              and nullif(btrim(contact.email), '') is not null
              and contact.hubspot_contact_id is not null
              and coalesce(contact.email_opt_out, false) = false
              and lower(split_part(contact.email, '@', 2)) <> all(${PLACEHOLDER_EMAIL_DOMAINS_SQL})
          )
        )::int as enrollable
      from leads.hubspot_list_membership as membership
      where membership.object_type = 'company'
        and membership.domain_id is not null
      group by membership.cohort
    `);

    const topPms = await ctx.db
      .select({
        pms: leadDomainTable.pms,
        count: sql<number>`count(*)::int`,
      })
      .from(leadDomainTable)
      .where(sql`${leadDomainTable.pms} is not null`)
      .groupBy(leadDomainTable.pms)
      .orderBy(desc(sql`count(*)`))
      .limit(12);

    const imports = await ctx.db
      .select()
      .from(leadImportTable)
      .orderBy(desc(leadImportTable.createdAt))
      .limit(10);

    return {
      ...totals,
      netNew: netNewRow?.count ?? 0,
      contacts: contacts?.count ?? 0,
      targetMemberships,
      targetEnrollable: targetEnrollableRows.rows.map((row) => ({
        cohort: row.cohort,
        linked: Number(row.linked),
        enrollable: Number(row.enrollable),
      })),
      topPms,
      imports,
    };
  }),

  // Paginated / filtered / sorted domain list.
  listDomains: protectedProcedure
    .input(
      z.object({
        q: z.string().trim().optional(),
        source: z.enum(["builtwith", "hubspot", "instantly"]).optional(),
        pms: z.string().optional(),
        hasPregenSite: z.boolean().optional(),
        integratedPmsOnly: z.boolean().optional(),
        pregenCohort: z.enum(["recycled", "untouched"]).optional(),
        // Members of EITHER pregen cohort — the active target list. Distinct
        // from pregenCohort, which narrows to one of them.
        inAnyCohort: z.boolean().optional(),
        // Net-new sendable target: not in CRM, ranked, credible contact.
        netNew: z.boolean().optional(),
        // the first cold-outbound test cohort (SEND_BATCH_1).
        sendBatch: z.boolean().optional(),
        // One named batch rather than "any batch" — what the current-batch pill
        // filters on, so its rows match its badge.
        pregenBatch: z.string().trim().min(1).optional(),
        // only companies with a live, emailable, HubSpot-enrollable contact.
        enrollableOnly: z.boolean().optional(),
        // owning BDR (resolved rep name as stored on the domain).
        owner: z.string().trim().min(1).optional(),
        minUnits: z.number().int().nonnegative().optional(),
        /**
         * Attach the review payload — scored channel and latest draft — for the
         * returned page. This is what lets one list render either compact rows
         * or review cards from a single filtered set, instead of /leads and
         * /leads/send-review being two surfaces over the same table that drift.
         */
        withReview: z.boolean().optional(),
        /**
         * The three review facets send-review used to own. `hasDraft` is a real
         * SQL predicate, so the pager stays exact. `verdict` and `route` come out
         * of `scoreLeadChannel`, which is application logic over contacts and the
         * captured channel — there is no SQL to count them by, so setting either
         * switches this query to send-review's proven shape: over-fetch a wider
         * window, filter it, and report `hasMore` instead of a total. A count that
         * disagreed with the rows on screen is the one outcome to avoid on a
         * surface people make send decisions from.
         */
        verdict: z.enum(["send", "review", "form", "skip"]).optional(),
        route: z.enum(["instantly", "form", "none"]).optional(),
        hasDraft: z.boolean().optional(),
        /**
         * Include companies flagged excludeFromOutreach. Off by default: 342 of
         * the 903 target-list domains are excluded, they average roughly five
         * times the units of the addressable ones, and the default sort is
         * units-descending — so leaving them in filled the top of the working
         * list with companies nobody may contact.
         */
        includeExcluded: z.boolean().optional(),
        sort: z
          .enum(["composite", "units", "domain", "updated"])
          .default("units"),
        dir: z.enum(["asc", "desc"]).default("desc"),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().nonnegative().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Everything except the exclusion rule, so the same predicate can answer
      // both "what can I work" and "how many am I not being shown".
      const conds: SQL[] = [];
      if (input.q) {
        conds.push(
          or(
            ilike(leadDomainTable.domain, `%${input.q}%`),
            ilike(leadDomainTable.companyName, `%${input.q}%`),
          )!,
        );
      }
      if (input.source) conds.push(eq(SOURCE_COLUMN[input.source], true));
      if (input.pms) conds.push(eq(leadDomainTable.pms, input.pms));
      if (input.hasPregenSite)
        conds.push(sql`${leadDomainTable.pregenSiteUrl} is not null`);
      if (input.integratedPmsOnly)
        conds.push(eq(leadDomainTable.isIntegratedPms, true));
      if (input.inAnyCohort) {
        conds.push(
          exists(
            ctx.db
              .select({ one: sql`1` })
              .from(hubspotListMembershipTable)
              .where(
                and(
                  eq(hubspotListMembershipTable.domainId, leadDomainTable.id),
                  eq(hubspotListMembershipTable.objectType, "company"),
                ),
              ),
          ),
        );
      }
      if (input.pregenCohort) {
        conds.push(
          exists(
            ctx.db
              .select({ one: sql`1` })
              .from(hubspotListMembershipTable)
              .where(
                and(
                  eq(hubspotListMembershipTable.domainId, leadDomainTable.id),
                  eq(hubspotListMembershipTable.objectType, "company"),
                  eq(hubspotListMembershipTable.cohort, input.pregenCohort),
                ),
              ),
          ),
        );
      }
      if (input.netNew) {
        // The "first send" cut: never entered the CRM, ranked by our own
        // qualification model, and has at least one credible contact.
        conds.push(
          eq(leadDomainTable.inHubspot, false),
          eq(leadDomainTable.hasHubspotDeal, false),
          eq(leadDomainTable.isExistingCustomer, false),
          eq(leadDomainTable.excludeFromOutreach, false),
          sql`${leadDomainTable.scorePregenPotential} is not null`,
          exists(
            ctx.db
              .select({ one: sql`1` })
              .from(leadContactTable)
              .where(
                and(
                  eq(leadContactTable.domainId, leadDomainTable.id),
                  isNull(leadContactTable.deletedAt),
                  // Same credible-contact rule as leadsSummary — a placeholder
                  // mailbox is not a contact. Three definitions of one number
                  // should not differ, even while they happen to agree at 19.
                  sql`lower(split_part(${leadContactTable.email}, '@', 2)) <> all(${PLACEHOLDER_EMAIL_DOMAINS_SQL})`,
                  sql`(${leadContactTable.firstName} is not null or ${leadContactTable.lastName} is not null or ${leadContactTable.email} !~* '@(gmail|yahoo|hotmail|aol|outlook|msn|icloud)\\.')`,
                ),
              ),
          ),
        );
      }
      // Any stamped pregen send batch. Replaces the hardcoded SEND_BATCH_1
      // domain array, which the comment there always said should be a column.
      if (input.sendBatch)
        conds.push(sql`${leadDomainTable.pregenBatch} is not null`);
      if (input.pregenBatch)
        conds.push(eq(leadDomainTable.pregenBatch, input.pregenBatch));
      if (input.minUnits != null)
        conds.push(gte(leadDomainTable.unitCount, input.minUnits));
      if (input.owner)
        conds.push(eq(leadDomainTable.hubspotOwner, input.owner));

      // Same definition as the enrollable counts in `stats` — keep them in step,
      // or the card promises a number the filtered list cannot produce.
      if (input.enrollableOnly)
        conds.push(sql`exists (
          select 1
          from leads.contact as enrollable_contact
          where enrollable_contact.domain_id = ${leadDomainTable.id}
            and enrollable_contact.deleted_at is null
            and nullif(btrim(enrollable_contact.email), '') is not null
            and enrollable_contact.hubspot_contact_id is not null
            and coalesce(enrollable_contact.email_opt_out, false) = false
            and lower(split_part(enrollable_contact.email, '@', 2)) <> all(${PLACEHOLDER_EMAIL_DOMAINS_SQL})
        )`);

      // Draft presence is a plain exists, so it narrows the count too.
      if (input.hasDraft != null) {
        const hasDraft = sql`exists (
          select 1 from leads.sequence as draft
          where draft.domain_id = ${leadDomainTable.id}
        )`;
        conds.push(input.hasDraft ? hasDraft : sql`not ${hasDraft}`);
      }

      const workableOnly = !input.includeExcluded;
      const where = and(
        ...conds,
        ...(workableOnly
          ? [eq(leadDomainTable.excludeFromOutreach, false)]
          : []),
      );
      // Verdict and route are only knowable after `scoreLeadChannel` runs over
      // the fetched page, which is what makes the pager inexact for them.
      const scoredFacet = input.verdict != null || input.route != null;
      const orderCol = SORTS[input.sort];
      // NULLs last for numeric sorts so scored/sized rows surface first.
      const orderBy =
        input.dir === "asc"
          ? [asc(orderCol)]
          : [sql`${orderCol} desc nulls last`];

      const items = await ctx.db
        .select({
          id: leadDomainTable.id,
          domain: leadDomainTable.domain,
          companyName: leadDomainTable.companyName,
          country: leadDomainTable.country,
          state: leadDomainTable.state,
          city: leadDomainTable.city,
          pms: leadDomainTable.pms,
          isIntegratedPms: leadDomainTable.isIntegratedPms,
          unitCount: leadDomainTable.unitCount,
          sourceTier: leadDomainTable.sourceTier,
          computedTier: leadDomainTable.computedTier,
          scoreComposite: leadDomainTable.scoreComposite,
          pregenSiteUrl: leadDomainTable.pregenSiteUrl,
          scorePregenPotential: leadDomainTable.scorePregenPotential,
          // Only the screenshot, not the whole enrichment blob — the row needs
          // one URL and enrichment carries every provider payload we hold.
          siteScreenshotUrl: sql<
            string | null
          >`${leadDomainTable.enrichment} -> 'leadRank' ->> 'screenshotUrl'`,
          siteRankOverall: sql<
            number | null
          >`(${leadDomainTable.enrichment} -> 'leadRank' ->> 'overall')::int`,
          // The durable before/after pair (R2-rehosted, capture[0] is the
          // desktop shot) — the ranker's own screenshotUrl above is a presigned
          // Firecrawl link that expires ~a week after scoring.
          captureTheirsUrl: sql<
            string | null
          >`${leadDomainTable.enrichment} -> 'previewVisual' -> 'theirs' -> 0 ->> 'screenshotUrl'`,
          captureOursUrl: sql<
            string | null
          >`${leadDomainTable.enrichment} -> 'previewVisual' -> 'ours' -> 0 ->> 'screenshotUrl'`,
          pregenStatus: leadDomainTable.pregenStatus,
          hubspotLeadStatus: leadDomainTable.hubspotLeadStatus,
          // The send-review surface filtered these out entirely. Carrying them
          // instead means a review card can say "excluded" rather than looking
          // sendable — realjoy.com rendered as "send · 85" with a live deal.
          excludeFromOutreach: leadDomainTable.excludeFromOutreach,
          excludeReason: leadDomainTable.excludeReason,
          inBuiltwith: leadDomainTable.inBuiltwith,
          inHubspot: leadDomainTable.inHubspot,
          inPregen: leadDomainTable.inPregen,
          inInstantly: leadDomainTable.inInstantly,
        })
        .from(leadDomainTable)
        .where(where)
        .orderBy(...orderBy)
        // A computed facet is applied after the scorer runs, so fetch a wider
        // window to filter down from. Same 4×-capped-at-200 window send-review
        // used, so consolidating does not change which rows a reviewer sees.
        .limit(scoredFacet ? Math.min(input.limit * 4, 200) : input.limit)
        .offset(input.offset);

      const [totalRow] = await ctx.db
        .select({ total: sql<number>`count(*)::int` })
        .from(leadDomainTable)
        .where(where);
      const total = totalRow?.total ?? 0;

      // How many the exclusion filter is holding back under the same population
      // and facets, so the toggle can name a number instead of hiding one.
      const [excludedRow] = workableOnly
        ? await ctx.db
            .select({ count: sql<number>`count(*)::int` })
            .from(leadDomainTable)
            .where(and(...conds, eq(leadDomainTable.excludeFromOutreach, true)))
        : [{ count: 0 }];

      // Contact counts for this page — a separate grouped query, NOT a correlated
      // subquery in the select (those render unreliably here; see the netNew fix).
      const ids = items.map((i) => i.id);
      const counts = ids.length
        ? await ctx.db
            .select({
              domainId: leadContactTable.domainId,
              n: sql<number>`count(*)::int`,
            })
            .from(leadContactTable)
            .where(
              and(
                inArray(leadContactTable.domainId, ids),
                isNull(leadContactTable.deletedAt),
              ),
            )
            .groupBy(leadContactTable.domainId)
        : [];
      const countMap = new Map(counts.map((c) => [c.domainId, c.n]));

      const cohortRows = ids.length
        ? await ctx.db
            .select({
              domainId: hubspotListMembershipTable.domainId,
              cohort: hubspotListMembershipTable.cohort,
            })
            .from(hubspotListMembershipTable)
            .where(
              and(
                inArray(hubspotListMembershipTable.domainId, ids),
                eq(hubspotListMembershipTable.objectType, "company"),
              ),
            )
        : [];
      const cohortsByDomain = new Map<string, Set<string>>();
      for (const row of cohortRows) {
        if (!row.domainId) continue;
        const cohorts = cohortsByDomain.get(row.domainId) ?? new Set<string>();
        cohorts.add(row.cohort);
        cohortsByDomain.set(row.domainId, cohorts);
      }

      // Review payload for this page only — three grouped queries plus the same
      // scorer the send-review surface uses, so a card here and a card there
      // cannot disagree about who is reachable.
      const review = input.withReview
        ? await (async () => {
            if (!ids.length) return null;
            const [
              reviewContacts,
              outreachRows,
              channelRows,
              domainEnrichment,
            ] = await Promise.all([
              ctx.db
                .select({
                  id: leadContactTable.id,
                  domainId: leadContactTable.domainId,
                  email: leadContactTable.email,
                  firstName: leadContactTable.firstName,
                  lastName: leadContactTable.lastName,
                  jobTitle: leadContactTable.jobTitle,
                  verificationStatus: leadContactTable.verificationStatus,
                  retiredAt: leadContactTable.retiredAt,
                  retiredReason: leadContactTable.retiredReason,
                  verification: leadContactTable.verification,
                })
                .from(leadContactTable)
                .where(
                  and(
                    inArray(leadContactTable.domainId, ids),
                    isNull(leadContactTable.deletedAt),
                  ),
                ),
              ctx.db
                .select()
                .from(leadSequenceTable)
                .where(inArray(leadSequenceTable.domainId, ids))
                .orderBy(desc(leadSequenceTable.createdAt)),
              ctx.db
                .select({
                  domainId: leadChannelTable.domainId,
                  kind: leadChannelTable.kind,
                  value: leadChannelTable.value,
                  deliveryState: leadChannelTable.deliveryState,
                })
                .from(leadChannelTable)
                .where(
                  and(
                    inArray(leadChannelTable.domainId, ids),
                    isNull(leadChannelTable.deletedAt),
                  ),
                ),
              ctx.db
                .select({
                  id: leadDomainTable.id,
                  enrichment: leadDomainTable.enrichment,
                })
                .from(leadDomainTable)
                .where(inArray(leadDomainTable.id, ids)),
            ]);

            const contactsByDomain = new Map<string, StoredLeadContact[]>();
            for (const contact of reviewContacts) {
              const list = contactsByDomain.get(contact.domainId) ?? [];
              list.push(contact);
              contactsByDomain.set(contact.domainId, list);
            }
            const latestOutreach = new Map<
              string,
              (typeof outreachRows)[number]
            >();
            for (const row of outreachRows) {
              if (!latestOutreach.has(row.domainId))
                latestOutreach.set(row.domainId, row);
            }
            const channelsByDomain = new Map<
              string,
              (typeof channelRows)[number][]
            >();
            for (const row of channelRows) {
              const list = channelsByDomain.get(row.domainId) ?? [];
              list.push(row);
              channelsByDomain.set(row.domainId, list);
            }
            const enrichmentById = new Map(
              domainEnrichment.map((row) => [row.id, row.enrichment]),
            );

            return new Map(
              ids.map((id) => [
                id,
                {
                  channel: scoreLeadChannel({
                    domain: items.find((i) => i.id === id)!.domain,
                    contactChannel: parseContactChannel(
                      (
                        enrichmentById.get(id) as {
                          contactChannel?: unknown;
                        } | null
                      )?.contactChannel,
                    ),
                    contacts: contactsByDomain.get(id) ?? [],
                    // Already on the row. Reading it live would be two HubSpot
                    // calls per lead, which is why the card used to rank blind
                    // to who we have actually spoken to.
                    historyMentions: storedContactMentions(
                      enrichmentById.get(id),
                    ),
                  }),
                  channels: channelsByDomain.get(id) ?? [],
                  outreach: latestOutreach.get(id) ?? null,
                },
              ]),
            );
          })()
        : null;

      const rows = items.map((i) => ({
        ...i,
        contactCount: countMap.get(i.id) ?? 0,
        pregenCohorts: [...(cohortsByDomain.get(i.id) ?? [])].sort(),
        review: review?.get(i.id) ?? null,
      }));

      // Scored facets narrow the fetched window rather than the query, so they
      // are applied here and the window is then cut back to the asked-for page.
      const filtered = scoredFacet
        ? rows.filter(
            (row) =>
              (!input.verdict ||
                row.review?.channel.verdict === input.verdict) &&
              (!input.route || row.review?.channel.route === input.route),
          )
        : rows;

      return {
        items: scoredFacet ? filtered.slice(0, input.limit) : filtered,
        // Null rather than a number the list cannot account for: with a scored
        // facet on, the only honest count is the one the UI can see.
        total: scoredFacet ? null : total,
        excludedHeld: excludedRow?.count ?? 0,
        hasMore: scoredFacet
          ? items.length === Math.min(input.limit * 4, 200)
          : input.offset + items.length < total,
      };
    }),

  // Single domain + its contacts (detail drawer).
  getDomain: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const domain = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.id, input.id),
      });
      if (!domain) return null;
      const contacts = await ctx.db
        .select()
        .from(leadContactTable)
        .where(eq(leadContactTable.domainId, input.id))
        .orderBy(asc(leadContactTable.email))
        .limit(200);
      const [outreach] = await ctx.db
        .select()
        .from(leadSequenceTable)
        .where(eq(leadSequenceTable.domainId, input.id))
        .orderBy(desc(leadSequenceTable.createdAt))
        .limit(1);
      const channels = await ctx.db
        .select()
        .from(leadChannelTable)
        .where(
          and(
            eq(leadChannelTable.domainId, input.id),
            isNull(leadChannelTable.deletedAt),
          ),
        )
        .orderBy(asc(leadChannelTable.kind));
      return { domain, contacts, outreach: outreach ?? null, channels };
    }),

  /**
   * One prospect, addressed by domain rather than id so the URL is shareable and
   * page-context can resolve "this prospect" in chat.
   *
   * Carries the two things the list card could not show, both of which decided
   * whether a draft was sendable: whether the assigned preview actually resolves,
   * and which contacts are undeliverable placeholders. Deliberately excludes live
   * HubSpot correspondence — see `crmHistory`.
   */
  prospect: protectedProcedure
    .input(z.object({ domain: z.string().trim().min(3) }))
    .query(async ({ ctx, input }) => {
      const domain = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.domain, input.domain.toLowerCase()),
      });
      if (!domain) return null;

      const [contacts, channels, outreachRows, memberships, brandRows] =
        await Promise.all([
          ctx.db
            .select({
              id: leadContactTable.id,
              email: leadContactTable.email,
              firstName: leadContactTable.firstName,
              lastName: leadContactTable.lastName,
              jobTitle: leadContactTable.jobTitle,
              verificationStatus: leadContactTable.verificationStatus,
              retiredAt: leadContactTable.retiredAt,
              retiredReason: leadContactTable.retiredReason,
              verification: leadContactTable.verification,
              hubspotContactId: leadContactTable.hubspotContactId,
              emailOptOut: leadContactTable.emailOptOut,
            })
            .from(leadContactTable)
            .where(
              and(
                eq(leadContactTable.domainId, domain.id),
                isNull(leadContactTable.deletedAt),
              ),
            )
            .orderBy(asc(leadContactTable.email))
            .limit(200),
          ctx.db
            .select()
            .from(leadChannelTable)
            .where(
              and(
                eq(leadChannelTable.domainId, domain.id),
                isNull(leadChannelTable.deletedAt),
              ),
            )
            .orderBy(asc(leadChannelTable.kind)),
          ctx.db
            .select()
            .from(leadSequenceTable)
            .where(eq(leadSequenceTable.domainId, domain.id))
            .orderBy(desc(leadSequenceTable.createdAt))
            .limit(5),
          ctx.db
            .select({ cohort: hubspotListMembershipTable.cohort })
            .from(hubspotListMembershipTable)
            .where(
              and(
                eq(hubspotListMembershipTable.domainId, domain.id),
                eq(hubspotListMembershipTable.objectType, "company"),
              ),
            )
            .limit(1),
          // The prospect brand, if a rep already made one. Read here because
          // the detail view's own button state was derived from the create
          // mutation's result — client state that a reload throws away, so a
          // brand that plainly existed showed as "Create prospect brand"
          // again. The database is the only thing that knows.
          ctx.db
            .select({
              id: brandTable.id,
              slug: brandTable.slug,
              name: brandTable.name,
              website: brandTable.website,
              logo: brandTable.logo,
              tagline: brandTable.tagline,
              websiteMeta: brandTable.websiteMeta,
            })
            .from(brandTable)
            .where(
              and(
                eq(brandTable.leadDomain, domain.domain),
                isNull(brandTable.deletedAt),
              ),
            )
            .limit(1),
        ]);

      const channel = scoreLeadChannel({
        domain: domain.domain,
        contactChannel: parseContactChannel(
          (domain.enrichment as { contactChannel?: unknown } | null)
            ?.contactChannel,
        ),
        contacts,
        historyMentions: storedContactMentions(domain.enrichment),
      });

      return {
        domain,
        cohort: memberships[0]?.cohort ?? null,
        channel,
        channels,
        contacts,
        outreach: outreachRows[0] ?? null,
        outreachHistory: outreachRows,
        brand: brandRows[0]
          ? {
              ...brandRows[0],
              // What `brand.enrich` fills in. Surfaced so the view can offer a
              // re-run: enrichment only fires automatically on the call that
              // creates the brand, so a brand that already existed never got
              // scraped at all.
              enriched: Boolean(
                brandRows[0].logo ??
                brandRows[0].tagline ??
                brandRows[0].websiteMeta,
              ),
            }
          : null,
        // Probing our own preview host, not a provider — cheap enough to do on
        // load, and it is the fact that gates the Generate button.
        preview: await probePreview(domain.pregenSiteUrl),
      };
    }),

  /**
   * Live HubSpot correspondence for one company, fetched only when asked.
   *
   * Deliberately not part of `prospect`: browsing prospects would issue a
   * HubSpot read per view, and these endpoints already 429 under bulk load
   * (7290223). For "what did the copy get written from", read the draft's
   * generationContext instead — that is the snapshot, this is the current state.
   */
  crmHistory: protectedProcedure
    .input(z.object({ domain: z.string().trim().min(3) }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.domain, input.domain.toLowerCase()),
        columns: { hubspotRecordId: true, domain: true },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (!isHubspotConfigured) {
        return { available: false as const, reason: "HubSpot not configured" };
      }
      const company =
        row.hubspotRecordId != null
          ? { id: row.hubspotRecordId }
          : await findCompanyByDomain(row.domain);
      if (!company) {
        return {
          available: false as const,
          reason: "no linked HubSpot company",
        };
      }
      const [emails, activity] = await Promise.all([
        readHubspotCompanyEmailHistory(company.id, {
          limit: 100,
          maxBodyCharacters: 1_600,
        }),
        readHubspotCompanyActivityHistory(company.id, {
          limit: 40,
          maxBodyCharacters: 1_200,
        }),
      ]);
      return {
        available: true as const,
        companyId: company.id,
        emails,
        activity,
      };
    }),

  /**
   * Rank one prospect on demand.
   *
   * rankLeadDomain has been ready for this since it was written — its script
   * header says "thin on purpose ... so the same call can back an API route
   * later" — but ranking stayed script-only, so the two halves of the workflow
   * lived in different places: generation had a button and ranking had a
   * terminal. 203 domains carry a score and only 5 came from the current ranker.
   */
  /**
   * Ask WanderOS to build a pregen site for this prospect.
   *
   * Returns once the prospect record exists. The build is async and reports back
   * over /api/webhooks/pregen; the returned status means "accepted", not "built".
   */
  /**
   * Turn a row in the mirror into a prospect brand a rep can pitch.
   *
   * The mirror is 200k+ rows of census data and stays that way; this is the
   * point a human decides one of them is worth a pitch page, a strategy, and
   * eventually a campaign. Returns `enrichable` so the caller can run the
   * website scrape as its own call and show it happening.
   */
  createProspect: protectedProcedure
    .input(z.object({ domainId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.query.memberTable.findFirst({
        where: eq(memberTable.userId, ctx.session.user.id),
        columns: { organizationId: true },
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must belong to an organization to create a prospect",
        });
      }

      const { brand, created } = await createProspectFromLead({
        organizationId: membership.organizationId,
        ownerId: ctx.session.user.id,
        domainId: input.domainId,
      });

      // Enrichment is the caller's second call rather than a background task
      // here: a scrape that finishes after the response can only be seen by
      // reloading, and the rep is looking at the button they just pressed.
      return {
        brandId: brand.id,
        slug: brand.slug,
        name: brand.name,
        created,
        enrichable: created && Boolean(brand.website),
      };
    }),

  requestPregenSite: protectedProcedure
    .input(z.object({ domainId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isWanderApiConfigured) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "The WanderOS API is not configured yet. Set WANDER_API_URL and WANDER_API_KEY.",
        });
      }
      const row = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.id, input.domainId),
      });
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Domain not in DB" });
      // Same suppression rule as generation. Building a preview for a company a
      // rep is already working spends a build and invites the send it exists for.
      if (row.excludeFromOutreach) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${row.domain} is excluded from outreach${row.excludeReason ? ` (${row.excludeReason})` : ""}.`,
        });
      }
      const inFlight = await ctx.db.query.pregenBuildTable.findFirst({
        where: and(
          eq(pregenBuildTable.domainId, row.id),
          isNull(pregenBuildTable.settledAt),
        ),
      });
      if (inFlight) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A build for ${row.domain} is already in flight (${inFlight.status ?? "requested"}).`,
        });
      }

      const sourceUrl = `https://${row.domain}`;
      const prospect = await createWebsiteProspect({
        businessName: row.companyName ?? row.domain,
        sourceUrl,
      });

      // The in-flight check above is a read-then-write, so it cannot hold under
      // concurrency: two calls 197ms apart both read "nothing in flight", both
      // asked WanderOS (which is idempotent per source URL and handed back the
      // SAME prospect), and the second insert died on the unique prospect_id
      // index — a raw Postgres error surfaced to the operator for a build that
      // had in fact started. That index is the only real serialization point, so
      // treat a collision as what it is: this prospect already has a build row.
      const [build] = await ctx.db
        .insert(pregenBuildTable)
        .values({
          domainId: row.id,
          domain: row.domain,
          prospectId: prospect.id,
          websiteId: prospect.websiteId,
          previewToken: prospect.previewToken ?? null,
          businessName: row.companyName ?? row.domain,
          sourceUrl,
          status: prospect.status,
          previewUrl: prospect.previewUrl ?? null,
        })
        .onConflictDoNothing({ target: pregenBuildTable.prospectId })
        .returning();
      if (build) return build;

      const [existing] = await ctx.db
        .select()
        .from(pregenBuildTable)
        .where(eq(pregenBuildTable.prospectId, prospect.id))
        .limit(1);
      return existing ?? null;
    }),

  /**
   * Builds that have been asked for and have not settled.
   *
   * A build takes ~18 minutes on the monolith and the only delivery path is a
   * webhook, so without this the operator asks for one, the card goes quiet, and
   * nothing on the page says work is happening. Cheap enough to poll: one
   * indexed read over a table that holds tens of rows.
   */
  pregenBuildsInFlight: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: pregenBuildTable.id,
        domain: pregenBuildTable.domain,
        status: pregenBuildTable.status,
        requestedAt: pregenBuildTable.requestedAt,
        previewUrl: pregenBuildTable.previewUrl,
      })
      .from(pregenBuildTable)
      .where(isNull(pregenBuildTable.settledAt))
      .orderBy(desc(pregenBuildTable.requestedAt))
      .limit(25);
  }),

  /**
   * Pull current state for this prospect's latest build.
   *
   * On demand only. The webhook is the delivery path and there is no reconcile
   * sweep behind it, so this exists to unstick a build whose event was dropped —
   * a button someone presses, not a loop. WanderOS exposes list rather than
   * get-by-id, so this filters the list on our stored prospectId.
   */
  refreshPregenSite: protectedProcedure
    .input(z.object({ domainId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isWanderApiConfigured) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The WanderOS API is not configured yet.",
        });
      }
      const [build] = await ctx.db
        .select()
        .from(pregenBuildTable)
        .where(eq(pregenBuildTable.domainId, input.domainId))
        .orderBy(desc(pregenBuildTable.requestedAt))
        .limit(1);
      if (!build?.prospectId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No pregen build has been requested for this domain.",
        });
      }

      // Narrow by the status we last saw where we can: the list is paginated at
      // 100 and there is no get-by-id route, so an unfiltered walk gets slower
      // as the prospect table grows.
      const { prospects } = await listWebsiteProspects({ take: 100 });
      const current = prospects.find(
        (prospect) => prospect.id === build.prospectId,
      );
      if (!current) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `WanderOS no longer lists prospect ${build.prospectId}.`,
        });
      }

      const settled = SETTLED_PROSPECT_STATUSES.includes(current.status);
      await ctx.db
        .update(pregenBuildTable)
        .set({
          status: current.status,
          websiteId: current.websiteId ?? build.websiteId,
          previewUrl: current.previewUrl ?? build.previewUrl,
          errorMessage: current.errorMessage ?? null,
          settledAt: settled
            ? (build.settledAt ?? new Date())
            : build.settledAt,
          claimedAt:
            current.status === "CLAIMED"
              ? (build.claimedAt ?? new Date())
              : build.claimedAt,
        })
        .where(eq(pregenBuildTable.id, build.id));

      if (current.previewUrl) {
        await ctx.db
          .update(leadDomainTable)
          .set({ pregenSiteUrl: current.previewUrl })
          .where(eq(leadDomainTable.id, input.domainId));
      }
      return { status: current.status, previewUrl: current.previewUrl ?? null };
    }),

  rankDomain: protectedProcedure
    .input(
      z.object({
        domain: z.string().trim().min(3),
        // Off means score it and show the result without writing.
        persist: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await rankLeadDomain(input.domain.toLowerCase(), {
          persist: input.persist,
        });
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }),

  // Shoot the preview WE built, so the review surface can show its before/after
  // side by side instead of a badge next to a link. Manual rather than automatic:
  // a capture costs two Firecrawl scrapes, and the answer only matters when a
  // human is about to look at this prospect.
  capturePreview: protectedProcedure
    .input(z.object({ domain: z.string().trim().min(3) }))
    .mutation(async ({ input }) => {
      try {
        return await capturePreviewVisual(input.domain.toLowerCase());
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }),

  // The reconcile the webhook contract always assumed. Delivery is
  // fire-and-forget with no retry by agreement, so a lost event strands a
  // build row in GENERATING forever — benchmark30a sat "Building" for 23h
  // while staging had settled it READY within twenty minutes. This re-reads
  // WanderOS and settles the row from the source of truth. A prospect the
  // configured WanderOS has never heard of is an orphan (typically: created
  // against staging before the prod cutover) and settles FAILED so the Build
  // button comes back.
  refreshPregenBuild: protectedProcedure
    .input(z.object({ buildId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const build = await ctx.db.query.pregenBuildTable.findFirst({
        where: eq(pregenBuildTable.id, input.buildId),
      });
      if (!build?.prospectId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No build to refresh",
        });
      }
      if (!isWanderApiConfigured) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The WanderOS API is not configured.",
        });
      }

      const { prospects } = await listWebsiteProspects({ take: 100 });
      const current = prospects.find((p) => p.id === build.prospectId);
      const now = new Date();

      if (!current) {
        await ctx.db
          .update(pregenBuildTable)
          .set({
            status: "FAILED",
            errorMessage:
              "Orphaned: the configured WanderOS has no such prospect (likely built on staging before the prod cutover).",
            lastEventAt: now,
            settledAt: now,
          })
          .where(eq(pregenBuildTable.id, build.id));
        if (build.previewUrl) {
          await ctx.db
            .update(leadDomainTable)
            .set({ pregenSiteUrl: null })
            .where(
              and(
                eq(leadDomainTable.id, build.domainId),
                eq(leadDomainTable.pregenSiteUrl, build.previewUrl),
              ),
            );
        }
        return { outcome: "orphaned" as const };
      }

      const settled = SETTLED_PROSPECT_STATUSES.includes(current.status);
      await ctx.db
        .update(pregenBuildTable)
        .set({
          status: current.status,
          previewUrl: current.previewUrl ?? build.previewUrl,
          errorMessage: current.errorMessage ?? null,
          lastEventAt: now,
          settledAt: settled ? (build.settledAt ?? now) : build.settledAt,
        })
        .where(eq(pregenBuildTable.id, build.id));

      // Mirror the webhook's promotion rules: READY fills the lead's preview,
      // FAILED clears a dead one.
      if (current.status === "READY" && current.previewUrl) {
        await ctx.db
          .update(leadDomainTable)
          .set({ pregenSiteUrl: current.previewUrl })
          .where(
            and(
              eq(leadDomainTable.id, build.domainId),
              or(
                isNull(leadDomainTable.pregenSiteUrl),
                eq(leadDomainTable.pregenSiteUrl, current.previewUrl),
                eq(leadDomainTable.pregenSiteUrl, ""),
              ),
            ),
          );
      } else if (current.status === "FAILED" && build.previewUrl) {
        await ctx.db
          .update(leadDomainTable)
          .set({ pregenSiteUrl: null })
          .where(
            and(
              eq(leadDomainTable.id, build.domainId),
              eq(leadDomainTable.pregenSiteUrl, build.previewUrl),
            ),
          );
      }
      return { outcome: "updated" as const, status: current.status };
    }),

  // ---- Manual enrichment (inspect-only; no DB write yet) ----

  // Discovery only — raw, fault-tolerant fan-out across search/scrape providers.
  discover: protectedProcedure
    .input(
      z.object({
        domain: z.string().trim().min(1),
        only: z
          .array(
            z.enum(["firecrawl", "perplexity", "tavily", "parallel", "exa"]),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return discoverDomain(input.domain, { only: input.only });
    }),

  // Full enrich: discover → AI extraction. Returns BOTH for side-by-side review.
  enrich: protectedProcedure
    .input(z.object({ domain: z.string().trim().min(1) }))
    .mutation(async ({ input }) => {
      const discovery = await discoverDomain(input.domain);
      const extraction = await extractFromDiscovery(discovery);
      return { discovery, extraction };
    }),

  // Generate a bespoke, personalized cold sequence for ONE lead from its
  // enrichment + the WanderOS hook strategy. Stored as a DRAFT on
  // enrichment.outreachDraft for human review before it's ever sent.
  // Generate the HubSpot pregen motion from live company correspondence,
  // current website evidence, and the assigned preview. The prose is split
  // into reliable HubSpot paragraph slots, but the stored review shows the
  // complete rendered emails.
  generatePregenOutreach: protectedProcedure
    .input(
      z.object({
        domainId: z.string(),
        // Optional: the cohort already knows which motion applies, so callers
        // only pass this to override.
        motion: PregenMotionSchema.optional(),
        previewUrl: z.url().optional(),
        steer: z.string().trim().max(2000).optional(),
        /**
         * Iterate on copy before a real preview exists. The draft is marked and
         * publishing refuses it — see the service for why this is a separate
         * workflow rather than a relaxed guard.
         */
        pretend: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Every guard that decides whether copy is publishable lives in the
      // service, so the batch job and this button cannot answer differently.
      try {
        return await generateAndStoreSequence(input.domainId, {
          motion: input.motion,
          previewUrl: input.previewUrl,
          steer: input.steer,
          pretend: input.pretend,
        });
      } catch (error) {
        // Exclusion and an unreadable preview are operator-actionable refusals,
        // not faults — surface the reason on the button rather than a 500.
        if (error instanceof PregenPreconditionError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        throw error;
      }
    }),
  // Human approval boundary: copy the latest reviewed pregen draft into one
  // associated HubSpot contact. This does not enroll the contact.
  /**
   * Start the HubSpot sequence for one lead.
   *
   * This is the only place in Growth that causes mail to leave a mailbox, so it
   * is the place the pre-send conditions become binding rather than advisory.
   * Every refusal below was a thing a reviewer previously had to remember.
   *
   * HubSpot is asked whether the contact is already enrolled before we look at
   * our own ledger, because a rep can enrol from the CRM and Growth would never
   * hear about it. Our row is written after, so the lead page can answer
   * "already in flight" without a provider round trip.
   */
  startPregenSequence: protectedProcedure
    .input(
      z.object({
        domainId: z.string(),
        contactId: z.string(),
        /** Connected inbox the sequence sends from; becomes the From address. */
        senderEmail: z.string().email(),
        sequenceId: z.string().default(PREGEN_SEQUENCE_ID),
        /** Tick to send despite non-blocking warnings (stale preview, etc). */
        acknowledgeWarnings: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isHubspotSequencesConfigured) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "HubSpot is not configured",
        });
      }

      const row = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.id, input.domainId),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const contact = await ctx.db.query.leadContactTable.findFirst({
        where: and(
          eq(leadContactTable.id, input.contactId),
          eq(leadContactTable.domainId, input.domainId),
          isNull(leadContactTable.deletedAt),
        ),
      });

      // Hard refusals. Each one is a send that should never happen, so none of
      // them are overridable by acknowledgeWarnings.
      const refusals: string[] = [];
      if (row.excludeFromOutreach) {
        refusals.push(
          `${row.domain} is excluded from outreach${row.excludeReason ? `: ${row.excludeReason}` : ""}`,
        );
      }
      if (!contact) refusals.push("That contact is not on this domain");
      if (contact && !contact.hubspotContactId) {
        refusals.push(`${contact.email} is not linked to a HubSpot contact`);
      }
      if (contact?.emailOptOut) {
        refusals.push(`${contact.email} has opted out of email`);
      }
      if (contact && isPlaceholderEmail(contact.email)) {
        refusals.push(`${contact.email} is a placeholder address`);
      }
      if (!row.pregenSiteUrl) {
        refusals.push("No preview has been built for this company");
      }
      if (refusals.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: refusals.join("; "),
        });
      }

      // The copy is company-level, so the greeting is the only per-person part.
      //
      // A missing first name is not a warning: the token carries a "there"
      // fallback in HubSpot, so a generic inbox greets correctly on its own.
      // What the fallback cannot save is a first name that is really the
      // company name, because the field is populated and HubSpot renders it —
      // "Hi Bolewood Capital," is the most visible way this motion can look
      // automated. Clearing the first name is the fix, not acknowledging it.
      const warnings: string[] = [];
      const firstName = contact!.firstName?.trim() ?? "";
      if (
        firstName &&
        firstName.toLowerCase() === row.companyName?.trim().toLowerCase()
      ) {
        warnings.push(
          `${contact!.email} has the company name in its first-name field, so the greeting will read "Hi ${firstName},". Clear the first name in HubSpot to get "Hi there," instead`,
        );
      }
      if (warnings.length && !input.acknowledgeWarnings) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${warnings.join("; ")}. Re-run with acknowledgeWarnings to send anyway.`,
        });
      }

      // One person per company at a time. Two colleagues receiving the same
      // "we rebuilt your website" mail on the same morning is the version of
      // this motion that reads as a blast, and the per-contact check below
      // cannot see it because it only ever looks at the contact being enrolled.
      // Retire the current recipient (see `retireLeadContact`) to hand the
      // company to the next candidate.
      const [inFlight] = await ctx.db
        .select({
          email: leadContactTable.email,
          enrolledAt: leadSequenceTable.enrolledAt,
        })
        .from(leadSequenceTable)
        .innerJoin(
          leadContactTable,
          eq(leadContactTable.id, leadSequenceTable.contactId),
        )
        .where(
          and(
            eq(leadSequenceTable.domainId, input.domainId),
            eq(leadSequenceTable.status, "sent"),
            ne(leadContactTable.id, contact!.id),
            isNull(leadContactTable.retiredAt),
          ),
        )
        .limit(1);
      if (inFlight) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${inFlight.email} at ${row.domain} is already in the sequence${
            inFlight.enrolledAt
              ? ` (enrolled ${inFlight.enrolledAt.toISOString().slice(0, 10)})`
              : ""
          }. Retire that contact before enrolling someone else here.`,
        });
      }

      // Ask the provider first: a rep may have enrolled from the CRM.
      const existing = await getContactEnrollment(contact!.hubspotContactId!);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${contact!.email} is already in "${existing.sequenceName}", enrolled ${existing.enrolledAt.slice(0, 10)} by ${existing.enrolledByEmail}`,
        });
      }

      const enrollment = await enrollContactInSequence({
        hubspotContactId: contact!.hubspotContactId!,
        sequenceId: input.sequenceId,
        senderEmail: input.senderEmail,
        userId: PREGEN_SEQUENCE_SENDER_USER_ID,
      });

      // Only an unsent row may be claimed. Taking the newest row unconditionally
      // meant a second enrolment — the one that follows retiring a bounced
      // recipient — overwrote the first send's enrollment id and date, which is
      // the audit trail the rest of this depends on. A retired recipient's row
      // is already `skipped` by then, so a fresh row is what gets written and
      // the partial unique index on live rows still holds.
      const ledger = {
        status: "sent" as const,
        contactId: contact!.id,
        hubspotSequenceId: input.sequenceId,
        hubspotEnrollmentId: enrollment.id,
        enrolledAt: new Date(enrollment.enrolledAt),
        enrolledByEmail: enrollment.enrolledByEmail,
        sentAt: new Date(enrollment.enrolledAt),
      };
      const [claimable] = await ctx.db
        .select()
        .from(leadSequenceTable)
        .where(
          and(
            eq(leadSequenceTable.domainId, input.domainId),
            inArray(leadSequenceTable.status, ["draft", "approved"]),
          ),
        )
        .orderBy(desc(leadSequenceTable.createdAt))
        .limit(1);

      if (claimable) {
        await ctx.db
          .update(leadSequenceTable)
          .set(ledger)
          .where(eq(leadSequenceTable.id, claimable.id));
      } else {
        // Carry the copy over from whatever was drafted last, so the second
        // recipient's row still shows what they were sent.
        const [previous] = await ctx.db
          .select()
          .from(leadSequenceTable)
          .where(eq(leadSequenceTable.domainId, input.domainId))
          .orderBy(desc(leadSequenceTable.createdAt))
          .limit(1);
        await ctx.db.insert(leadSequenceTable).values({
          domainId: input.domainId,
          domain: row.domain,
          angle: previous?.angle,
          personalizedOn: previous?.personalizedOn,
          steps: previous?.steps,
          model: previous?.model,
          generationContext: previous?.generationContext,
          ...ledger,
        });
      }

      return {
        enrollmentId: enrollment.id,
        sequenceName: enrollment.sequenceName,
        toEmail: enrollment.toEmail,
        enrolledByEmail: enrollment.enrolledByEmail,
        warnings,
      };
    }),

  /**
   * Take one person out of rotation, so the company falls to the next
   * candidate.
   *
   * The case this exists for is a bounce: the send went to the best address we
   * had, it failed, and the company is otherwise still worth writing to. That
   * needs to be one click and reversible, because the alternative a reviewer
   * reaches for is deleting the contact, which loses the evidence of why we
   * stopped writing to them.
   */
  retireLeadContact: protectedProcedure
    .input(
      z.object({
        contactId: z.string(),
        reason: z.string().trim().min(1).max(200),
        /** Put them back in rotation; `reason` is kept for the audit trail. */
        undo: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(leadContactTable)
        .set(
          input.undo
            ? { retiredAt: null, retiredReason: null }
            : { retiredAt: new Date(), retiredReason: input.reason },
        )
        .where(eq(leadContactTable.id, input.contactId))
        .returning({
          id: leadContactTable.id,
          email: leadContactTable.email,
          retiredAt: leadContactTable.retiredAt,
        });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });

      // Close out their live sequence row. Without this the partial unique
      // index on `(domainId) where status in ('queued','sent')` blocks the next
      // recipient, so retiring would free the guard and still not free the
      // company. `skipped` keeps the enrollment id and dates, so what was sent
      // to them stays readable.
      const closed = input.undo
        ? []
        : await ctx.db
            .update(leadSequenceTable)
            .set({ status: "skipped" })
            .where(
              and(
                eq(leadSequenceTable.contactId, input.contactId),
                inArray(leadSequenceTable.status, ["queued", "sent"]),
              ),
            )
            .returning({ id: leadSequenceTable.id });

      return { ...updated, closedSequences: closed.length };
    }),

  publishPregenOutreach: protectedProcedure
    .input(
      z.object({
        domainId: z.string(),
        contactId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.id, input.domainId),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Domain not in DB" });
      }
      // A missing preview no longer blocks — refusing here made the publish path
      // untestable until hosting existed, which is the one thing this motion has
      // been waiting on. The URL comes off the draft below, which records the
      // exact address the copy was written against, real or stand-in.
      const contact = await ctx.db.query.leadContactTable.findFirst({
        where: and(
          eq(leadContactTable.id, input.contactId),
          eq(leadContactTable.domainId, input.domainId),
          isNull(leadContactTable.deletedAt),
        ),
      });
      if (!contact?.hubspotContactId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Choose a contact linked to HubSpot",
        });
      }
      const [outreach] = await ctx.db
        .select()
        .from(leadSequenceTable)
        .where(
          and(
            eq(leadSequenceTable.domainId, input.domainId),
            eq(leadSequenceTable.status, "draft"),
          ),
        )
        .orderBy(desc(leadSequenceTable.createdAt))
        .limit(1);
      if (!outreach?.steps?.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Generate and review a pregen sequence first",
        });
      }
      // Pretend drafts publish. Blocking them made the end-to-end loop
      // untestable before previews exist, which is backwards: publishing here
      // writes copy onto a HubSpot contact property for a rep to use, it does
      // not send anything, so the cost of a stand-in reaching HubSpot is a
      // property that has to be regenerated — not a mail to a prospect.
      //
      // The fact travels with the result instead, so the caller can surface it
      // and `generationContext.preview.pretend` still records it on the draft.
      const writtenFromPretendPreview =
        outreach.generationContext?.preview.pretend === true;

      // The copy is written to one person now: it addresses their own replies
      // and calls as "you" and may use their first name. Enrolling someone else
      // ships those sentences at the wrong reader. Publishing still goes ahead,
      // because overriding the pick is a legitimate call, but it cannot go
      // ahead silently.
      // The copy is about the company, not the reader: history is attributed to
      // whoever said it, and the only per-person token left is the first name
      // HubSpot puts in the greeting. So it publishes to the company record and
      // any enrolled contact there renders it correctly. Publishing to a person
      // meant four-touch drafts lost touches 3 and 4 to a two-touch contact
      // contract, and the copy went stale the moment that person changed jobs.
      if (!row.hubspotRecordId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This domain has no linked HubSpot company to publish to",
        });
      }
      const properties = hubspotCompanyPropertiesFromRenderedSteps(
        outreach.steps,
      );
      await updateCompany(row.hubspotRecordId, properties);
      await ctx.db
        .update(leadSequenceTable)
        .set({ status: "approved", contactId: contact.id })
        .where(eq(leadSequenceTable.id, outreach.id));
      return {
        outreachId: outreach.id,
        contactId: contact.id,
        hubspotContactId: contact.hubspotContactId,
        hubspotCompanyId: row.hubspotRecordId,
        propertyNames: Object.keys(properties),
        writtenFromPretendPreview,
        warning: writtenFromPretendPreview
          ? `This copy was written against a stand-in preview, so anything it says about the page itself is invented. It is now on the HubSpot company; regenerate and re-publish once ${row.domain} has a real preview.`
          : null,
      };
    }),

  // Push a lead's draft into the shared headless "Personalized" Instantly
  // campaign as custom variables (does NOT activate — nothing sends until that
  // campaign is launched). Recipient = the scraped corporate email, or override.
  queueInstantlyLead: protectedProcedure
    .input(
      z.object({
        domainId: z.string(),
        recipientEmail: z.string().email().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.id, input.domainId),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Domain not in DB" });
      }
      const channel = (
        row.enrichment as { contactChannel?: { bestEmail?: string } } | null
      )?.contactChannel;
      const recipient = input.recipientEmail ?? channel?.bestEmail;
      if (!recipient) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No recipient email — run the contact resolver or pass one explicitly",
        });
      }
      return queueInstantlyLead(input.domainId, recipient);
    }),

  // Activate the shared personalized campaign from the app — sends to everyone
  // currently queued in it. Campaign-level (not per lead).
  launchInstantlyCampaign: protectedProcedure.mutation(async () => {
    return activateInstantlyCampaign();
  }),

  // Pull the live HubSpot company (+contacts) for a domain and diff it against
  // our row. READ-ONLY — no writes. Returns { configured:false } if no token.
  pullFromHubspot: protectedProcedure
    .input(z.object({ domain: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const domain = input.domain.toLowerCase();

      const ours = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.domain, domain),
      });

      if (!isHubspotConfigured) {
        return { configured: false as const, ours, hubspot: null, diff: [] };
      }

      const company = await findCompanyByDomain(domain);
      const contacts = company ? await getCompanyContacts(company.id) : [];

      // Field-level diff: our column ↔ the comparable HubSpot property.
      const hs = company?.values;
      const cmp = (
        field: string,
        oursVal: string | number | null | undefined,
        hubspotVal: string | null | undefined,
      ) => {
        const o = oursVal == null ? null : String(oursVal);
        const h = hubspotVal == null || hubspotVal === "" ? null : hubspotVal;
        return { field, ours: o, hubspot: h, same: o === h };
      };

      const diff = company
        ? [
            cmp("company", ours?.companyName, hs?.name),
            cmp("units", ours?.unitCount, hs?.portfolio_size),
            cmp("pms", ours?.pms, hs?.pms_ai_identified),
            cmp("pregen site", ours?.pregenSiteUrl, hs?.sites_preview_url),
            cmp("lead status", ours?.hubspotLeadStatus, hs?.hs_lead_status),
            cmp("country", ours?.country, hs?.country),
            cmp("state", ours?.state, hs?.state),
          ]
        : [];

      return {
        configured: true as const,
        ours,
        hubspot: company
          ? {
              id: company.id,
              // Deep link to the company record (object type 0-2).
              url: `https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/record/0-2/${company.id}`,
              values: company.values,
              contacts,
            }
          : null,
        diff,
      };
    }),

  // AI reconciliation of ours + HubSpot + web into a proposed record.
  // Accepts the web `enrichment` the drawer already ran (avoids a re-run).
  proposeMerge: protectedProcedure
    .input(
      z.object({
        domain: z.string().trim().min(1),
        enrichment: LeadEnrichmentSchema.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const domain = input.domain.toLowerCase();
      const ours = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.domain, domain),
      });
      if (!ours) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Domain not in DB" });
      }

      const company = isHubspotConfigured
        ? await findCompanyByDomain(domain)
        : null;

      return proposeMerge({
        domain,
        ours: {
          companyName: ours.companyName,
          unitCount: ours.unitCount,
          pms: ours.pms,
          country: ours.country,
          state: ours.state,
          city: ours.city,
          pregenSiteUrl: ours.pregenSiteUrl,
        },
        hubspot: company
          ? {
              name: company.values.name,
              portfolio_size: company.values.portfolio_size,
              pms_ai_identified: company.values.pms_ai_identified,
              country: company.values.country,
              state: company.values.state,
              city: company.values.city,
              sites_preview_url: company.values.sites_preview_url,
            }
          : null,
        web: input.enrichment ?? null,
      });
    }),

  // Write the human-approved fields to our DB and/or HubSpot. Only the fields
  // passed are touched; HubSpot writes are deliberate (human-approved).
  applyMerge: protectedProcedure
    .input(
      z.object({
        domain: z.string().trim().min(1),
        fields: z.record(z.string(), z.string().nullable()),
        writeToDb: z.boolean().default(true),
        writeToHubspot: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const domain = input.domain.toLowerCase();
      const valid = new Set<string>(MERGEABLE_FIELDS);
      const entries = Object.entries(input.fields).filter(([k]) =>
        valid.has(k),
      ) as [MergeableField, string | null][];
      const result: {
        db: boolean;
        hubspot: "updated" | "created" | "skipped";
      } = {
        db: false,
        hubspot: "skipped",
      };

      // ---- our DB ----
      if (input.writeToDb && entries.length) {
        const set: Record<string, string | number | null | Date> = {
          updatedAt: new Date(),
        };
        for (const [k, v] of entries) {
          set[k] = k === "unitCount" ? (v == null ? null : parseInt(v, 10)) : v;
        }
        await ctx.db
          .update(leadDomainTable)
          .set(set)
          .where(eq(leadDomainTable.domain, domain));
        result.db = true;
      }

      // ---- HubSpot (deliberate write of approved fields) ----
      if (input.writeToHubspot && entries.length) {
        if (!isHubspotConfigured) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "HubSpot is not configured",
          });
        }
        const toHs: Record<MergeableField, keyof CompanyProperties> = {
          companyName: "name",
          unitCount: "portfolio_size",
          pms: "pms_ai_identified",
          country: "country",
          state: "state",
          city: "city",
          pregenSiteUrl: "sites_preview_url",
        };
        const props: CompanyProperties = { domain };
        for (const [k, v] of entries) {
          if (v == null) continue; // never blank-out a HubSpot field from here
          // every field in `toHs` targets a string-typed HubSpot prop; the cast
          // sidesteps the `pm_company_: "Yes" | "No"` member, which is never mapped here.
          (props as Record<keyof CompanyProperties, string>)[toHs[k]] = v;
        }
        const existing = await findCompanyByDomain(domain);
        if (existing) {
          await updateCompany(existing.id, props);
          result.hubspot = "updated";
        } else {
          await createCompany(props);
          result.hubspot = "created";
        }
      }

      return result;
    }),

  // Capture ALL ways to reach a domain by crawling its own website (emails,
  // phone, contact form, chatbot) and persist them as `lead_channel` rows. This
  // is always-on enrichment — no dependency on scoring. Keeps the original
  // mutation name so the existing "Resolve channel" button is unchanged.
  resolveChannel: protectedProcedure
    .input(z.object({ domainId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.id, input.domainId),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Domain not in DB" });
      }

      const { contactChannel, channels } = await captureAndPersistChannels({
        domainId: row.id,
        domain: row.domain,
        companyName: row.companyName,
      });

      const contacts = await ctx.db
        .select({
          id: leadContactTable.id,
          email: leadContactTable.email,
          firstName: leadContactTable.firstName,
          lastName: leadContactTable.lastName,
          jobTitle: leadContactTable.jobTitle,
          verificationStatus: leadContactTable.verificationStatus,
          retiredAt: leadContactTable.retiredAt,
          retiredReason: leadContactTable.retiredReason,
          verification: leadContactTable.verification,
        })
        .from(leadContactTable)
        .where(
          and(
            eq(leadContactTable.domainId, row.id),
            isNull(leadContactTable.deletedAt),
          ),
        );

      return {
        contactChannel,
        channels,
        channelScore: scoreLeadChannel({
          domain: row.domain,
          contactChannel,
          contacts,
          historyMentions: storedContactMentions(row.enrichment),
        }),
      };
    }),

  // Trust layer: run Minerva geo (+ opportunistic Bright Data LinkedIn) over a
  // domain's freemail contacts, persist the evidence, and return the rescored
  // channel. Capped per call — these are paid, per-contact external lookups.
  verifyDomainContacts: protectedProcedure
    .input(
      z.object({
        domainId: z.string(),
        limit: z.number().int().min(1).max(20).default(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.id, input.domainId),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Domain not in DB" });
      }

      const company = {
        name: row.companyName,
        domain: row.domain,
        city: row.city,
        state: row.state,
        country: row.country,
      };

      const contacts = await ctx.db
        .select({
          id: leadContactTable.id,
          email: leadContactTable.email,
          firstName: leadContactTable.firstName,
          lastName: leadContactTable.lastName,
          jobTitle: leadContactTable.jobTitle,
          verificationStatus: leadContactTable.verificationStatus,
          retiredAt: leadContactTable.retiredAt,
          retiredReason: leadContactTable.retiredReason,
          verification: leadContactTable.verification,
        })
        .from(leadContactTable)
        .where(
          and(
            eq(leadContactTable.domainId, row.id),
            isNull(leadContactTable.deletedAt),
          ),
        );

      const byId = new Map<string, StoredLeadContact>(
        contacts.map((c) => [c.id, { ...c }]),
      );

      // Only spend lookups on freemail contacts — the corporate/role inboxes are
      // already trustworthy from the site-scrape. Highest current score first.
      const toVerify = contacts
        .filter((c) => isFreemailEmail(c.email))
        .slice(0, input.limit);

      let verified = 0;
      for (const contact of toVerify) {
        const verification = await verifyContactPerson({
          email: contact.email,
          company,
        });
        if (!verification) continue;
        await ctx.db
          .update(leadContactTable)
          .set({ verification })
          .where(eq(leadContactTable.id, contact.id));
        const local = byId.get(contact.id);
        if (local) local.verification = verification;
        verified++;
      }

      const contactChannel = parseContactChannel(
        (row.enrichment as { contactChannel?: unknown } | null)?.contactChannel,
      );

      return {
        attempted: toVerify.length,
        verified,
        minervaConfigured: isMinervaConfigured,
        channelScore: scoreLeadChannel({
          domain: row.domain,
          contactChannel,
          contacts: [...byId.values()],
          historyMentions: storedContactMentions(row.enrichment),
        }),
      };
    }),

  // Distinct PMS values for the filter dropdown.
  /**
   * Owning reps, for the BDR filter. Cohort-scoped by default because the
   * pregen motion is the point: unscoped, Danny's 10k+ enrichment-owned domains
   * bury the reps who actually own a target company.
   */
  ownerOptions: protectedProcedure
    .input(
      z
        .object({ pregenOnly: z.boolean().default(true) })
        .default({ pregenOnly: true }),
    )
    .query(async ({ ctx, input }) => {
      const base = ctx.db
        .select({
          owner: leadDomainTable.hubspotOwner,
          count: sql<number>`count(distinct ${leadDomainTable.id})::int`,
        })
        .from(leadDomainTable);

      const rows = input.pregenOnly
        ? await base
            .innerJoin(
              hubspotListMembershipTable,
              and(
                eq(hubspotListMembershipTable.domainId, leadDomainTable.id),
                eq(hubspotListMembershipTable.objectType, "company"),
              ),
            )
            .where(sql`${leadDomainTable.hubspotOwner} is not null`)
            .groupBy(leadDomainTable.hubspotOwner)
            .orderBy(desc(sql`count(distinct ${leadDomainTable.id})`))
            .limit(40)
        : await base
            .where(sql`${leadDomainTable.hubspotOwner} is not null`)
            .groupBy(leadDomainTable.hubspotOwner)
            .orderBy(desc(sql`count(distinct ${leadDomainTable.id})`))
            .limit(40);

      // Deactivated HubSpot users still own records; keep them visible but last,
      // since their book needs reassigning rather than reviewing.
      return rows.sort((left, right) => {
        const leftGone = /deactivated/i.test(left.owner ?? "") ? 1 : 0;
        const rightGone = /deactivated/i.test(right.owner ?? "") ? 1 : 0;
        return leftGone - rightGone || right.count - left.count;
      });
    }),

  pmsOptions: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        pms: leadDomainTable.pms,
        count: sql<number>`count(*)::int`,
      })
      .from(leadDomainTable)
      .where(sql`${leadDomainTable.pms} is not null`)
      .groupBy(leadDomainTable.pms)
      .orderBy(desc(sql`count(*)`))
      .limit(40);
    return rows;
  }),
});
