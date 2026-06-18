import { z } from "zod";
import { and, asc, desc, eq, exists, gte, ilike, isNull, or, sql } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  leadContactTable,
  leadDomainTable,
  leadImportTable,
} from "@/server/db/leads-schema";
import { discoverDomain } from "@/server/services/lead-discovery.service";
import {
  extractFromDiscovery,
  LeadEnrichmentSchema,
} from "@/server/services/lead-extraction.service";
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
        // net-new sendable target: not in CRM, live rental site, has a credible
        // contact (real name OR corporate email). Mirrors the `netNew` list filter.
        netNew: sql<number>`count(*) filter (where
          not ${leadDomainTable.inHubspot}
          and not ${leadDomainTable.hasHubspotDeal}
          and not ${leadDomainTable.isExistingCustomer}
          and not ${leadDomainTable.excludeFromOutreach}
          and ${leadDomainTable.pregenStatus} = 'LIVE_RENTAL'
          and exists (
            select 1 from leads.contact c
            where c.domain_id = ${leadDomainTable.id} and c.deleted_at is null
              and (c.first_name is not null or c.last_name is not null
                   or c.email !~* '@(gmail|yahoo|hotmail|aol|outlook|msn|icloud)\\.')
          ))::int`,
      })
      .from(leadDomainTable);

    const [contacts] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadContactTable);

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
      contacts: contacts?.count ?? 0,
      topPms,
      imports,
    };
  }),

  // Paginated / filtered / sorted domain list.
  listDomains: protectedProcedure
    .input(
      z.object({
        q: z.string().trim().optional(),
        source: z.enum(["builtwith", "hubspot", "pregen", "instantly"]).optional(),
        pms: z.string().optional(),
        hasPregenSite: z.boolean().optional(),
        integratedPmsOnly: z.boolean().optional(),
        // net-new sendable target: not in CRM, LIVE_RENTAL, has a credible contact.
        netNew: z.boolean().optional(),
        minUnits: z.number().int().nonnegative().optional(),
        sort: z.enum(["composite", "units", "domain", "updated"]).default("units"),
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
      if (input.minUnits != null)
        conds.push(gte(leadDomainTable.unitCount, input.minUnits));

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

      return {
        items,
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
      return { domain, contacts };
    }),

  // ---- Manual enrichment (inspect-only; no DB write yet) ----

  // Discovery only — raw, fault-tolerant fan-out across search/scrape providers.
  discover: protectedProcedure
    .input(
      z.object({
        domain: z.string().trim().min(1),
        only: z
          .array(z.enum(["firecrawl", "perplexity", "tavily", "parallel", "exa"]))
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
      const result: { db: boolean; hubspot: "updated" | "created" | "skipped" } = {
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
