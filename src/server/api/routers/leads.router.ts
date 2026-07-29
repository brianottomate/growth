import { z } from "zod";
import {
  and,
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
} from "@/server/db/leads-schema";
import { captureAndPersistChannels } from "@/server/services/channel-discovery.service";
import { discoverDomain } from "@/server/services/lead-discovery.service";
import {
  extractFromDiscovery,
  LeadEnrichmentSchema,
} from "@/server/services/lead-extraction.service";
import { generateOutreachDraft } from "@/server/services/lead-outreach.service";
import {
  generatePregenHubspotDraft,
  PregenMotionSchema,
} from "@/server/services/pregen-hubspot-outreach.service";
import { hubspotPropertiesFromRenderedSteps } from "@/server/services/pregen-hubspot-copy";
import {
  isFreemailEmail,
  parseContactChannel,
  scoreLeadChannel,
  type StoredLeadContact,
} from "@/server/services/lead-channel.service";
import { verifyContactPerson } from "@/server/services/lead-verify.service";
import { isMinervaConfigured } from "@/server/clients/minerva.client";
import {
  queueOutreach,
  launchPersonalizedCampaign,
} from "@/server/services/outreach-send.service";
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

// First cold-outbound test cohort (the "SEND-20"): the middle band of the
// enriched net-new ranking — high pregen-fit but smaller operators, so we don't
// burn the best prospects on iteration 1. Hardcoded for this one-off batch; when
// batches become routine this should become a `send_batch` column / cohort tag.
const SEND_BATCH_1 = [
  "cityninestay.com",
  "sunsetrentals1.com",
  "sdurbanvacationrentals.com",
  "pkpropertiestn.net",
  "sunshineandcoastlinerentals.com",
  "fleursdepoirier.com",
  "snowandsand.com",
  "resort-stay.com",
  "grandcaymancondos.net",
  "beachhotelcndo.com",
  "fripprentals.com",
  "ybgroup.es",
  "sweethomes.co.nz",
  "elkrapidsbeachresort.com",
  "bookcobblestonecreek.ca",
  "hummingbird.villas",
  "a12properties.com",
  "chesapeakebayvacations.com",
  "stkittsandnevisvacation.com",
  "casavaleta.com",
] as const;

const SOURCE_COLUMN = {
  builtwith: leadDomainTable.inBuiltwith,
  hubspot: leadDomainTable.inHubspot,
  pregen: leadDomainTable.inPregen,
  instantly: leadDomainTable.inInstantly,
} as const;

const SORTS = {
  composite: leadDomainTable.scoreComposite,
  units: leadDomainTable.unitCount,
  domain: leadDomainTable.domain,
  updated: leadDomainTable.updatedAt,
} as const;

export const leadsRouter = createTRPCRouter({
  // High-level dashboard numbers.
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [totals] = await ctx.db
      .select({
        domains: sql<number>`count(*)::int`,
        builtwith: sql<number>`count(*) filter (where ${leadDomainTable.inBuiltwith})::int`,
        hubspot: sql<number>`count(*) filter (where ${leadDomainTable.inHubspot})::int`,
        pregen: sql<number>`count(*) filter (where ${leadDomainTable.inPregen})::int`,
        instantly: sql<number>`count(*) filter (where ${leadDomainTable.inInstantly})::int`,
        integratedPms: sql<number>`count(*) filter (where ${leadDomainTable.isIntegratedPms})::int`,
        withPregenSite: sql<number>`count(*) filter (where ${leadDomainTable.pregenSiteUrl} is not null)::int`,
        // expansion pool: in builtwith, never in CRM or pregen
        untouched: sql<number>`count(*) filter (where ${leadDomainTable.inBuiltwith} and not ${leadDomainTable.inHubspot} and not ${leadDomainTable.inPregen})::int`,
        // pre-send guard: pregen domains already known to the CRM
        pregenInCrm: sql<number>`count(*) filter (where ${leadDomainTable.inPregen} and ${leadDomainTable.inHubspot})::int`,
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
          eq(leadDomainTable.pregenStatus, "LIVE_RENTAL"),
          exists(
            ctx.db
              .select({ one: sql`1` })
              .from(leadContactTable)
              .where(
                and(
                  eq(leadContactTable.domainId, leadDomainTable.id),
                  isNull(leadContactTable.deletedAt),
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
        source: z
          .enum(["builtwith", "hubspot", "pregen", "instantly"])
          .optional(),
        pms: z.string().optional(),
        hasPregenSite: z.boolean().optional(),
        integratedPmsOnly: z.boolean().optional(),
        pregenCohort: z.enum(["recycled", "untouched"]).optional(),
        // net-new sendable target: not in CRM, LIVE_RENTAL, has a credible contact.
        netNew: z.boolean().optional(),
        // the first cold-outbound test cohort (SEND_BATCH_1).
        sendBatch: z.boolean().optional(),
        // only companies with a live, emailable, HubSpot-enrollable contact.
        enrollableOnly: z.boolean().optional(),
        minUnits: z.number().int().nonnegative().optional(),
        sort: z
          .enum(["composite", "units", "domain", "updated"])
          .default("units"),
        dir: z.enum(["asc", "desc"]).default("desc"),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().nonnegative().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds = [];
      if (input.q) {
        conds.push(
          or(
            ilike(leadDomainTable.domain, `%${input.q}%`),
            ilike(leadDomainTable.companyName, `%${input.q}%`),
          ),
        );
      }
      if (input.source) conds.push(eq(SOURCE_COLUMN[input.source], true));
      if (input.pms) conds.push(eq(leadDomainTable.pms, input.pms));
      if (input.hasPregenSite)
        conds.push(sql`${leadDomainTable.pregenSiteUrl} is not null`);
      if (input.integratedPmsOnly)
        conds.push(eq(leadDomainTable.isIntegratedPms, true));
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
        // The "first send" cut: never entered the CRM, their current site is a
        // live rental site (ICP), and we have at least one credible contact.
        conds.push(
          eq(leadDomainTable.inHubspot, false),
          eq(leadDomainTable.hasHubspotDeal, false),
          eq(leadDomainTable.isExistingCustomer, false),
          eq(leadDomainTable.excludeFromOutreach, false),
          eq(leadDomainTable.pregenStatus, "LIVE_RENTAL"),
          exists(
            ctx.db
              .select({ one: sql`1` })
              .from(leadContactTable)
              .where(
                and(
                  eq(leadContactTable.domainId, leadDomainTable.id),
                  isNull(leadContactTable.deletedAt),
                  sql`(${leadContactTable.firstName} is not null or ${leadContactTable.lastName} is not null or ${leadContactTable.email} !~* '@(gmail|yahoo|hotmail|aol|outlook|msn|icloud)\\.')`,
                ),
              ),
          ),
        );
      }
      if (input.sendBatch)
        conds.push(inArray(leadDomainTable.domain, [...SEND_BATCH_1]));
      if (input.minUnits != null)
        conds.push(gte(leadDomainTable.unitCount, input.minUnits));
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
        )`);

      const where = conds.length ? and(...conds) : undefined;
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
          pregenStatus: leadDomainTable.pregenStatus,
          hubspotLeadStatus: leadDomainTable.hubspotLeadStatus,
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

      return {
        items: items.map((i) => ({
          ...i,
          contactCount: countMap.get(i.id) ?? 0,
          pregenCohorts: [...(cohortsByDomain.get(i.id) ?? [])].sort(),
        })),
        total,
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
  generateOutreach: protectedProcedure
    .input(
      z.object({
        domainId: z.string(),
        // Optional operator steer: free-text context injected into the prompt
        // (e.g. "pretend this is a 200-unit luxury PM" for a demo).
        steer: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.id, input.domainId),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Domain not in DB" });
      }
      const { draft, model } = await generateOutreachDraft(row.domain, {
        steer: input.steer,
      });
      // Replace any prior *unsent* draft for this domain; keep sent/approved history.
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
          angle: draft.angle,
          personalizedOn: draft.personalizedOn,
          steps: draft.steps,
          model,
        })
        .returning();
      return created!;
    }),

  // Generate the HubSpot pregen motion from live company correspondence,
  // current website evidence, and the assigned preview. The prose is split
  // into reliable HubSpot paragraph slots, but the stored review shows the
  // complete rendered emails.
  generatePregenOutreach: protectedProcedure
    .input(
      z.object({
        domainId: z.string(),
        motion: PregenMotionSchema,
        previewUrl: z.url().optional(),
        steer: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.leadDomainTable.findFirst({
        where: eq(leadDomainTable.id, input.domainId),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Domain not in DB" });
      }
      const previewUrl = input.previewUrl ?? row.pregenSiteUrl;
      if (!previewUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Assign a real pregen preview before generating HubSpot copy",
        });
      }

      const result = await generatePregenHubspotDraft(row.domain, {
        motion: input.motion,
        previewUrl,
        steer: input.steer,
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
      if (!row?.pregenSiteUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This lead has no assigned pregen preview",
        });
      }
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

      const properties = hubspotPropertiesFromRenderedSteps(
        outreach.steps,
        row.pregenSiteUrl,
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
      };
    }),

  // Push a lead's draft into the shared headless "Personalized" Instantly
  // campaign as custom variables (does NOT activate — nothing sends until that
  // campaign is launched). Recipient = the scraped corporate email, or override.
  queueOutreach: protectedProcedure
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
      return queueOutreach(input.domainId, recipient);
    }),

  // Activate the shared personalized campaign from the app — sends to everyone
  // currently queued in it. Campaign-level (not per lead).
  launchOutreachCampaign: protectedProcedure.mutation(async () => {
    return launchPersonalizedCampaign();
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
        verdict: z.enum(["send", "review", "form", "skip"]).optional(),
        route: z.enum(["instantly", "form", "none"]).optional(),
        hasDraft: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().nonnegative().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds = [
        eq(leadDomainTable.inHubspot, false),
        eq(leadDomainTable.hasHubspotDeal, false),
        eq(leadDomainTable.isExistingCustomer, false),
        eq(leadDomainTable.excludeFromOutreach, false),
        eq(leadDomainTable.pregenStatus, "LIVE_RENTAL"),
        isNull(leadDomainTable.deletedAt),
        sql`${leadDomainTable.scorePregenPotential} is not null`,
      ];

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
