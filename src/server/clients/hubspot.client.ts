import "server-only";
import { Client } from "@hubspot/api-client";
import { AssociationSpecAssociationCategoryEnum } from "@hubspot/api-client/lib/codegen/crm/associations/v4/models/AssociationSpec";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/companies/models/Filter";

import { env } from "@/env";

// =====================================================
// HUBSPOT CRM CLIENT (gateway)
// =====================================================
//
// The org-wide HubSpot client — the merge of this repo's leads-back-office
// client and wander.com's services/hubspot/hubspot.client.ts superset
// (docs/hubspot-gateway-plan.md, Phase 1). Same account (22480390). Sections:
//   - SDK + account/object constants
//   - Owner/stage/status label maps + resolveHsLabel
//   - Round-robin tables
//   - Property types (write-side) + audit core property sets
//   - Internal helpers (setIfDefined, computeFieldsToWrite)
//   - Companies (find/batch/fuzzy finders, primitives, upsert, associations)
//   - Contacts (find, primitives, upsert)
//   - Deals (primitives, newestAssociatedDeal)
//   - Notes
//   - Round-robin assignment (nextRepInRR)
//
// Application logic (lead routing, classification) lives in route handlers
// and services. This file only wraps the HubSpot SDK.
//
// THE SAFETY PATTERN: `upsertCompany`/`upsertContact` are *audit-always* —
// they only backfill fields that are currently EMPTY in HubSpot, never
// overwriting a value the sales team has set. Use the `update*` primitives
// directly for deliberate force-overwrites (e.g. a human-approved merge).

export const isHubspotConfigured = !!env.HUBSPOT_ACCESS_TOKEN_OPERATED;

if (!isHubspotConfigured) {
  console.warn(
    "⚠️ [HubSpot] Not configured. Set HUBSPOT_ACCESS_TOKEN_OPERATED to enable.",
  );
}

export const HUBSPOT_ACCOUNT_ID = "22480390";

export const HS_USER_IDS = {
  CALEB: "626939739",
  MATT: "454414503",
  CHRIS: "725103433",
  SARA: "719905927",
  MATT_TASSELLO: "719905927",
  DOM: "214903427",
  CHEYENNE: "549722509",
  MASON: "974584257",
  MAGGIE: "721391641",
  JOANNA: "208326030",
  EMILIA: "1872230875",
  DRAYTON: "82799210",
  DANNY: "1881202681",
  KYLE: "331879496",
  NICK_LATHAM: "93243943",
  PAIGE: "93221525",
  SEAN: "94290553",
  KRIS: "91455876",
} as const;

export const LIFECYCLE_STAGES = {
  NOT_REACHED_OUT: "1036403070",
  WANDER_CUSTOMER: "1036421187",
  OPERATED_APPLICATION: "83628208",
} as const;

export const DEAL_PIPELINE_ID = "39561037";

export const DEAL_STAGES = {
  OPERATED_APPLICATION: "1037198347",
  CLOSED_WON: "83739491",
  LONG_TERM_NURTURE: "1077648942",
  INBOUND_OPPORTUNITY: "1357171823",
  PENDING_PMS_KEYS: "1345945994",
} as const;

// Lazily-initialized singleton so importing this module never throws when the
// token is absent (UI surfaces should degrade gracefully, not crash). One
// shared private app across wander.com and the gateway — provenance lives in
// custom properties, not app attribution (docs/hubspot-gateway-plan.md §4).
let _client: Client | null = null;
function client(): Client {
  if (!env.HUBSPOT_ACCESS_TOKEN_OPERATED) {
    throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED is not configured");
  }
  _client ??= new Client({ accessToken: env.HUBSPOT_ACCESS_TOKEN_OPERATED });
  return _client;
}

// =====================================================
// LABEL MAPS
// =====================================================

export const HS_OWNER_NAMES: Record<string, string> = {
  "76731285": "Pierce Butler",
  "78397510": "Halli Bentley",
  "79859550": "Skyler Rickey",
  "80091646": "Justin Showalter",
  "81852342": "Justin Vazquez",
  "82169697": "Will Nippert",
  "82330443": "Matt Montanti",
  "82799210": "Drayton D'Silva",
  "83165112": "Victor Lucio",
  "83558795": "Fabian Braunwalder",
  "85322075": "Nick Holmin",
  "86867841": "Sahil Mansuri",
  "87074777": "Chris Hidalgo",
  "87400771": "Brian Sun",
  "87642320": "Kristian Boe",
  "87716280": "Brooke Hughes",
  "88216214": "Tanya Botma",
  "88358451": "Nick Weiss",
  "89647181": "Guilherme Amorim",
  "90533170": "Torger Philosophos",
  "90838484": "Connor Adams",
  "90936550": "James Caswell",
  "91455876": "Kris Salguero",
  "202636522": "Chloey Sabino",
  "208326030": "Joanna Pascal",
  "214903427": "Dom Dawkins",
  "278239303": "Camille Toche",
  "295547527": "Nick Krekow",
  "331879496": "Kyle Tibbitts",
  "386649111": "Lauren Vargo",
  "403192645": "Rafael Leinio",
  "430737561": "Karolina Tenorio",
  "454414503": "Matthew Kowalewski",
  "549722509": "Cheyenne Clark",
  "626939739": "Caleb Cowher",
  "663245691": "Matt Tassello",
  "719905927": "Sara Lawrence",
  "721391641": "Maggie Tran",
  "725103433": "Chris Boley",
  "843039213": "Eleonora Laorenza",
  "974584257": "Mason Sweeney",
  "1780659420": "Brian Sun",
  "1872230875": "Emilia Sperandeo",
  "1881202681": "Danny Mancini",
  "75808450": "Saleem Musazay",
  "93243943": "Nick Latham",
  "93221525": "Paige Madigan",
  "94290553": "Sean Kearney",
};

export const HS_DEAL_STAGE_LABELS: Record<string, string> = {
  "1357171823": "Inbound Opportunity",
  "83739486": "Deep Dive",
  "83739489": "Negotiation",
  "83739490": "Contract Sent",
  "83739491": "Closed Won",
  "954338996": "Closed Lost",
  "1001512559": "DD No-Show/Rescheduling",
  "1042119055": "Nurture - Qualified",
  "1044572986": "Re-engage",
  "1054815391": "On Hold - Listed",
  "1077648942": "Long Term Nurture",
  "1088761875": "Unqualified",
  "1169870729": "On Hold - Operated",
  "1331053437": "Nurture - Pending Feature",
  "1331053438": "Nurture - Pending Integration",
  "1343759011": "Churned/Cancelled",
  "1345945994": "Pending PMS Keys",
};

export const HS_CONTACT_LEAD_STATUS_LABELS: Record<string, string> = {
  "MARKETING QUALIFIED LEAD": "Marketing Qualified Lead",
  "Listed Inbound": "Listed Inbound",
  "MQL - Intro Scheduled": "MQL - Intro Scheduled",
  "NEW LEAD": "New Lead",
  "New Lead - Research Needed": "New Lead - Research Needed",
  "IN PROGRESS": "In Progress",
  "DEAL CREATED": "Deep Dive Set",
  "NO RESPONSE": "No Response",
  "NOT INTERESTED": "Not Interested (Pitched)",
  "Not Interested (Did Not Pitch)": "Not Interested (Did Not Pitch)",
  REPLIED: "Replied",
  CONNECTED: "Connected",
  "FOLLOW UP": "Follow-Up Later",
  "Active Deal": "Active Deal",
  CUSTOMER: "Customer (won)",
  "RE-ENGAGE": "Re-Engage",
  "NO SHOW RESCHEDULE": "No-Show/Reschedule",
  "Wrong Number": "Wrong Number",
  "Email Bounced": "Email Bounced",
  "13 - Closed Lost": "Closed Lost",
  "Churned/Cancelled": "Churned/Cancelled",
  "ENRICH - Emails": "No Email",
  "ENRICH - Phones": "No Phone Number",
  "ENRICH - INVALID PHONES/EMAILS": "No Contact Info",
  "BRANDED NURTURE": "On Hold - Listed",
  "On Hold - International": "On Hold - International",
  "On Hold - Non-English": "On Hold - Non-English",
  "On Hold - Sites - Less than 6 Homes": "On Hold - < 10 Homes",
  "On Hold - Integrations": "On Hold - Not Integrated with PMS",
  "No Longer at Company": "No Longer at Company",
  "Unqualified - (Sites) No PMS": "Unqualified - No PMS",
  "Unqualified - (Sites) No Website": "Unqualified - No Website",
  "Unqualified - Hotel": "Unqualified - Hotel",
  "Unqualified - not a PM": "Unqualified - not a PM",
  "Unqualified - Campsite/Other": "Unqualified - Campsite/Other",
  "Unqualified - Multi-unit": "Unqualified - Multi-unit",
  "Unqualified (30-day)": "Unqualified - 30-day",
  "Unqualified - Request to Book": "Unqualified - Request to Book",
  "DNC - OPTED OUT": "DNC - Opted Out",
  "DNC - HOSTILE": "DNC - Hostile!",
  "DNC - CHURNED": "DNC - Churned Customer",
  "DNC - DNC REGISTRY": "DNC - DNC Registry",
  "DNC - SPAM": "DNC - Spam/Bot",
  "DNC - OTHER": "DNC - Other",
  "DNC - Oversupplied": "DNC - Oversupplied",
  "DNC - NOT THE OWNER": "DNC - Not the Owner",
  "ENRICH - NO LISTINGS": "ENRICH - No Listings Associated",
  "ENRICH - ICE BOX": "ENRICH - Ice Box",
  "ENRICH - SALE PENDING": "ENRICH - Sale Pending/Sold",
  "ENRICH - OTHER": "ENRICH - Other",
  "NON-OWNER - NEW LEAD": "NON-OWNER - New Lead",
  "NON-OWNER - IN PROGRESS": "NON-OWNER - In Progress",
  "NON-OWNER - CONNECTED": "NON-OWNER - Connected",
  NEW: "New Lead",
  "PENDING WW CHECK": "Pending WW check",
  "ON HOLD WORKING PM": "On Hold - Working PM",
  "ASSIGN TO PM": "Assign to PM-Branded",
  "PRIMARY RESIDENT": "Primary Resident (Nurture)",
  "OTA Link Inactive": "OTA Link Inactive",
  "Home Sold": "Home Sold",
  "Unqualified (not WW)": "Unqualified - not WW",
  "Unqualified (urban)": "Unqualified - Urban",
  "STR HOA RESTRICTIONS": "Unqualified - STR/HOA",
  "Unqualified (Apt/Condo)": "Unqualified - Apt/Condo",
  LTR: "Long-Term Renter",
};

export const HS_COMPANY_LEAD_STATUS_LABELS: Record<string, string> = {
  MQL: "Marketing Qualified Lead",
  "Listed Inbound": "Listed Inbound",
  NEW: "New Lead",
  "New Lead - Research Needed": "New Lead - Research Needed",
  IN_PROGRESS: "In Progress",
  "No Response": "No Response",
  Connected: "Connected - DM",
  "Connected - ADM": "Connected - ADM",
  "Deep Dive / Negotiation": "Deep Dive",
  "DD No-Show": "DD No-Show",
  "Post-DD (Active Deal)": "Post-DD (Active Deal)",
  "Closed Won": "Closed Won",
  "Closed Lost": "Closed Lost",
  "Churned/Cancelled": "Churned/Cancelled",
  "Follow Up Later": "Follow Up - Interested",
  "Follow Up - Not Interested": "Follow Up - Not Interested",
  "On Hold - Listed": "On Hold - Listed",
  "Nurture (International)": "On Hold - International",
  "On Hold - Non-English": "On Hold - Non-English",
  "On Hold - Sites - Less than 6 Homes": "On Hold - < 10 Homes",
  "On Hold - Integrations": "On Hold - Not Integrated with PMS",
  "Unqualified - No PMS": "Unqualified - No PMS",
  "Unqualified - (Sites) No Website": "Unqualified - No Website",
  "Unqualified - Hotel": "Unqualified - Hotel",
  "Unqualified (not a PM)": "Unqualified - not a PM",
  "Unqualified - Campsite/Other": "Unqualified - Campsite/Other",
  "Unqualified (Request to Book Only)": "Unqualified - Request to Book",
  "Unqualified - 30 Day Only": "Unqualified - 30-Day",
  "Unqualified - Parent Company": "Unqualified - Parent Company",
  "Unqualified - Multi-unit": "Unqualified - Multi-unit",
  "ENRICH - No Contact Info": "ENRICH - No Contact Info",
  DUPLICATE: "DUPLICATE",
  "DO NOT CONTACT": "DO NOT CONTACT",
};

export const HS_SLACK_IDS: Record<string, string> = {
  "725103433": "U06J2QPB5MF", // Chris Boley       chris@wander.com
  "91455876": "U0ASZMPDMPT", // Kris Salguero      kris@wander.com
  "76731285": "U089E1DKVB6", // Pierce Butler      pierce@wander.com
  "663245691": "U07CUJ86J4T", // Matt Tassello      mt@wander.com
  "90936550": "U0AT7UPJDA4", // James Caswell      james.caswell@wander.com
  "430737561": "U07AUS04ZGD", // Karolina Tenorio   karolina@wander.com
  "79859550": "U08Q9021E7L", // Skyler Rickey      skyler@wander.com
  "82330443": "U098FSXQV8B", // Matt Montanti      matt.montanti@wander.com
  "80091646": "U08RF1N4MSB", // Justin Showalter   justinshowalter@wander.com
  "86867841": "U0A6N3N88GM", // Sahil Mansuri      sahil@wander.com
  "90533170": "U0AHUCJV70E", // Torger Philosophos torger@wander.com
  "331879496": "U025DTBSU01", // Kyle Tibbitts      kyle@wander.com
  "626939739": "U066UKK0ZQF", // Caleb Cowher       caleb@wander.com
  "93243943": "U079E8943JL", // Nick Latham        nick@wander.com
  "93221525": "U0B68E2TE9L", // Paige Madigan      paige@wander.com
  "454414503": "U026FDF1L74", // Matt Kowalewski    matt@wander.com
  "94290553": "U0B8Y1Y36M6", // Sean Kearney       sean@wander.com
};

/** Resolve a HubSpot internal value to its display label; falls back to the raw value if unknown. */
export function resolveHsLabel(
  map: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) return "N/A";
  return map[value] ?? value;
}

// =====================================================
// ROUND-ROBIN TABLES
// =====================================================

export const AE_OTE_ROUND_ROBIN: Record<string, number> = {
  "91455876": 0.33, // Kris Salguero
  "94290553": 0.67, // Sean Kearney
};

export const AE_SMB_ROUND_ROBIN: Record<string, number> = {
  "76731285": 0.33, // Pierce Butler
  "725103433": 0.33, // Chris Boley
  "91455876": 0.33, // Kris Salguero
};

export const AE_MM_ROUND_ROBIN: Record<string, number> = {
  "90936550": 0.5, // James Caswell
  "663245691": 0.5, // Matt Tassello
};

export const AE_ENTERPRISE_ROUND_ROBIN: Record<string, number> = {
  "663245691": 0.5, // Matt Tassello
  "454414503": 0.5, // Matt Kowalewski
};

export const AE_STRATEGIC_ROUND_ROBIN: Record<string, number> = {
  "454414503": 1.0, // Matt Kowalewski
};

export const UNDER_10_ROUND_ROBIN: Record<string, number> = {
  "331879496": 1.0, // Kyle Tibbitts
};

export const BDR_OTE_ROUND_ROBIN: Record<string, number> = {
  "93221525": 0.5, // Paige Madigan
  "93243943": 0.5, // Nick Latham
};

export const BDR_SMB_ROUND_ROBIN: Record<string, number> = {
  "430737561": 0.33, // Karolina Tenorio
  "79859550": 0.33, // Skyler Rickey
  "93221525": 0.33, // Paige Madigan
};

export const BDR_MM_ROUND_ROBIN: Record<string, number> = {
  "82330443": 0.33, // Matt Montanti
  "80091646": 0.33, // Justin Showalter
  "93243943": 0.33, // Nick Latham
};

export const BDR_ENTERPRISE_ROUND_ROBIN: Record<string, number> = {
  "82330443": 0.5, // Matt Montanti
  "80091646": 0.5, // Justin Showalter
};

export const BDR_STRATEGIC_ROUND_ROBIN: Record<string, number> = {
  "82330443": 0.5, // Matt Montanti
  "80091646": 0.5, // Justin Showalter
};

// =====================================================
// PROPERTY TYPES
// =====================================================
//
// Write-side shape for the fields we send to HubSpot — the union of the
// leads-back-office fields and wander.com's inbound-router fields. Optional
// everywhere (every property is set conditionally per surface). Literal
// unions where the value set is fixed — catches typos in known values —
// except `hs_lead_status`, which stays `string` (the leads pipeline writes
// statuses outside wander.com's literal set).
//
// On reads (find*), values are surfaced as `string | null` regardless of
// these literal unions — HubSpot can return anything at runtime.

export type CompanyProperties = {
  domain?: string;
  name?: string;
  type?: "Wander Sites";
  hs_lead_status?: string;
  lifecyclestage?: string;
  hubspot_owner_id?: string;
  inbound_outbound?: "Inbound" | "Inbound - Sites";
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
  // Read-only context (used by the inbound router)
  notes_last_contacted?: string;
};

export type ContactProperties = {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  address?: string;
  jobtitle?: string;
  // Funnel classification
  inbound_outbound?: "Inbound" | "Inbound - Sites";
  hs_lead_status?: string;
  hubspot_owner_id?: string;
  lead_type?:
    | "WanderOS Email Signup"
    | "Listed Form Submission"
    | "Sites Form Submission";
  lifecyclestage?: string;
  hs_analytics_source?: string;
  // Form fields
  inbound_date?: string;
  meeting_booked_inbound_form?: "true" | "false";
  operated_application?: "true" | "false";
  portfolio_size_inbound_form?: string;
  direct_booking_site_inbound_form?: string;
  pms_inbound_form?: string;
  intent_inbound_form?: string;
  // AI-derived portfolio estimates. ai_guess_1_* is filled by Danny's Make.com
  // browseruse scenario; ai_guess_2_* is reserved for a future fast estimate.
  // HubSpot types: *_exact = number, *_range = string — numbers serialized as
  // strings on write, matching portfolio_size_inbound_form.
  portfolio_size_ai_guess_1_exact?: string;
  portfolio_size_ai_guess_1_range?: string;
  portfolio_size_ai_guess_2_exact?: string;
  portfolio_size_ai_guess_2_range?: string;
  // Human-reviewed two-touch pregen sequence token contract.
  growth_pregen_preview_url?: string;
  growth_pregen_touch_1_subject?: string;
  growth_pregen_touch_1_body?: string;
  growth_pregen_touch_2_subject?: string;
  growth_pregen_touch_2_body?: string;
  // Read-only context (used by the inbound router)
  notes_last_contacted?: string;
};

export type DealProperties = {
  dealname?: string;
  dealstage?: string;
  pipeline?: string;
  hubspot_owner_id?: string;
  bdr?: string;
  inbound_outbound?: "Inbound" | "Inbound - Sites";
  contract_type?: string;
  number_of_homes_signed?: string;
  wos_org_id?: string;
  pm_name_confirmed?: string;
  poc_email_confirmed?: string;
  pms__what_are_they_running_today?: string;
};

// =====================================================
// AUDIT CORE PROPERTIES
// =====================================================
//
// Always fetched by the find* primitives. The audit-pattern (don't trample
// sales-progressed values) operates on these keys by default. Add a field
// here when a new caller needs it for routing/audit decisions.

export const COMPANY_CORE_PROPERTIES = [
  "name",
  "domain",
  "hs_lead_status",
  "lifecyclestage",
  "hubspot_owner_id",
  "type",
  "inbound_outbound",
  "portfolio_size",
  "pms_ai_identified",
  "notes_last_contacted",
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
  "lifecyclestage",
  "lead_type",
  "inbound_outbound",
  "inbound_date",
  "notes_last_contacted",
  "portfolio_size_inbound_form",
  "direct_booking_site_inbound_form",
  "pms_inbound_form",
  "meeting_booked_inbound_form",
  "intent_inbound_form",
  "growth_pregen_preview_url",
  "growth_pregen_touch_1_subject",
  "growth_pregen_touch_1_body",
  "growth_pregen_touch_2_subject",
  "growth_pregen_touch_2_body",
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
    if (newValue === undefined || newValue === null || newValue === "")
      continue;
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

/**
 * Find a company by exact domain. Always returns the core property set;
 * pass `additionalProperties` to fetch more, which the return type narrows
 * accordingly. Returns null if none.
 */
export async function findCompanyByDomain<
  K extends keyof CompanyProperties = never,
>(
  domain: string,
  additionalProperties: K[] = [],
): Promise<{
  id: string;
  values: Record<CompanyCoreProperty | K, string | null>;
} | null> {
  try {
    const properties = Array.from(
      new Set<string>([...COMPANY_CORE_PROPERTIES, ...additionalProperties]),
    );
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
      properties,
      limit: 1,
      sorts: [],
    });

    const found = result.results[0];
    if (!found) return null;

    const values = {} as Record<CompanyCoreProperty | K, string | null>;
    for (const prop of COMPANY_CORE_PROPERTIES) {
      values[prop as CompanyCoreProperty | K] =
        (found.properties?.[prop] as string | undefined) ?? null;
    }
    for (const prop of additionalProperties) {
      values[prop] =
        (found.properties?.[prop as string] as string | undefined) ?? null;
    }
    return { id: found.id, values };
  } catch (err) {
    console.error(`❌ [HUBSPOT] findCompanyByDomain(${domain})`, err);
    throw err;
  }
}

/**
 * Find a company by domain, falling back to the first company associated with
 * the given contact if no domain match is found. Returns null if neither
 * lookup finds a result.
 */
export async function findCompany({
  domain,
  contactId,
}: {
  domain?: string | null;
  contactId?: string;
}): Promise<HubspotCompany | null> {
  const properties = [...COMPANY_CORE_PROPERTIES] as string[];

  const toResult = (found: {
    id: string;
    properties?: Record<string, string | null | undefined> | null;
  }): HubspotCompany => {
    const values = {} as Record<CompanyCoreProperty, string | null>;
    for (const prop of COMPANY_CORE_PROPERTIES) {
      values[prop] = found.properties?.[prop] ?? null;
    }
    return { id: found.id, values };
  };

  try {
    if (domain) {
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
        properties,
        limit: 1,
        sorts: [],
      });
      const found = result.results[0];
      if (found) return toResult(found);
    }

    if (contactId) {
      const associations = await client().crm.associations.v4.basicApi.getPage(
        "contacts",
        contactId,
        "companies",
      );
      const companyId = associations.results?.[0]?.toObjectId?.toString();
      if (companyId) {
        const found = await client().crm.companies.basicApi.getById(
          companyId,
          properties,
        );
        return toResult(found);
      }
    }

    return null;
  } catch (err) {
    console.error(
      `❌ [HUBSPOT] findCompany({ domain: ${domain}, contactId: ${contactId} })`,
      err,
    );
    throw err;
  }
}

/**
 * Batch-find companies by domain using the `IN` operator — one search per chunk
 * of domains instead of one request per domain (the search API has a low
 * per-second limit, so one-at-a-time gets rate-limited fast). Returns a map
 * keyed by lowercased domain; domains with no HubSpot company are simply absent.
 */
export async function findCompaniesByDomains(
  domains: string[],
): Promise<Map<string, HubspotCompany>> {
  const out = new Map<string, HubspotCompany>();
  const CHUNK = 80; // stay under HubSpot's per-search value cap
  for (let i = 0; i < domains.length; i += CHUNK) {
    const chunk = domains.slice(i, i + CHUNK);
    let after: string | undefined;
    do {
      const result = await client().crm.companies.searchApi.doSearch({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "domain",
                operator: FilterOperatorEnum.In,
                values: chunk,
              },
            ],
          },
        ],
        properties: [...COMPANY_CORE_PROPERTIES],
        limit: 100,
        after,
        sorts: [],
      });
      for (const found of result.results) {
        const values = {} as Record<CompanyCoreProperty, string | null>;
        for (const prop of COMPANY_CORE_PROPERTIES) {
          values[prop] =
            (found.properties?.[prop] as string | undefined) ?? null;
        }
        if (values.domain) {
          out.set(values.domain.toLowerCase(), { id: found.id, values });
        }
      }
      after = result.paging?.next?.after;
    } while (after);
  }
  return out;
}

// ---- Name / phone finders --------------------------------------------------
// For cross-referencing permit companies that don't have a domain. NAME is a
// weak/candidate signal (generic-name collisions — the "plum ∈ plumlee" trap);
// PHONE is high-precision because permit phones are real, government-filed. Both
// return a lightweight shape incl. lifecyclestage so callers can suppress
// existing customers before cold-emailing.

export type HubspotMatch = {
  id: string;
  name: string | null;
  domain: string | null;
  lifecycleStage: string | null;
  leadStatus: string | null;
  ownerId: string | null;
};

const MATCH_PROPS = [
  "name",
  "domain",
  "lifecyclestage",
  "hs_lead_status",
  "hubspot_owner_id",
];

function toCompanyMatch(found: {
  id: string;
  properties?: Record<string, string | null>;
}): HubspotMatch {
  const p = found.properties ?? {};
  return {
    id: found.id,
    name: p.name ?? null,
    domain: p.domain ?? null,
    lifecycleStage: p.lifecyclestage ?? null,
    leadStatus: p.hs_lead_status ?? null,
    ownerId: p.hubspot_owner_id ?? null,
  };
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

/** Weak candidate match — companies whose name contains the (cleaned) permit name tokens. */
export async function findCompaniesByName(
  name: string,
): Promise<HubspotMatch[]> {
  const q = name
    .replace(/\b(llc|inc|corp|co|ltd|the|holdings?)\b/gi, " ")
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (q.length < 3) return [];
  try {
    const result = await client().crm.companies.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "name",
              operator: FilterOperatorEnum.ContainsToken,
              value: q,
            },
          ],
        },
      ],
      properties: MATCH_PROPS,
      limit: 10,
      sorts: [],
    });
    return result.results.map((f) =>
      toCompanyMatch({ id: f.id, properties: f.properties }),
    );
  } catch {
    return [];
  }
}

/** High-precision — companies whose phone contains the permit phone digits. */
export async function findCompaniesByPhone(
  phone: string,
): Promise<HubspotMatch[]> {
  const digits = phoneDigits(phone);
  if (digits.length < 10) return [];
  try {
    const result = await client().crm.companies.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "phone",
              operator: FilterOperatorEnum.ContainsToken,
              value: digits,
            },
          ],
        },
      ],
      properties: MATCH_PROPS,
      limit: 10,
      sorts: [],
    });
    return result.results.map((f) =>
      toCompanyMatch({ id: f.id, properties: f.properties }),
    );
  } catch {
    return [];
  }
}

/** High-precision — contacts whose phone contains the permit phone digits. */
export async function findContactsByPhone(phone: string): Promise<
  Array<{
    id: string;
    email: string | null;
    ownerId: string | null;
    companyId: string | null;
  }>
> {
  const digits = phoneDigits(phone);
  if (digits.length < 10) return [];
  try {
    const result = await client().crm.contacts.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "phone",
              operator: FilterOperatorEnum.ContainsToken,
              value: digits,
            },
          ],
        },
      ],
      properties: [
        "email",
        "phone",
        "hs_lead_status",
        "hubspot_owner_id",
        "associatedcompanyid",
      ],
      limit: 10,
      sorts: [],
    });
    return result.results.map((c) => ({
      id: c.id,
      email: (c.properties?.email as string | undefined) ?? null,
      ownerId: (c.properties?.hubspot_owner_id as string | undefined) ?? null,
      companyId:
        (c.properties?.associatedcompanyid as string | undefined) ?? null,
    }));
  } catch {
    return [];
  }
}

/** Contacts associated with a company (decision-makers for the merge view). */
export async function getCompanyContacts(
  companyId: string,
  limit = 50,
): Promise<
  Array<{ id: string; values: Record<ContactCoreProperty, string | null> }>
> {
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
  try {
    const created = await client().crm.companies.basicApi.create({
      properties: props,
      associations: [],
    });
    console.log(
      `✅ [HUBSPOT] Created company ${created.id} (${props.domain ?? "<no domain>"})`,
    );
    return { id: created.id };
  } catch (err) {
    console.error("❌ [HUBSPOT] createCompany", err);
    throw err;
  }
}

/** Deliberate field write (use for human-approved merges / force-overwrites). */
export async function updateCompany(
  id: string,
  props: CompanyProperties,
): Promise<void> {
  try {
    await client().crm.companies.basicApi.update(id, {
      properties: props,
    });
  } catch (err) {
    console.error(`❌ [HUBSPOT] updateCompany(${id})`, err);
    throw err;
  }
}

/**
 * Audit-always upsert keyed by domain. New companies get the full `props`;
 * existing ones keep their values, empty fields backfilled. Reads back exactly
 * the fields it's about to write (not just the core set) so audit semantics
 * hold for non-core writable fields too. Returns the post-upsert core state
 * plus whether the company was created.
 */
export async function upsertCompany(
  domain: string,
  props: CompanyProperties,
): Promise<HubspotCompany & { created: boolean }> {
  const propsKeys = Object.keys(props) as (keyof CompanyProperties)[];
  const existing = await findCompanyByDomain(domain, propsKeys);

  if (!existing) {
    const created = await createCompany({ domain, ...props });
    const values = {} as Record<CompanyCoreProperty, string | null>;
    for (const key of COMPANY_CORE_PROPERTIES) {
      values[key] = props[key] ?? null;
    }
    return { id: created.id, values, created: true };
  }

  const fieldsToWrite = computeFieldsToWrite(existing.values, props);
  if (Object.keys(fieldsToWrite).length > 0) {
    await updateCompany(existing.id, fieldsToWrite);
  }

  const values = {} as Record<CompanyCoreProperty, string | null>;
  for (const key of COMPANY_CORE_PROPERTIES) {
    const old = existing.values[key];
    values[key] = old != null && old !== "" ? old : (props[key] ?? null);
  }
  return { id: existing.id, values, created: false };
}

/** Associate a contact to a company. Idempotent — already-associated returns 4xx, callers swallow. */
export async function associateContactToCompany(
  contactId: string,
  companyId: string,
): Promise<void> {
  try {
    await client().crm.associations.v4.basicApi.create(
      "companies",
      companyId,
      "contacts",
      contactId,
      [
        {
          associationCategory:
            AssociationSpecAssociationCategoryEnum.HubspotDefined,
          associationTypeId: 2,
        },
      ],
    );
  } catch (err) {
    console.error(
      `❌ [HUBSPOT] associateContactToCompany(${contactId}, ${companyId})`,
      err,
    );
    throw err;
  }
}

// =====================================================
// CONTACTS
// =====================================================

/**
 * Find a contact by email. Always returns the core property set
 * (`CONTACT_CORE_PROPERTIES`); pass `additionalProperties` to fetch more,
 * which the return type narrows accordingly.
 */
export async function findContactByEmail<
  K extends keyof ContactProperties = never,
>(
  email: string,
  additionalProperties: K[] = [],
): Promise<{
  id: string;
  values: Record<ContactCoreProperty | K, string | null>;
} | null> {
  try {
    const properties = Array.from(
      new Set<string>([...CONTACT_CORE_PROPERTIES, ...additionalProperties]),
    );
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
      properties,
      limit: 1,
      sorts: [],
    });

    const found = result.results[0];
    if (!found) return null;

    const values = {} as Record<ContactCoreProperty | K, string | null>;
    for (const prop of CONTACT_CORE_PROPERTIES) {
      values[prop as ContactCoreProperty | K] =
        (found.properties?.[prop] as string | undefined) ?? null;
    }
    for (const prop of additionalProperties) {
      values[prop] =
        (found.properties?.[prop as string] as string | undefined) ?? null;
    }
    return { id: found.id, values };
  } catch (err) {
    console.error(`❌ [HUBSPOT] findContactByEmail(${email})`, err);
    throw err;
  }
}

export async function createContact(
  props: ContactProperties,
): Promise<{ id: string }> {
  try {
    const created = await client().crm.contacts.basicApi.create({
      properties: props,
      associations: [],
    });
    console.log(
      `✅ [HUBSPOT] Created contact ${created.id} (${props.email ?? "<no email>"})`,
    );
    return { id: created.id };
  } catch (err) {
    console.error("❌ [HUBSPOT] createContact", err);
    throw err;
  }
}

export async function updateContact(
  id: string,
  props: ContactProperties,
): Promise<void> {
  try {
    await client().crm.contacts.basicApi.update(id, {
      properties: props,
    });
  } catch (err) {
    console.error(`❌ [HUBSPOT] updateContact(${id})`, err);
    throw err;
  }
}

/**
 * Audit-always upsert keyed by email. Same semantics as `upsertCompany`.
 * Returns the post-upsert core state plus whether the contact was created.
 */
export async function upsertContact(
  email: string,
  props: ContactProperties,
): Promise<{
  id: string;
  values: Record<ContactCoreProperty, string | null>;
  created: boolean;
}> {
  const propsKeys = Object.keys(props) as (keyof ContactProperties)[];
  const existing = await findContactByEmail(email, propsKeys);

  if (!existing) {
    const created = await createContact({ email, ...props });
    const values = {} as Record<ContactCoreProperty, string | null>;
    for (const key of CONTACT_CORE_PROPERTIES) {
      values[key] = props[key] ?? null;
    }
    return { id: created.id, values, created: true };
  }

  const fieldsToWrite = computeFieldsToWrite(existing.values, props);
  if (Object.keys(fieldsToWrite).length > 0) {
    await updateContact(existing.id, fieldsToWrite);
  }

  const values = {} as Record<ContactCoreProperty, string | null>;
  for (const key of CONTACT_CORE_PROPERTIES) {
    const old = existing.values[key];
    values[key] = old != null && old !== "" ? old : (props[key] ?? null);
  }
  return { id: existing.id, values, created: false };
}

// =====================================================
// DEALS
// =====================================================

export async function createDeal(
  props: DealProperties,
): Promise<{ id: string }> {
  try {
    const created = await client().crm.deals.basicApi.create({
      properties: props,
    });
    console.log(
      `✅ [HUBSPOT] Created deal ${created.id} (${props.dealname ?? "<no name>"})`,
    );
    return { id: created.id };
  } catch (err) {
    console.error("❌ [HUBSPOT] createDeal", err);
    throw err;
  }
}

export async function updateDeal(
  id: string,
  props: DealProperties,
): Promise<void> {
  try {
    await client().crm.deals.basicApi.update(id, {
      properties: props,
    });
  } catch (err) {
    console.error(`❌ [HUBSPOT] updateDeal(${id})`, err);
    throw err;
  }
}

export async function associateDealToContact(
  dealId: string,
  contactId: string,
): Promise<void> {
  try {
    await client().crm.associations.v4.basicApi.create(
      "deals",
      dealId,
      "contacts",
      contactId,
      [
        {
          associationCategory:
            AssociationSpecAssociationCategoryEnum.HubspotDefined,
          associationTypeId: 3,
        },
      ],
    );
  } catch (err) {
    console.error(
      `❌ [HUBSPOT] associateDealToContact(${dealId}, ${contactId})`,
      err,
    );
    throw err;
  }
}

export async function associateDealToCompany(
  dealId: string,
  companyId: string,
): Promise<void> {
  try {
    await client().crm.associations.v4.basicApi.create(
      "deals",
      dealId,
      "companies",
      companyId,
      [
        {
          associationCategory:
            AssociationSpecAssociationCategoryEnum.HubspotDefined,
          associationTypeId: 5,
        },
      ],
    );
  } catch (err) {
    console.error(
      `❌ [HUBSPOT] associateDealToCompany(${dealId}, ${companyId})`,
      err,
    );
    throw err;
  }
}

export type NewestAssociatedDeal = {
  id: string;
  hubspot_owner_id: string | null;
  bdr: string | null;
  createdate: string | null;
  notes_last_contacted: string | null;
  deep_dive_date: string | null;
  inbound_outbound: string | null;
  dealname: string | null;
  dealstage: string | null;
  contract_type: string | null;
  date_entered_closed_won: string | null;
  number_of_homes_signed: string | null;
};

/**
 * Cross-object query: fetch all deals associated with a contact AND/OR company,
 * dedupe, and return the newest by `createdate`.
 */
export async function newestAssociatedDeal({
  contactId,
  companyId,
}: {
  contactId?: string;
  companyId?: string;
}): Promise<NewestAssociatedDeal | null> {
  if (!contactId && !companyId) return null;

  try {
    const fetchDealIds = async (
      objectType: "contacts" | "companies",
      objectId: string,
    ) => {
      const associations = await client().crm.associations.v4.basicApi.getPage(
        objectType,
        objectId,
        "deals",
      );
      return (associations.results ?? []).map((association) =>
        association.toObjectId.toString(),
      );
    };

    const [contactDealIds, companyDealIds] = await Promise.all([
      contactId ? fetchDealIds("contacts", contactId) : [],
      companyId ? fetchDealIds("companies", companyId) : [],
    ]);

    const dealIds = [...new Set([...contactDealIds, ...companyDealIds])];

    if (dealIds.length === 0) return null;

    const deals = await Promise.all(
      dealIds.map((id) =>
        client().crm.deals.basicApi.getById(id, [
          "dealname",
          "hubspot_owner_id",
          "bdr",
          "createdate",
          "notes_last_contacted",
          "deep_dive_date",
          "inbound_outbound",
          "dealstage",
          "contract_type",
          "date_entered_closed_won",
          "number_of_homes_signed",
        ]),
      ),
    );

    type Deal = (typeof deals)[number];
    const newestDeal = deals.reduce((newest: Deal, current: Deal) => {
      const newestDate = Date.parse(newest.properties?.createdate ?? "");
      const currentDate = Date.parse(current.properties?.createdate ?? "");
      if (Number.isNaN(newestDate)) return current;
      if (Number.isNaN(currentDate)) return newest;
      return currentDate > newestDate ? current : newest;
    });

    return {
      id: newestDeal.id,
      dealname: newestDeal.properties?.dealname ?? null,
      hubspot_owner_id: newestDeal.properties?.hubspot_owner_id ?? null,
      bdr: newestDeal.properties?.bdr ?? null,
      createdate: newestDeal.properties?.createdate ?? null,
      notes_last_contacted: newestDeal.properties?.notes_last_contacted ?? null,
      deep_dive_date: newestDeal.properties?.deep_dive_date ?? null,
      inbound_outbound: newestDeal.properties?.inbound_outbound ?? null,
      dealstage: newestDeal.properties?.dealstage ?? null,
      contract_type: newestDeal.properties?.contract_type ?? null,
      date_entered_closed_won:
        newestDeal.properties?.date_entered_closed_won ?? null,
      number_of_homes_signed:
        newestDeal.properties?.number_of_homes_signed ?? null,
    };
  } catch (err) {
    console.error(
      `❌ [HUBSPOT] newestAssociatedDeal({ contactId: ${contactId}, companyId: ${companyId} })`,
      err,
    );
    throw err;
  }
}

// =====================================================
// NOTES
// =====================================================

export async function createNote(body: string): Promise<{ id: string }> {
  try {
    const note = await client().crm.objects.notes.basicApi.create({
      properties: {
        hs_timestamp: new Date().toISOString(),
        hs_note_body: body,
      },
      associations: [],
    });
    return { id: note.id };
  } catch (err) {
    console.error("❌ [HUBSPOT] createNote", err);
    throw err;
  }
}

export async function associateNoteToContact(
  noteId: string,
  contactId: string,
): Promise<void> {
  try {
    // Note: associations v4 create expects number IDs for notes
    await client().crm.associations.v4.basicApi.create(
      "notes",
      noteId,
      "contacts",
      contactId,
      [
        {
          associationCategory: "HUBSPOT_DEFINED" as never,
          associationTypeId: 202,
        },
      ],
    );
  } catch (err) {
    console.error(
      `❌ [HUBSPOT] associateNoteToContact(${noteId}, ${contactId})`,
      err,
    );
    throw err;
  }
}

// =====================================================
// ROUND-ROBIN ASSIGNMENT
// =====================================================

type PortfolioSizeFilter = { min?: number; max?: number };

function getRoundRobinForProperties(
  numProperties: number,
  role: "AE" | "BDR",
): { rr: Record<string, number>; sizeFilter: PortfolioSizeFilter } | null {
  if (numProperties < 10)
    return { rr: UNDER_10_ROUND_ROBIN, sizeFilter: { max: 9 } };
  if (numProperties < 20)
    return {
      rr: role === "BDR" ? BDR_OTE_ROUND_ROBIN : AE_OTE_ROUND_ROBIN,
      sizeFilter: { min: 10, max: 19 },
    };
  if (numProperties < 50)
    return {
      rr: role === "BDR" ? BDR_SMB_ROUND_ROBIN : AE_SMB_ROUND_ROBIN,
      sizeFilter: { min: 20, max: 49 },
    };
  if (numProperties < 200)
    return {
      rr: role === "BDR" ? BDR_MM_ROUND_ROBIN : AE_MM_ROUND_ROBIN,
      sizeFilter: { min: 50, max: 199 },
    };
  if (numProperties < 500)
    return {
      rr:
        role === "BDR" ? BDR_ENTERPRISE_ROUND_ROBIN : AE_ENTERPRISE_ROUND_ROBIN,
      sizeFilter: { min: 200, max: 499 },
    };
  if (numProperties >= 500)
    return {
      rr: role === "BDR" ? BDR_STRATEGIC_ROUND_ROBIN : AE_STRATEGIC_ROUND_ROBIN,
      sizeFilter: { min: 500 },
    };
  return null;
}

/**
 * Returns the HubSpot owner ID of the next person in line for the round robin
 * corresponding to the given portfolio size. Whoever has the greatest deficit
 * (their weight minus their actual share of this month's inbound contacts) is
 * returned.
 *
 * @param role    'AE' uses the AE_* round-robin tables; 'BDR' uses BDR_* tables.
 * @param source  'OS' filters contacts with inbound_outbound = 'Inbound - Sites';
 *                'Listed' filters contacts with inbound_outbound = 'Inbound'.
 */
export async function nextRepInRR(
  numProperties: number,
  role: "AE" | "BDR" = "AE",
  source: "OS" | "Listed" = "OS",
): Promise<string | null> {
  const tier = getRoundRobinForProperties(numProperties, role);
  if (!tier) return null;

  const { rr, sizeFilter } = tier;
  const ownerIds = Object.keys(rr);
  if (ownerIds.length === 0) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startOfNextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
  ).getTime();

  const inboundOutboundValue =
    source === "Listed" ? "Inbound" : "Inbound - Sites";
  const ownerIdPropertyName = role === "AE" ? "hubspot_owner_id" : "bdr_for_rr";

  const filters: Array<{
    propertyName: string;
    operator: FilterOperatorEnum;
    value?: string;
    values?: string[];
  }> = [
    {
      propertyName: "inbound_date",
      operator: FilterOperatorEnum.Gte,
      value: String(startOfMonth),
    },
    {
      propertyName: "inbound_date",
      operator: FilterOperatorEnum.Lt,
      value: String(startOfNextMonth),
    },
    {
      propertyName: ownerIdPropertyName,
      operator: FilterOperatorEnum.In,
      values: ownerIds,
    },
    {
      propertyName: "inbound_outbound",
      operator: FilterOperatorEnum.Eq,
      value: inboundOutboundValue,
    },
  ];

  if (sizeFilter.min !== undefined) {
    filters.push({
      propertyName: "portfolio_size_inbound_form",
      operator: FilterOperatorEnum.Gte,
      value: String(sizeFilter.min),
    });
  }
  if (sizeFilter.max !== undefined) {
    filters.push({
      propertyName: "portfolio_size_inbound_form",
      operator: FilterOperatorEnum.Lte,
      value: String(sizeFilter.max),
    });
  }

  const counts: Record<string, number> = Object.fromEntries(
    ownerIds.map((id) => [id, 0]),
  );
  let after: string | undefined;

  do {
    const result = await client().crm.contacts.searchApi.doSearch({
      filterGroups: [{ filters }],
      properties: [ownerIdPropertyName],
      limit: 100,
      sorts: [],
      ...(after ? { after } : {}),
    });

    for (const contact of result.results) {
      const ownerId = contact.properties?.[ownerIdPropertyName];
      if (ownerId && ownerId in counts) {
        counts[ownerId] = (counts[ownerId] ?? 0) + 1;
      }
    }

    after = (result.paging?.next as { after?: string } | undefined)?.after;
  } while (after);

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  let nextRep = ownerIds[0];
  let maxDeficit = -Infinity;

  for (const [ownerId, weight] of Object.entries(rr)) {
    const actualPct = total === 0 ? 0 : (counts[ownerId] ?? 0) / total;
    const deficit = weight - actualPct;
    if (deficit > maxDeficit) {
      maxDeficit = deficit;
      nextRep = ownerId;
    }
  }

  return nextRep ?? null;
}
