import "server-only";

import {
  type CompanyProperties,
  type ContactProperties,
  DEAL_PIPELINE_ID,
  DEAL_STAGES,
  type DealProperties,
  HS_COMPANY_LEAD_STATUS_LABELS,
  HS_CONTACT_LEAD_STATUS_LABELS,
  HS_DEAL_STAGE_LABELS,
  HS_OWNER_NAMES,
  HS_SLACK_IDS,
  HS_USER_IDS,
  HUBSPOT_ACCOUNT_ID,
  associateContactToCompany,
  associateDealToCompany,
  associateDealToContact,
  createCompany,
  createContact,
  createDeal,
  findCompany,
  findContactByEmail,
  findOwnerByEmail,
  newestAssociatedDeal,
  nextRepInRR,
  resolveHsLabel,
  updateCompany,
  updateContact,
  updateDeal,
} from "@/server/clients/hubspot.client";
import { envSelect } from "@/env";
import { postOnSlack } from "@/server/clients/slack.client";
import { mapPmsToHsValues } from "@/server/services/pms-mapping.service";
import { getEmailDomain, isPersonalEmail } from "@/lib/email";
import { resolveOnboardingSlackHeadline } from "@/lib/onboarding-slack";

// =====================================================
// INBOUND LEAD ROUTER
// =====================================================
//
// Ported verbatim from wander.com src/app/api/os/inbound/route.ts (Phase 3 of
// docs/hubspot-gateway-plan.md). Every inbound lead — WanderOS signups, Listed
// applications, Meta forms, onboarding completions — flows through here:
// classify against existing HubSpot state, assign via round-robin, upsert
// contact/company/deal, notify sales on Slack. Exposed to callers (wander.com)
// through POST /api/hubspot/v1/inbound. Classification logic is intentionally
// unchanged from the wander.com original — diff against it when reviewing.

const OS_INBOUND_RADIO_CHANNEL_ID = "C0A3PMXE3MG";
// Test traffic goes here instead — same channel growth's postOnSlack redirects
// to on non-prod deployments. Covers the gap where test traffic (e.g. a
// wander.com preview) hits growth PROD, which envSelect can't detect.
const SLACK_TESTING_CHANNEL = "radio-slack-testing";

/** Escape user input for Slack mrkdwn to prevent injection of mentions, links, etc. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Normalize user-typed site URL: add scheme if missing, strip query/hash. */
export function normalizeSiteUrl(raw: string): string {
  try {
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    const { href: full } = new URL(href);
    return full.split("?")[0]?.split("#")[0] ?? full;
  } catch {
    return raw;
  }
}

/** Extract bare hostname (no scheme, no www, no path) for HubSpot company lookup. */
export function extractDomain(siteUrl: string): string {
  try {
    const href = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    return new URL(href).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Returns the domain portion of an email for HubSpot company lookup, or null for personal email providers. */
export function extractEmailDomain(email: string): string | null {
  if (isPersonalEmail(email)) return null;
  return getEmailDomain(email) || null;
}

/**
 * Heuristic: does this phone number carry a non-US/Canada country code?
 * Treats a leading "+" (or "00" international access prefix) followed by a
 * country code other than "1" as international. A number with no country-code
 * prefix, or one starting with +1, is assumed domestic (US/CA). Used to route
 * international inbound leads to Kris instead of the normal round-robin.
 */
export function isInternationalPhone(
  phone: string | null | undefined,
): boolean {
  if (!phone) return false;
  const normalized = phone.trim().replace(/^00/, "+");
  if (!normalized.startsWith("+")) return false;
  const digits = normalized.slice(1).replace(/\D/g, "");
  return digits.length > 0 && !digits.startsWith("1");
}

// contract_type values (HubSpot "Agreement Type" on deals) that qualify as wOS/WanderOS deals
const WOS_CONTRACT_TYPES = new Set([
  "Wander Sites",
  "PM - Listed & Sites",
  "SM - Listed & Sites",
  "SM - Sites",
]);

function isWosDeal(
  deal: { contract_type: string | null } | null,
): deal is { contract_type: string } {
  return (
    deal?.contract_type != null && WOS_CONTRACT_TYPES.has(deal.contract_type)
  );
}

type LeadType =
  | "Closed Won wOS Deal"
  | "Active wOS Deal"
  | "Inactive wOS Deal"
  | "Active Lead"
  | "Resubmission"
  | "Inactive Lead"
  | "New Inbound Lead";

/** Parse a HubSpot date value to ms — handles ISO strings and epoch-ms-as-string (inbound_date). */
function parseDateMs(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const asNumber = Number(dateStr);
  if (!Number.isNaN(asNumber)) return asNumber;
  const parsed = Date.parse(dateStr);
  return Number.isNaN(parsed) ? null : parsed;
}

function isWithinDays(dateStr: string | null, days: number): boolean {
  const ms = parseDateMs(dateStr);
  return ms !== null && Date.now() - ms < days * 24 * 60 * 60 * 1000;
}

/** Returns a Slack @mention if the owner has a known Slack ID, otherwise falls back to their display name. */
function slackMention(ownerId: string | null | undefined): string {
  if (!ownerId) return "N/A";
  const slackId = HS_SLACK_IDS[ownerId];
  return slackId
    ? `<@${slackId}>`
    : esc(resolveHsLabel(HS_OWNER_NAMES, ownerId));
}

function formatHSDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  const ms = parseDateMs(dateStr);
  if (ms === null) return dateStr;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Upserts the contact and company for an OS inbound lead, then associates them.
 * Each operation is isolated — a failure on one does not block the other.
 * tagAsInbound controls whether inbound-specific fields (owner, inbound_date,
 * lead_type) are written; false for leads that are already actively worked.
 */
/**
 * Wander's qualification bar for a WanderOS inbound is a portfolio of 10+
 * units; anything smaller parks in the portal's "< 10 Homes" hold status and a
 * missing count needs research before an AE touches it. Listed inbounds keep
 * their own status. Same rule for the contact and the company, in each
 * object's own status vocabulary.
 */
export function inboundLeadStatus(
  object: "contact" | "company",
  input: { isListedSource: boolean; numberOfProperties: string },
): string {
  if (input.isListedSource) return "Listed Inbound";
  const units = Number(input.numberOfProperties);
  if (!Number.isFinite(units) || units <= 0)
    return "New Lead - Research Needed";
  if (units < 10) return "On Hold - Sites - Less than 6 Homes";
  return object === "contact" ? "MARKETING QUALIFIED LEAD" : "MQL";
}

async function upsertOsInboundLead(data: {
  existing: {
    contact: Awaited<ReturnType<typeof findContactByEmail>>;
    company: Awaited<ReturnType<typeof findCompany>>;
    deal: Awaited<ReturnType<typeof newestAssociatedDeal>>;
  };
  email: string;
  domain: string | null;
  siteUrl: string | null;
  numberOfProperties: string;
  aeForRR: string;
  tagAsInbound: boolean;
  isListedSource: boolean;
  pmsMeta?: string | null;
  intentMeta?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  orgId?: string | null;
  orgName?: string | null;
  onboardingComplete?: boolean;
  currentLeadOwner?: string;
  currentDealOwner?: string;
  isResubmission?: boolean;
}): Promise<{
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
}> {
  const {
    existing,
    email,
    domain,
    siteUrl,
    numberOfProperties,
    aeForRR,
    tagAsInbound,
    isListedSource,
    pmsMeta,
    intentMeta,
    firstName,
    lastName,
    phone,
    orgId,
    orgName,
    onboardingComplete,
    currentLeadOwner,
    isResubmission,
  } = data;

  const { pmsCompany, pmsDeal } = await mapPmsToHsValues(pmsMeta);

  // ── Contact ──────────────────────────────────────────
  const contactProps: ContactProperties = {
    ...(Number(numberOfProperties) > 0 && {
      portfolio_size_inbound_form: numberOfProperties,
    }),
    ...(firstName && { firstname: firstName }),
    ...(lastName && { lastname: lastName }),
    ...(phone && { phone }),
    ...(siteUrl && { direct_booking_site_inbound_form: siteUrl }),
    ...(pmsMeta && { pms_inbound_form: pmsMeta }),
    ...(intentMeta && { intent_inbound_form: intentMeta }),
    ...(tagAsInbound && {
      inbound_outbound: isListedSource
        ? ("Inbound" as const)
        : ("Inbound - Sites" as const),
      hubspot_owner_id: aeForRR,
      inbound_date: String(Date.now()),
      lead_type: isListedSource
        ? ("Listed Form Submission" as const)
        : ("WanderOS Email Signup" as const),
    }),
  };

  let contactId: string | null = null;
  try {
    if (existing.contact) {
      if (Object.keys(contactProps).length > 0) {
        await updateContact(existing.contact.id, contactProps);
      }
      contactId = existing.contact.id;
    } else {
      const created = await createContact({
        email,
        ...contactProps,
        hs_lead_status: inboundLeadStatus("contact", {
          isListedSource,
          numberOfProperties,
        }),
      });
      contactId = created.id;
    }
  } catch (err) {
    console.error(
      "❌ [inbound-router] upsertOsInboundLead: contact upsert failed",
      err,
    );
  }

  // ── Company (only when we have a domain) ────────────
  let companyId: string | null = null;
  if (domain) {
    const companyProps: CompanyProperties = {
      ...(Number(numberOfProperties) > 0 && {
        portfolio_size: numberOfProperties,
      }),
      ...(pmsCompany && { pms_ai_identified: pmsCompany }),
      ...(tagAsInbound && {
        inbound_outbound: isListedSource
          ? ("Inbound" as const)
          : ("Inbound - Sites" as const),
        hubspot_owner_id: aeForRR,
      }),
    };

    try {
      if (existing.company) {
        if (Object.keys(companyProps).length > 0) {
          await updateCompany(existing.company.id, companyProps);
        }
        companyId = existing.company.id;
      } else {
        const created = await createCompany({
          domain,
          ...companyProps,
          name: domain,
          hs_lead_status: inboundLeadStatus("company", {
            isListedSource,
            numberOfProperties,
          }),
          type: "Wander Sites",
        });
        companyId = created.id;
      }
    } catch (err) {
      console.error(
        "❌ [inbound-router] upsertOsInboundLead: company upsert failed",
        err,
      );
    }
  }

  let dealId: string | null = existing.deal?.id ?? null;
  let dealCreated = false;
  // ── Deal ─────────────────────────────────────────────────────────

  const dealProps: DealProperties = {
    contract_type: isListedSource ? "PM Deal" : "Wander Sites", // 'PM Deal' -> internal value for "PM - Listed"
    ...(Number(numberOfProperties) > 0 && {
      number_of_homes_signed: numberOfProperties,
    }),
    ...(orgId && { wos_org_id: orgId }),
    ...(orgName && { pm_name_confirmed: orgName }),
    ...(email && { poc_email_confirmed: email }),
    ...(pmsDeal && { pms__what_are_they_running_today: pmsDeal }),
    ...(tagAsInbound && {
      inbound_outbound: isListedSource
        ? ("Inbound" as const)
        : ("Inbound - Sites" as const),
      hubspot_owner_id: aeForRR,
    }),
  };

  if (dealId) {
    if (tagAsInbound || isResubmission) {
      if (onboardingComplete) {
        dealProps.pipeline = DEAL_PIPELINE_ID;
        dealProps.dealstage = DEAL_STAGES.CLOSED_WON;
        dealProps.hubspot_owner_id = HS_USER_IDS.KYLE;
        dealProps.bdr = HS_USER_IDS.KYLE;
      } else if (tagAsInbound) {
        dealProps.hubspot_owner_id = aeForRR;
        dealProps.bdr = aeForRR;
      }
    }
    try {
      await updateDeal(dealId, dealProps);
    } catch (err) {
      console.error(
        "❌ [inbound-router] upsertOsInboundLead: deal update failed",
        err,
      );
    }
  } else {
    if (onboardingComplete) {
      dealProps.dealname = `${isListedSource ? "Listed" : "wOS"} Inbound - ${orgName || domain || email} - ${numberOfProperties} Units`;
      dealProps.pipeline = DEAL_PIPELINE_ID;
      dealProps.dealstage = DEAL_STAGES.CLOSED_WON;
      if (tagAsInbound || isResubmission) {
        dealProps.hubspot_owner_id = HS_USER_IDS.KYLE;
        dealProps.bdr = HS_USER_IDS.KYLE;
      } else {
        dealProps.hubspot_owner_id = currentLeadOwner ?? HS_USER_IDS.KYLE;
        dealProps.bdr = currentLeadOwner ?? HS_USER_IDS.KYLE;
      }
      try {
        const created = await createDeal(dealProps);
        dealId = created.id;
        dealCreated = true;
      } catch (err) {
        console.error(
          "❌ [inbound-router] upsertOsInboundLead: deal create failed",
          err,
        );
      }
    } else if (tagAsInbound) {
      dealProps.dealname = `${isListedSource ? "Listed" : "wOS"} Inbound - ${orgName || domain || email} - ${numberOfProperties} Units`;
      dealProps.pipeline = DEAL_PIPELINE_ID;
      dealProps.dealstage = DEAL_STAGES.INBOUND_OPPORTUNITY;
      dealProps.hubspot_owner_id = aeForRR;
      dealProps.bdr = aeForRR;
      try {
        const created = await createDeal(dealProps);
        dealId = created.id;
        dealCreated = true;
      } catch (err) {
        console.error(
          "❌ [inbound-router] upsertOsInboundLead: deal create failed",
          err,
        );
      }
    }
  }

  // ── Association ──────────────────────────────────────
  if (dealCreated && dealId) {
    if (contactId) {
      try {
        await associateDealToContact(dealId, contactId);
      } catch (err) {
        console.error(
          "❌ [inbound-router] upsertOsInboundLead: deal↔contact association failed",
          err,
        );
      }
    }
    if (companyId) {
      try {
        await associateDealToCompany(dealId, companyId);
      } catch (err) {
        console.error(
          "❌ [inbound-router] upsertOsInboundLead: deal↔company association failed",
          err,
        );
      }
    }
  }

  if (contactId && companyId) {
    try {
      await associateContactToCompany(contactId, companyId);
    } catch (err) {
      // Already-associated returns a 4xx; harmless to swallow.
      console.error(
        "❌ [inbound-router] upsertOsInboundLead: contact↔company association failed",
        err,
      );
    }
  }

  return { contactId, companyId, dealId };
}

export async function osInboundLeadRouter({
  email,
  domain,
  siteUrl,
  numberOfProperties,
  pmsMeta,
  intentMeta,
  source,
  queryParams,
  firstName,
  lastName,
  phone,
  orgId,
  orgName,
  onboardingComplete,
  salesRepEmail,
  test,
}: {
  email: string;
  domain: string | null;
  siteUrl: string | null;
  numberOfProperties: number;
  pmsMeta?: string | null;
  intentMeta?: string | null;
  source: string;
  queryParams?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  orgId?: string | null;
  orgName?: string | null;
  onboardingComplete?: boolean;
  salesRepEmail?: string | null;
  /** Caller is not production (e.g. wander.com preview) — Slack goes to the testing channel. */
  test?: boolean;
}): Promise<{ contactId: string | null; companyId: string | null }> {
  // Step 1: Search contact by email
  let contact: Awaited<ReturnType<typeof findContactByEmail>> = null;
  try {
    contact = await findContactByEmail(email);
  } catch (err) {
    console.error(
      "❌ [inbound-router] osInboundLeadRouter: contact search failed",
      err,
    );
  }

  // Step 2: Search company by domain, falling back to contact association
  let company: Awaited<ReturnType<typeof findCompany>> = null;
  try {
    company = await findCompany({ domain, contactId: contact?.id });
  } catch (err) {
    console.error(
      "❌ [inbound-router] osInboundLeadRouter: company search failed",
      err,
    );
  }

  let leadType: LeadType = "New Inbound Lead";

  let tagAsInbound = true;
  let officialInboundUnits: number = numberOfProperties;

  // Deal-path variables (steps 6–7)
  let currentDealOwner: string | undefined;
  let bdr: string | undefined;
  let dealLastContacted: string | null = null;
  let dealStage: string | undefined;
  let dealDateEnteredCw: string | null = null;
  let dealName: string | null = null;
  let dealCreatedAt: string | null = null;
  let dealIsInbound = false;

  // Lead-path variables (steps 8–9)
  let currentLeadOwner: string | undefined;
  let lastContacted: string | null = null;
  let leadStatus: string | undefined;
  let leadStatusSource: "contact" | "company" | undefined;
  let inboundDate: string | null = null;
  let companyName: string | null = null;

  // Step 3: Skip steps 4–10 when neither contact nor company exists
  let deal: Awaited<ReturnType<typeof newestAssociatedDeal>> = null;
  if (contact || company) {
    // Steps 4–5: Pull all deals for the contact AND company; find the most recently created
    try {
      deal = await newestAssociatedDeal({
        contactId: contact?.id,
        companyId: company?.id,
      });
    } catch (err) {
      console.error(
        "❌ [inbound-router] osInboundLeadRouter: deal fetch failed",
        err,
      );
    }

    // Step 6: Check whether the newest deal is a wOS/WanderOS agreement type
    if (isWosDeal(deal)) {
      currentDealOwner = deal.hubspot_owner_id ?? undefined;
      bdr = deal.bdr ?? undefined;
      dealLastContacted = deal.notes_last_contacted;
      dealStage = deal.dealstage ?? undefined;
      dealDateEnteredCw = deal.date_entered_closed_won ?? null;
      dealName = deal.dealname ?? null;
      dealCreatedAt = deal.createdate ?? null;
      dealIsInbound = deal.inbound_outbound === "Inbound - Sites";

      // Step 7: Active if last contacted within 30 days, otherwise Inactive
      if (dealStage === DEAL_STAGES.CLOSED_WON) {
        leadType = "Closed Won wOS Deal";
        tagAsInbound = false;
      } else if (
        isWithinDays(dealLastContacted, 30) ||
        dealStage === DEAL_STAGES.LONG_TERM_NURTURE ||
        dealStage === DEAL_STAGES.PENDING_PMS_KEYS
      ) {
        leadType = "Active wOS Deal";
        tagAsInbound = false;
      } else if (dealIsInbound && isWithinDays(dealCreatedAt, 7)) {
        leadType = "Resubmission";
        tagAsInbound = false;
      } else {
        leadType = "Inactive wOS Deal";
      }
    } else {
      // Step 8: Pull owner/status from contact (company will override below if present)
      if (contact) {
        currentLeadOwner = contact.values.hubspot_owner_id ?? undefined;
        lastContacted = contact.values.notes_last_contacted;
        leadStatus = contact.values.hs_lead_status ?? undefined;
        leadStatusSource = "contact";
        inboundDate = contact.values.inbound_date;
      }

      // Step 9: Pull owner/status from company (takes priority over contact)
      if (company) {
        currentLeadOwner = company.values.hubspot_owner_id ?? undefined;
        lastContacted = company.values.notes_last_contacted;
        leadStatus = company.values.hs_lead_status ?? undefined;
        leadStatusSource = "company";
        companyName = company.values.name ?? null;
      }

      // Steps 10–11: Classify the lead
      // Active: recently contacted (≤30 days) or just inbounded (≤3 days)
      // Inactive: has a lastContacted date but it's older than 30 days
      // New Inbound Lead: lastContacted is null/empty (no interaction history)
      if (isWithinDays(lastContacted, 30)) {
        leadType = "Active Lead";
        tagAsInbound = false;
      } else if (isWithinDays(inboundDate, 7)) {
        leadType = "Resubmission";
        tagAsInbound = false;
      } else if (lastContacted !== null && lastContacted !== "") {
        leadType = "Inactive Lead";
      }
      // else: stays 'New Inbound Lead' (step 11 — null/empty lastContacted)
    }
  }

  officialInboundUnits =
    !tagAsInbound && deal?.number_of_homes_signed != null
      ? Number(deal.number_of_homes_signed)
      : numberOfProperties;

  // Determine the next AE in the appropriate round robin.
  // Falls back to Kyle (ops) if the RR lookup throws or returns null
  let aeForRR: string = HS_USER_IDS.KYLE;
  const isListedSource =
    source === "Wander Listed Application" || intentMeta === "WANDER_LISTED";

  // Explicit rep override: the caller named the rep, so the round-robin (and
  // the international/Spanish override below) is bypassed entirely. Only an
  // active HubSpot owner qualifies; an unknown or archived email is logged
  // and the lead takes the normal round-robin rather than being dropped.
  let overrideOwnerId: string | null = null;
  if (salesRepEmail) {
    try {
      overrideOwnerId = (await findOwnerByEmail(salesRepEmail))?.id ?? null;
      if (!overrideOwnerId) {
        console.error(
          `❌ [inbound-router] osInboundLeadRouter: salesRepEmail ${salesRepEmail} is not an active HubSpot owner; falling back to round-robin`,
        );
      }
    } catch (err) {
      console.error(
        "❌ [inbound-router] osInboundLeadRouter: salesRepEmail owner lookup failed; falling back to round-robin",
        err,
      );
    }
  }

  if (overrideOwnerId) {
    aeForRR = overrideOwnerId;
  } else {
    // Listed inbound goes to the BDRs, wOS inbound to the AEs. The source
    // also picks which `inbound_outbound` value the deficit count is measured
    // against, so a rep's Listed load never offsets their wOS load.
    try {
      aeForRR =
        (await nextRepInRR(
          officialInboundUnits,
          isListedSource && officialInboundUnits < 200 ? "BDR" : "AE",
          isListedSource ? "Listed" : "OS",
        )) ?? HS_USER_IDS.KYLE;
    } catch (err) {
      console.error(
        "❌ [inbound-router] osInboundLeadRouter: round-robin AE lookup failed",
        err,
      );
    }

    // International or Spanish-language inbound leads route to Kris instead of the
    // normal round-robin — but only for leads we're actually reassigning
    // (tagAsInbound) that have at least 10 units. Active/closed-won/resubmission
    // leads keep their existing owner; sub-10-unit leads stay on the normal RR.
    if (
      tagAsInbound &&
      officialInboundUnits >= 10 &&
      (isInternationalPhone(phone) || source.toLowerCase().includes("spanish"))
    ) {
      aeForRR = HS_USER_IDS.KRIS;
    }
  }

  // Upsert contact + company and associate them. Errors are caught internally per operation.
  let contactId: string | null = null;
  let companyId: string | null = null;
  let dealId: string | null = null;
  try {
    const upsertResult = await upsertOsInboundLead({
      existing: { contact, company, deal },
      email,
      domain,
      siteUrl,
      numberOfProperties: String(officialInboundUnits),
      aeForRR,
      tagAsInbound,
      isListedSource,
      pmsMeta,
      intentMeta: orgId ? null : intentMeta,
      firstName,
      lastName,
      phone,
      orgId,
      orgName,
      onboardingComplete,
      currentLeadOwner,
      currentDealOwner,
      isResubmission: leadType === "Resubmission",
    });
    contactId = upsertResult.contactId;
    companyId = upsertResult.companyId;
    dealId = upsertResult.dealId;
  } catch (err) {
    console.error(
      "❌ [inbound-router] osInboundLeadRouter: upsert failed",
      err,
    );
  }

  const contactHsUrl = contactId
    ? `https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/record/0-1/${contactId}`
    : "";

  const companyHsUrl = companyId
    ? `https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/record/0-2/${companyId}`
    : "";

  const dealHsUrl = dealId
    ? `https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/record/0-3/${dealId}`
    : "";

  const slackText =
    source === "Onboarding"
      ? resolveOnboardingSlackHeadline(onboardingComplete, orgId)
      : source.includes("Meta")
        ? `:wander: *New Meta Form Submission*`
        : `:wander: *New Inbound Activity*`;

  const headerLines = [slackText, `*Source:* ${esc(source)}`];

  const footerLines = [
    `*Email:* ${esc(email)}`,
    ...(orgName ? [`*Org Name:* ${esc(orgName)}`] : []),
    ...(orgId ? [`*Org ID:* ${esc(orgId)}`] : []),
    ...(firstName ? [`*First Name:* ${esc(firstName)}`] : []),
    ...(lastName ? [`*Last Name:* ${esc(lastName)}`] : []),
    ...(phone ? [`*Phone:* ${esc(phone)}`] : []),
    ...(companyName ? [`*Company Name (from HS):* ${esc(companyName)}`] : []),
    ...(siteUrl ? [`*Site:* ${esc(siteUrl)}`] : []),
    `*Properties:* ${officialInboundUnits}`,
    ...(pmsMeta ? [`*PMS:* ${esc(pmsMeta)}`] : []),
    ...(salesRepEmail
      ? [
          `*Meeting Booked For:* ${
            overrideOwnerId ? slackMention(overrideOwnerId) : esc(salesRepEmail)
          }`,
        ]
      : []),
    ...(intentMeta ? [`*Intent:* ${esc(intentMeta)}`] : []),
    ...(queryParams ? [`*URL params:* \`${esc(queryParams)}\``] : []),
    `\n`,
    ...(contactHsUrl ? [`*<${contactHsUrl}|HubSpot Contact>*`] : []),
    ...(companyHsUrl ? [`*<${companyHsUrl}|HubSpot Company>*`] : []),
    ...(dealHsUrl ? [`*<${dealHsUrl}|HubSpot Deal>*`] : []),
  ];

  // Step 12: Slack message based on leadType
  let slackBodyLines: string[];

  if (leadType === "Closed Won wOS Deal") {
    slackBodyLines = [
      ...headerLines,
      `*Type:* Closed Won wOS Deal`,
      `\n`,
      `*Deal Name:* ${esc(dealName ?? "N/A")}`,
      `*Deal Owner:* ${slackMention(currentDealOwner)}`,
      `*BDR:* ${slackMention(bdr)}`,
      `*Deal Stage:* ${esc(resolveHsLabel(HS_DEAL_STAGE_LABELS, dealStage))}`,
      `*Date Entered Closed Won:* ${esc(formatHSDate(dealDateEnteredCw))}`,
      `*Last Contacted:* ${esc(formatHSDate(dealLastContacted))}`,
      `\n`,
      ...footerLines,
    ];
  } else if (leadType === "Active wOS Deal") {
    slackBodyLines = [
      ...headerLines,
      `*Type:* Active wOS Deal`,
      `\n`,
      `*Deal Name:* ${esc(dealName ?? "N/A")}`,
      `*Deal Owner:* ${slackMention(currentDealOwner)}`,
      `*BDR:* ${slackMention(bdr)}`,
      `*Deal Stage:* ${esc(resolveHsLabel(HS_DEAL_STAGE_LABELS, dealStage))}`,
      `*Last Contacted:* ${esc(formatHSDate(dealLastContacted))}`,
      `\n`,
      ...footerLines,
    ];
  } else if (leadType === "Inactive wOS Deal") {
    slackBodyLines = [
      ...headerLines,
      `*Type:* Inactive wOS Deal`,
      `\n`,
      `*Deal Name:* ${esc(dealName ?? "N/A")}`,
      `*Reassigned to:* ${slackMention(aeForRR)}`,
      `*Previous Owner:* ${esc(resolveHsLabel(HS_OWNER_NAMES, currentDealOwner))}`,
      `*BDR:* ${slackMention(bdr)}`,
      `*Deal Stage:* ${esc(resolveHsLabel(HS_DEAL_STAGE_LABELS, dealStage))}`,
      `*Last Contacted:* ${esc(formatHSDate(dealLastContacted))}`,
      `\n`,
      ...footerLines,
    ];
  } else if (leadType === "Active Lead") {
    slackBodyLines = [
      ...headerLines,
      `*Type:* Existing Lead (Active)`,
      `\n`,
      `*Lead Owner:* ${slackMention(currentLeadOwner)}`,
      `*Lead Status:* ${esc(resolveHsLabel(leadStatusSource === "contact" ? HS_CONTACT_LEAD_STATUS_LABELS : HS_COMPANY_LEAD_STATUS_LABELS, leadStatus))}`,
      `*Last Contacted:* ${esc(formatHSDate(lastContacted))}`,
      `\n`,
      ...footerLines,
    ];
  } else if (leadType === "Resubmission" && dealName) {
    slackBodyLines = [
      ...headerLines,
      `*Type:* Resubmission`,
      `*Inbound Date:* ${esc(formatHSDate(dealCreatedAt))}`,
      `\n`,
      `*Deal Name:* ${esc(dealName)}`,
      `*Deal Owner:* ${slackMention(currentDealOwner)}`,
      `*BDR:* ${slackMention(bdr)}`,
      `*Deal Stage:* ${esc(resolveHsLabel(HS_DEAL_STAGE_LABELS, dealStage))}`,
      `*Last Contacted:* ${esc(formatHSDate(dealLastContacted))}`,
      `\n`,
      ...footerLines,
    ];
  } else if (leadType === "Resubmission" && !dealName) {
    slackBodyLines = [
      ...headerLines,
      `*Type:* Resubmission`,
      `*Inbound Date:* ${esc(formatHSDate(inboundDate))}`,
      `\n`,
      `*Lead Owner:* ${slackMention(currentLeadOwner)}`,
      `*Lead Status:* ${esc(resolveHsLabel(leadStatusSource === "contact" ? HS_CONTACT_LEAD_STATUS_LABELS : HS_COMPANY_LEAD_STATUS_LABELS, leadStatus))}`,
      `*Last Contacted:* ${esc(formatHSDate(lastContacted))}`,
      `\n`,
      ...footerLines,
    ];
  } else if (leadType === "Inactive Lead") {
    slackBodyLines = [
      ...headerLines,
      `*Type:* Existing Lead (Inactive)`,
      `\n`,
      `*Reassigned to:* ${slackMention(aeForRR)}`,
      `*Previous Owner:* ${esc(resolveHsLabel(HS_OWNER_NAMES, currentLeadOwner))}`,
      `*Lead Status:* ${esc(resolveHsLabel(leadStatusSource === "contact" ? HS_CONTACT_LEAD_STATUS_LABELS : HS_COMPANY_LEAD_STATUS_LABELS, leadStatus))}`,
      `*Last Contacted:* ${esc(formatHSDate(lastContacted))}`,
      `\n`,
      ...footerLines,
    ];
  } else {
    // 'New Inbound Lead'
    slackBodyLines = [
      ...headerLines,
      `*Type:* New Inbound Lead`,
      `\n`,
      `*Assigned to:* ${slackMention(aeForRR)}`,
      `\n`,
      ...footerLines,
    ];
  }

  if (isListedSource && officialInboundUnits < 20) {
    return { contactId, companyId };
  }

  // Small footer identifying where this message came from — debugging aid for
  // the gateway era, where the sender is no longer the same app as the form.
  const envLabel = `via wander-growth ${envSelect({ prod: "production", test: "preview" })}${test ? " · test traffic" : ""}`;

  // Best-effort: growth's postOnSlack returns a result object instead of throwing.
  const slackResult = await postOnSlack({
    text: slackText,
    channel: test ? SLACK_TESTING_CHANNEL : OS_INBOUND_RADIO_CHANNEL_ID,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: slackBodyLines.join("\n") },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: envLabel }],
      },
    ],
  });
  if (!slackResult.success) {
    console.error(
      "❌ [inbound-router] osInboundLeadRouter: Slack notification failed",
      slackResult.error,
    );
  }
  return { contactId, companyId };
}
