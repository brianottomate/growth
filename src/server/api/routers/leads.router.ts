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
  or,
  sql,
} from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  leadChannelTable,
  leadContactTable,
  leadDomainTable,
  hubspotListMembershipTable,
  leadImportTable,
  leadOutreachTable,
  pregenBuildTable,
} from "@/server/db/leads-schema";
import {
  createWebsiteProspect,
  isWanderApiConfigured,
  listWebsiteProspects,
  SETTLED_PROSPECT_STATUSES,
} from "@/server/clients/wander.client";
import { captureAndPersistChannels } from "@/server/services/channel-discovery.service";
import { discoverDomain } from "@/server/services/lead-discovery.service";
import {
  extractFromDiscovery,
  LeadEnrichmentSchema,
} from "@/server/services/lead-extraction.service";
import {
  generatePregenHubspotDraft,
  PregenPreconditionError,
  PregenMotionSchema,
} from "@/server/services/pregen-hubspot-outreach.service";
import { hubspotPropertiesFromRenderedSteps } from "@/server/services/pregen-hubspot-copy";
import {
  readHubspotCompanyActivityHistory,
  readHubspotCompanyEmailHistory,
} from "@/server/services/hubspot-company-email-context.service";
import { classifyFetchUrl } from "@/server/ai/url-safety";
import {
  isFreemailEmail,
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
    return { url: null, state: "none", status: null, detail: "no preview assigned" };
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

      const workableOnly = !input.includeExcluded;
      const where = and(
        ...conds,
        ...(workableOnly
          ? [eq(leadDomainTable.excludeFromOutreach, false)]
          : []),
      );
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
          siteScreenshotUrl:
            sql<string | null>`${leadDomainTable.enrichment} -> 'leadRank' ->> 'screenshotUrl'`,
          siteRankOverall:
            sql<number | null>`(${leadDomainTable.enrichment} -> 'leadRank' ->> 'overall')::int`,
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
        .limit(input.limit)
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
            const [reviewContacts, outreachRows, channelRows, domainEnrichment] =
              await Promise.all([
                ctx.db
                  .select({
                    id: leadContactTable.id,
                    domainId: leadContactTable.domainId,
                    email: leadContactTable.email,
                    firstName: leadContactTable.firstName,
                    lastName: leadContactTable.lastName,
                    jobTitle: leadContactTable.jobTitle,
                    verificationStatus: leadContactTable.verificationStatus,
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
                  .from(leadOutreachTable)
                  .where(inArray(leadOutreachTable.domainId, ids))
                  .orderBy(desc(leadOutreachTable.createdAt)),
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
                    contactChannel: parseContactChannel(enrichmentById.get(id)),
                    contacts: contactsByDomain.get(id) ?? [],
                  }),
                  channels: channelsByDomain.get(id) ?? [],
                  outreach: latestOutreach.get(id) ?? null,
                },
              ]),
            );
          })()
        : null;

      return {
        items: items.map((i) => ({
          ...i,
          contactCount: countMap.get(i.id) ?? 0,
          pregenCohorts: [...(cohortsByDomain.get(i.id) ?? [])].sort(),
          review: review?.get(i.id) ?? null,
        })),
        total,
        excludedHeld: excludedRow?.count ?? 0,
        hasMore: input.offset + items.length < total,
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
        .from(leadOutreachTable)
        .where(eq(leadOutreachTable.domainId, input.id))
        .orderBy(desc(leadOutreachTable.createdAt))
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

      const [contacts, channels, outreachRows, memberships] = await Promise.all([
        ctx.db
          .select({
            id: leadContactTable.id,
            email: leadContactTable.email,
            firstName: leadContactTable.firstName,
            lastName: leadContactTable.lastName,
            jobTitle: leadContactTable.jobTitle,
            verificationStatus: leadContactTable.verificationStatus,
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
          .from(leadOutreachTable)
          .where(eq(leadOutreachTable.domainId, domain.id))
          .orderBy(desc(leadOutreachTable.createdAt))
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
      ]);

      const channel = scoreLeadChannel({
        domain: domain.domain,
        contactChannel: parseContactChannel(domain.enrichment),
        contacts,
      });

      return {
        domain,
        cohort: memberships[0]?.cohort ?? null,
        channel,
        channels,
        contacts,
        outreach: outreachRows[0] ?? null,
        outreachHistory: outreachRows,
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
        return { available: false as const, reason: "no linked HubSpot company" };
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
      return { available: true as const, companyId: company.id, emails, activity };
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
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Domain not in DB" });
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
          expiresAt: prospect.expiresAt ? new Date(prospect.expiresAt) : null,
        })
        .returning();
      return build ?? null;
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
          evalOverall: current.evalOverall ?? build.evalOverall,
          errorMessage: current.errorMessage ?? null,
          expiresAt: current.expiresAt ? new Date(current.expiresAt) : build.expiresAt,
          settledAt: settled ? (build.settledAt ?? new Date()) : build.settledAt,
        })
        .where(eq(pregenBuildTable.id, build.id));

      if (current.previewUrl) {
        await ctx.db
          .update(leadDomainTable)
          .set({
            pregenSiteUrl: current.previewUrl,
            pregenPreviewExpiresAt: current.expiresAt
              ? new Date(current.expiresAt)
              : null,
          })
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
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.id, input.domainId),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Domain not in DB" });
      }

      // The enrich/merge passes already mark existing customers and rep-owned
      // live conversations. Prospecting copy is never right for those, and a
      // draft sitting in Send Review reads as cleared to send, so refuse at
      // generation rather than filtering it out downstream. 17 of the 33
      // domains that currently carry a preview are excluded this way.
      if (row.excludeFromOutreach) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${row.domain} is excluded from outreach (${row.excludeReason ?? "no reason recorded"})`,
        });
      }

      // Cohort membership is the source of truth for motion: a recycled company
      // has prior Wander outreach to acknowledge, an untouched one does not.
      // Deriving it here keeps every review surface from having to pick, and
      // stops the two from ever disagreeing.
      let motion = input.motion;
      if (!motion) {
        const [membership] = await ctx.db
          .select({ cohort: hubspotListMembershipTable.cohort })
          .from(hubspotListMembershipTable)
          .where(
            and(
              eq(hubspotListMembershipTable.domainId, input.domainId),
              eq(hubspotListMembershipTable.objectType, "company"),
            ),
          )
          .limit(1);
        motion = membership?.cohort === "recycled" ? "reengagement" : "fresh";
      }
      // In pretend mode a company with no preview at all still gets a draft —
      // that is the point, since only 33 of 218K domains have one. The stand-in
      // is deliberately self-describing so it is obvious in a rendered body.
      const previewUrl =
        input.previewUrl ??
        row.pregenSiteUrl ??
        (input.pretend
          ? `https://preview.wander.com/pretend/${row.domain}`
          : null);
      if (!previewUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Assign a real pregen preview before generating HubSpot copy, or generate in pretend mode to iterate on the copy first",
        });
      }

      // Exclusion and an unreadable preview are operator-actionable refusals,
      // not faults — surface the reason on the button rather than a 500.
      const result = await generatePregenHubspotDraft(row.domain, {
        motion,
        previewUrl,
        steer: input.steer,
        previewMode: input.pretend ? "pretend" : "require-live",
      }).catch((error) => {
        if (error instanceof PregenPreconditionError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        throw error;
      });
      await ctx.db
        .delete(leadOutreachTable)
        .where(
          and(
            eq(leadOutreachTable.domainId, input.domainId),
            eq(leadOutreachTable.status, "draft"),
          ),
        );
      const [created] = await ctx.db
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
      return created!;
    }),

  // Human approval boundary: copy the latest reviewed pregen draft into one
  // associated HubSpot contact. This does not enroll the contact.
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
        .from(leadOutreachTable)
        .where(
          and(
            eq(leadOutreachTable.domainId, input.domainId),
            eq(leadOutreachTable.status, "draft"),
          ),
        )
        .orderBy(desc(leadOutreachTable.createdAt))
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

      const properties = hubspotPropertiesFromRenderedSteps(
        outreach.steps,
        outreach.generationContext?.previewUrl ?? row.pregenSiteUrl ?? "",
      );
      await updateContact(contact.hubspotContactId, properties);
      await ctx.db
        .update(leadOutreachTable)
        .set({ status: "approved" })
        .where(eq(leadOutreachTable.id, outreach.id));
      return {
        outreachId: outreach.id,
        contactId: contact.id,
        hubspotContactId: contact.hubspotContactId,
        propertyNames: Object.keys(properties),
        writtenFromPretendPreview,
        warning: writtenFromPretendPreview
          ? `This copy was written against a stand-in preview, so anything it says about the page itself is invented. It is now on the HubSpot contact — regenerate and re-publish once ${row.domain} has a real preview.`
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

  // Narrow operator queue for the first real send: enriched, net-new domains
  // with channel evidence + latest generated sequence side-by-side.
  sendReview: protectedProcedure
    .input(
      z.object({
        q: z.string().trim().optional(),
        // Which population to review. "netnew" is the original cold-outbound
        // list: not in the CRM at all. "pregen" is the opposite population —
        // companies that ARE in HubSpot, as members of a pregen cohort — so the
        // two cannot share a base filter.
        mode: z.enum(["netnew", "pregen"]).default("pregen"),
        verdict: z.enum(["send", "review", "form", "skip"]).optional(),
        route: z.enum(["instantly", "form", "none"]).optional(),
        hasDraft: z.boolean().optional(),
        owner: z.string().trim().min(1).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().nonnegative().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Suppression and deletion apply to both populations; everything else
      // differs, because "never touched the CRM" and "is a CRM cohort member"
      // are mutually exclusive.
      const conds = [
        eq(leadDomainTable.excludeFromOutreach, false),
        isNull(leadDomainTable.deletedAt),
      ];

      if (input.mode === "pregen") {
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
      } else {
        conds.push(
          eq(leadDomainTable.inHubspot, false),
          eq(leadDomainTable.hasHubspotDeal, false),
          eq(leadDomainTable.isExistingCustomer, false),
          sql`${leadDomainTable.scorePregenPotential} is not null`,
        );
      }

      if (input.owner) {
        conds.push(eq(leadDomainTable.hubspotOwner, input.owner));
      }

      if (input.q) {
        conds.push(
          or(
            ilike(leadDomainTable.domain, `%${input.q}%`),
            ilike(leadDomainTable.companyName, `%${input.q}%`),
          )!,
        );
      }

      const where = and(...conds);
      const domains = await ctx.db
        .select({
          id: leadDomainTable.id,
          domain: leadDomainTable.domain,
          companyName: leadDomainTable.companyName,
          country: leadDomainTable.country,
          state: leadDomainTable.state,
          city: leadDomainTable.city,
          pms: leadDomainTable.pms,
          unitEstimate: leadDomainTable.unitEstimate,
          unitConfidence: leadDomainTable.unitConfidence,
          scorePregenPotential: leadDomainTable.scorePregenPotential,
          scoreLeadQuality: leadDomainTable.scoreLeadQuality,
          sourceTier: leadDomainTable.sourceTier,
          enrichment: leadDomainTable.enrichment,
          hubspotOwner: leadDomainTable.hubspotOwner,
          pregenSiteUrl: leadDomainTable.pregenSiteUrl,
        })
        .from(leadDomainTable)
        .where(where)
        .orderBy(
          sql`${leadDomainTable.scorePregenPotential} desc nulls last`,
          sql`${leadDomainTable.unitEstimate} desc nulls last`,
          asc(leadDomainTable.domain),
        )
        // Fetch a wider candidate window so computed route/verdict filters still
        // have room without turning this into an all-table application scan.
        .limit(Math.min(input.limit * 4, 200))
        .offset(input.offset);

      const ids = domains.map((d) => d.id);
      const contacts = ids.length
        ? await ctx.db
            .select({
              id: leadContactTable.id,
              domainId: leadContactTable.domainId,
              email: leadContactTable.email,
              firstName: leadContactTable.firstName,
              lastName: leadContactTable.lastName,
              jobTitle: leadContactTable.jobTitle,
              verificationStatus: leadContactTable.verificationStatus,
              verification: leadContactTable.verification,
            })
            .from(leadContactTable)
            .where(
              and(
                inArray(leadContactTable.domainId, ids),
                isNull(leadContactTable.deletedAt),
              ),
            )
        : [];
      const contactsByDomain = new Map<string, StoredLeadContact[]>();
      for (const contact of contacts) {
        const list = contactsByDomain.get(contact.domainId) ?? [];
        list.push(contact);
        contactsByDomain.set(contact.domainId, list);
      }

      const outreachRows = ids.length
        ? await ctx.db
            .select()
            .from(leadOutreachTable)
            .where(inArray(leadOutreachTable.domainId, ids))
            .orderBy(desc(leadOutreachTable.createdAt))
        : [];
      const latestOutreach = new Map<string, (typeof outreachRows)[number]>();
      for (const outreach of outreachRows) {
        if (!latestOutreach.has(outreach.domainId)) {
          latestOutreach.set(outreach.domainId, outreach);
        }
      }

      // Captured reachability channels (one grouped query, same pattern as
      // contacts/outreach above) — surfaced as badges in the send-review UI.
      const channelRows = ids.length
        ? await ctx.db
            .select({
              id: leadChannelTable.id,
              domainId: leadChannelTable.domainId,
              kind: leadChannelTable.kind,
              value: leadChannelTable.value,
              vendor: leadChannelTable.vendor,
              deliveryState: leadChannelTable.deliveryState,
            })
            .from(leadChannelTable)
            .where(
              and(
                inArray(leadChannelTable.domainId, ids),
                isNull(leadChannelTable.deletedAt),
              ),
            )
            .orderBy(asc(leadChannelTable.kind))
        : [];
      const channelsByDomain = new Map<string, typeof channelRows>();
      for (const channel of channelRows) {
        const list = channelsByDomain.get(channel.domainId) ?? [];
        list.push(channel);
        channelsByDomain.set(channel.domainId, list);
      }

      let items = domains.map((domain) => {
        const contactChannel = parseContactChannel(
          (domain.enrichment as { contactChannel?: unknown } | null)
            ?.contactChannel,
        );
        const scored = scoreLeadChannel({
          domain: domain.domain,
          contactChannel,
          contacts: contactsByDomain.get(domain.id) ?? [],
        });
        const outreach = latestOutreach.get(domain.id) ?? null;
        return {
          ...domain,
          enrichment: undefined,
          contactChannel,
          channelScore: scored,
          contactCount: contactsByDomain.get(domain.id)?.length ?? 0,
          channels: channelsByDomain.get(domain.id) ?? [],
          outreach,
        };
      });

      if (input.verdict) {
        items = items.filter(
          (item) => item.channelScore.verdict === input.verdict,
        );
      }
      if (input.route) {
        items = items.filter((item) => item.channelScore.route === input.route);
      }
      if (input.hasDraft != null) {
        items = items.filter(
          (item) => Boolean(item.outreach) === input.hasDraft,
        );
      }

      return {
        items: items.slice(0, input.limit),
        hasMore: domains.length === Math.min(input.limit * 4, 200),
      };
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
