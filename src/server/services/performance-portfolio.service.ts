import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, leadDomainTable } from "@/server/db/schema";
import { leadDomainFor } from "./brand-contacts.service";
import {
  HS_COMPANY_LEAD_STATUS_LABELS,
  HS_OWNER_NAMES,
  HUBSPOT_ACCOUNT_ID,
} from "@/server/clients/hubspot.client";

/** Batch CRM evidence for workspace brands only. A sales owner is not a CSM assignment. */
export async function loadPortfolioEvidence(orgId: string, brandIds: string[]) {
  if (!brandIds.length) return new Map<string, PortfolioEvidence>();
  const brands = await db
    .select({
      id: brandTable.id,
      leadDomain: brandTable.leadDomain,
      website: brandTable.website,
    })
    .from(brandTable)
    .where(
      and(
        eq(brandTable.organizationId, orgId),
        inArray(brandTable.id, brandIds),
        isNull(brandTable.deletedAt),
      ),
    );
  const domains = new Map(
    brands.map((brand) => [brand.id, leadDomainFor(brand)]),
  );
  const keys = [
    ...new Set(
      [...domains.values()].filter((domain): domain is string =>
        Boolean(domain),
      ),
    ),
  ];
  const leads = keys.length
    ? await db
        .select({
          domain: leadDomainTable.domain,
          city: leadDomainTable.city,
          state: leadDomainTable.state,
          units: leadDomainTable.unitCount,
          pms: leadDomainTable.pms,
          owner: leadDomainTable.hubspotOwner,
          crmStage: leadDomainTable.hubspotLeadStatus,
          hubspotId: leadDomainTable.hubspotRecordId,
          syncedAt: leadDomainTable.hubspotSyncedAt,
        })
        .from(leadDomainTable)
        .where(
          and(
            inArray(leadDomainTable.domain, keys),
            isNull(leadDomainTable.deletedAt),
          ),
        )
    : [];
  const byDomain = new Map(leads.map((lead) => [lead.domain, lead]));
  return new Map(
    brands.map((brand) => {
      const domain = domains.get(brand.id) ?? null;
      const lead = domain ? byDomain.get(domain) : null;
      return [
        brand.id,
        {
          domain,
          matched: Boolean(lead),
          location: lead
            ? [lead.city, lead.state].filter(Boolean).join(", ") || null
            : null,
          units: lead?.units ?? null,
          pms: lead?.pms ?? null,
          owner: lead?.owner
            ? (HS_OWNER_NAMES[lead.owner] ?? lead.owner)
            : null,
          crmStage: lead?.crmStage
            ? (HS_COMPANY_LEAD_STATUS_LABELS[lead.crmStage] ?? lead.crmStage)
            : null,
          hubspotUrl: lead?.hubspotId
            ? `https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/record/0-2/${lead.hubspotId}`
            : null,
          syncedAt: lead?.syncedAt?.toISOString() ?? null,
        } satisfies PortfolioEvidence,
      ];
    }),
  );
}
export type PortfolioEvidence = {
  domain: string | null;
  matched: boolean;
  location: string | null;
  units: number | null;
  pms: string | null;
  owner: string | null;
  crmStage: string | null;
  hubspotUrl: string | null;
  syncedAt: string | null;
};
