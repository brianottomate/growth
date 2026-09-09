import "server-only";

import { and, asc, count, eq, isNull } from "drizzle-orm";

import {
  HS_COMPANY_LEAD_STATUS_LABELS,
  HS_OWNER_NAMES,
  HUBSPOT_ACCOUNT_ID,
} from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import { leadContactTable, leadDomainTable } from "@/server/db/schema";
import { normalizeDomain } from "@/server/services/hubspot-contact-mirror";

/** Enough to read on a brand page; the mirror notes domains with thousands. */
export const BRAND_CONTACTS_LIMIT = 50;

export type BrandContact = {
  id: string;
  name: string | null;
  jobTitle: string | null;
  email: string;
  phone: string | null;
  optedOut: boolean;
};

export type BrandContacts = {
  domain: string;
  /** Contacts on file beyond the ones returned. */
  moreCount: number;
  company: {
    name: string | null;
    hubspotUrl: string | null;
    leadStatus: string | null;
    owner: string | null;
    hasDeal: boolean;
    isCustomer: boolean;
    pms: string | null;
    unitCount: number | null;
  } | null;
  contacts: BrandContact[];
};

// The leads mirror is keyed on the bare host, the way the HubSpot mirror
// normalises it, so the same function decides what "this brand's domain" is.
export function leadDomainFor(input: { leadDomain: string | null; website: string | null }): string | null {
  return normalizeDomain(input.leadDomain) ?? normalizeDomain(input.website);
}

export async function loadBrandContacts(input: {
  leadDomain: string | null;
  website: string | null;
}): Promise<BrandContacts | null> {
  const domain = leadDomainFor(input);
  if (!domain) return null;

  const [lead, rows, [total]] = await Promise.all([
    db.query.leadDomainTable.findFirst({
      where: and(eq(leadDomainTable.domain, domain), isNull(leadDomainTable.deletedAt)),
      columns: {
        companyName: true,
        hubspotRecordId: true,
        hubspotLeadStatus: true,
        hubspotOwner: true,
        hasHubspotDeal: true,
        isExistingCustomer: true,
        pms: true,
        unitCount: true,
      },
    }),
    db
      .select({
        id: leadContactTable.id,
        firstName: leadContactTable.firstName,
        lastName: leadContactTable.lastName,
        jobTitle: leadContactTable.jobTitle,
        email: leadContactTable.email,
        phone: leadContactTable.phone,
        emailOptOut: leadContactTable.emailOptOut,
      })
      .from(leadContactTable)
      // Deleted in HubSpot is soft-deleted here, like every other reader;
      // retired is our own judgement that the person is the wrong door in.
      .where(
        and(
          eq(leadContactTable.domain, domain),
          isNull(leadContactTable.deletedAt),
          isNull(leadContactTable.retiredAt),
        ),
      )
      .orderBy(asc(leadContactTable.lastName), asc(leadContactTable.firstName))
      .limit(BRAND_CONTACTS_LIMIT),
    db
      .select({ count: count() })
      .from(leadContactTable)
      .where(
        and(
          eq(leadContactTable.domain, domain),
          isNull(leadContactTable.deletedAt),
          isNull(leadContactTable.retiredAt),
        ),
      ),
  ]);

  const contacts: BrandContact[] = rows
    .map((row) => ({
      id: row.id,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
      jobTitle: row.jobTitle,
      email: row.email,
      phone: row.phone,
      optedOut: row.emailOptOut === true,
    }))
    // Reachable people first; the rest keep alphabetical order. Nothing
    // writes verification_status yet, so there is no "verified" to rank on.
    .sort((a, b) => Number(a.optedOut) - Number(b.optedOut));

  return {
    domain,
    moreCount: Math.max(0, Number(total?.count ?? 0) - rows.length),
    company: lead
      ? {
          name: lead.companyName,
          hubspotUrl: lead.hubspotRecordId
            ? `https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/record/0-2/${lead.hubspotRecordId}`
            : null,
          leadStatus: lead.hubspotLeadStatus
            ? (HS_COMPANY_LEAD_STATUS_LABELS[lead.hubspotLeadStatus] ?? lead.hubspotLeadStatus)
            : null,
          owner: lead.hubspotOwner ? (HS_OWNER_NAMES[lead.hubspotOwner] ?? lead.hubspotOwner) : null,
          hasDeal: lead.hasHubspotDeal,
          isCustomer: lead.isExistingCustomer,
          pms: lead.pms,
          unitCount: lead.unitCount,
        }
      : null,
    contacts,
  };
}
