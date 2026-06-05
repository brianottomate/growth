import "server-only";
import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/companies/models/Filter";

import { env } from "@/env";

// =====================================================
// HUBSPOT CRM CLIENT (growth)
// =====================================================
//
// Scoped wrapper for the leads back-office: pull a company (+contacts) by
// domain, diff against our DB, and write back. Modeled on wander.com's
// services/hubspot/hubspot.client.ts — same account (22480390), same
// private-app token — but trimmed to companies + contacts.
//
// THE SAFETY PATTERN: `upsertCompany` is *audit-always* — it only backfills
// fields that are currently EMPTY in HubSpot, never overwriting a value the
// sales team has set. Use the `update*` primitives directly for deliberate
// force-overwrites (e.g. a human-approved merge).

export const isHubspotConfigured = !!env.HUBSPOT_ACCESS_TOKEN_OPERATED;

if (!isHubspotConfigured) {
  console.warn(
    "⚠️ [HubSpot] Not configured. Set HUBSPOT_ACCESS_TOKEN_OPERATED to enable.",
  );
}

export const HUBSPOT_ACCOUNT_ID = "22480390";

// Lazily-initialized singleton so importing this module never throws when the
// token is absent (the leads UI should degrade gracefully, not crash).
let _client: Client | null = null;
function client(): Client {
  if (!env.HUBSPOT_ACCESS_TOKEN_OPERATED) {
    throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED is not configured");
  }
  _client ??= new Client({ accessToken: env.HUBSPOT_ACCESS_TOKEN_OPERATED });
  return _client;
}

// =====================================================
// PROPERTY SHAPES
// =====================================================
//
// Write-side shape; optional everywhere (each field set conditionally). On
// reads, everything surfaces as `string | null` — HubSpot returns anything.

export type CompanyProperties = {
  domain?: string;
  name?: string;
  hs_lead_status?: string;
  hubspot_owner_id?: string;
  portfolio_size?: string;
  pms_ai_identified?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  // Wander Sites pregen write-back (property names from the lead-gen pipeline)
  sites_preview_url?: string;
  pm_company_?: "Yes" | "No";
  ww_listing_url?: string;
};

export type ContactProperties = {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  jobtitle?: string;
  hs_lead_status?: string;
  hubspot_owner_id?: string;
};

// Always-fetched core sets. The audit-always backfill operates on these.
export const COMPANY_CORE_PROPERTIES = [
  "name",
  "domain",
  "hs_lead_status",
  "hubspot_owner_id",
  "portfolio_size",
  "pms_ai_identified",
  "website",
  "city",
  "state",
  "country",
  "sites_preview_url",
  "pm_company_",
  "ww_listing_url",
] as const satisfies readonly (keyof CompanyProperties)[];

type CompanyCoreProperty = (typeof COMPANY_CORE_PROPERTIES)[number];

export const CONTACT_CORE_PROPERTIES = [
  "email",
  "firstname",
  "lastname",
  "phone",
  "jobtitle",
  "hs_lead_status",
  "hubspot_owner_id",
] as const satisfies readonly (keyof ContactProperties)[];

type ContactCoreProperty = (typeof CONTACT_CORE_PROPERTIES)[number];

// =====================================================
// INTERNAL HELPERS
// =====================================================

function setIfDefined<T, K extends keyof T>(
  target: Partial<T>,
  source: Partial<T>,
  key: K,
): void {
  const value = source[key];
  if (value !== undefined) target[key] = value;
}

/**
 * Subset of `props` safe to write under audit-always semantics: only fields
 * whose existing value is empty (null / undefined / ""). Skips fields absent
 * from `props`. Exposed so callers that did their own search can apply the
 * same rule without going through `upsert*`.
 */
export function computeFieldsToWrite<
  T extends CompanyProperties | ContactProperties,
>(existing: { [K in keyof T]?: string | null }, props: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(props) as (keyof T)[]) {
    const newValue = props[key];
    if (newValue === undefined || newValue === null || newValue === "") continue;
    const oldValue = existing[key];
    const oldIsEmpty =
      oldValue === null || oldValue === undefined || oldValue === "";
    if (oldIsEmpty) setIfDefined(result, props, key);
  }
  return result;
}

// =====================================================
// COMPANIES
// =====================================================

export type HubspotCompany = {
  id: string;
  values: Record<CompanyCoreProperty, string | null>;
};

/** Find a company by exact domain. Returns null if none. */
export async function findCompanyByDomain(
  domain: string,
): Promise<HubspotCompany | null> {
  const result = await client().crm.companies.searchApi.doSearch({
    filterGroups: [
      {
        filters: [
          {
            propertyName: "domain",
            operator: FilterOperatorEnum.Eq,
            value: domain,
          },
        ],
      },
    ],
    properties: [...COMPANY_CORE_PROPERTIES],
    limit: 1,
    sorts: [],
  });

  const found = result.results[0];
  if (!found) return null;

  const values = {} as Record<CompanyCoreProperty, string | null>;
  for (const prop of COMPANY_CORE_PROPERTIES) {
    values[prop] = (found.properties?.[prop] as string | undefined) ?? null;
  }
  return { id: found.id, values };
}

/** Contacts associated with a company (decision-makers for the merge view). */
export async function getCompanyContacts(
  companyId: string,
  limit = 50,
): Promise<Array<{ id: string; values: Record<ContactCoreProperty, string | null> }>> {
  const assoc = await client().crm.associations.v4.basicApi.getPage(
    "companies",
    companyId,
    "contacts",
    undefined,
    limit,
  );
  const ids = (assoc.results ?? []).map((a) => String(a.toObjectId));
  if (ids.length === 0) return [];

  const contacts = await Promise.all(
    ids.map((id) =>
      client().crm.contacts.basicApi.getById(id, [...CONTACT_CORE_PROPERTIES]),
    ),
  );
  return contacts.map((c) => {
    const values = {} as Record<ContactCoreProperty, string | null>;
    for (const prop of CONTACT_CORE_PROPERTIES) {
      values[prop] = (c.properties?.[prop] as string | undefined) ?? null;
    }
    return { id: c.id, values };
  });
}

export async function createCompany(
  props: CompanyProperties,
): Promise<{ id: string }> {
  const created = await client().crm.companies.basicApi.create({
    properties: props,
    associations: [],
  });
  return { id: created.id };
}

/** Deliberate field write (use for human-approved merges / force-overwrites). */
export async function updateCompany(
  id: string,
  props: CompanyProperties,
): Promise<void> {
  await client().crm.companies.basicApi.update(id, {
    properties: props,
  });
}

/**
 * Audit-always upsert keyed by domain. New companies get the full `props`;
 * existing ones keep their values, empty fields backfilled. Returns the
 * post-upsert core state so callers can compare sent vs stored.
 */
export async function upsertCompany(
  domain: string,
  props: CompanyProperties,
): Promise<HubspotCompany> {
  const existing = await findCompanyByDomain(domain);

  if (!existing) {
    const created = await createCompany({ domain, ...props });
    const values = {} as Record<CompanyCoreProperty, string | null>;
    for (const key of COMPANY_CORE_PROPERTIES) {
      values[key] = (props[key]) ?? null;
    }
    return { id: created.id, values };
  }

  const fieldsToWrite = computeFieldsToWrite(existing.values, props);
  if (Object.keys(fieldsToWrite).length > 0) {
    await updateCompany(existing.id, fieldsToWrite);
  }

  const values = {} as Record<CompanyCoreProperty, string | null>;
  for (const key of COMPANY_CORE_PROPERTIES) {
    const old = existing.values[key];
    values[key] =
      old != null && old !== ""
        ? old
        : ((props[key]) ?? null);
  }
  return { id: existing.id, values };
}

// =====================================================
// CONTACTS
// =====================================================

export async function findContactByEmail(
  email: string,
): Promise<{ id: string; values: Record<ContactCoreProperty, string | null> } | null> {
  const result = await client().crm.contacts.searchApi.doSearch({
    filterGroups: [
      {
        filters: [
          {
            propertyName: "email",
            operator: FilterOperatorEnum.Eq,
            value: email,
          },
        ],
      },
    ],
    properties: [...CONTACT_CORE_PROPERTIES],
    limit: 1,
    sorts: [],
  });

  const found = result.results[0];
  if (!found) return null;

  const values = {} as Record<ContactCoreProperty, string | null>;
  for (const prop of CONTACT_CORE_PROPERTIES) {
    values[prop] = (found.properties?.[prop] as string | undefined) ?? null;
  }
  return { id: found.id, values };
}

export async function updateContact(
  id: string,
  props: ContactProperties,
): Promise<void> {
  await client().crm.contacts.basicApi.update(id, {
    properties: props,
  });
}
