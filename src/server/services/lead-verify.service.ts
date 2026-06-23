import "server-only";

import {
  isBrightDataConfigured,
  scrapeLinkedinProfile,
} from "@/server/clients/brightdata.client";
import { verifyContactGeo } from "@/server/clients/minerva.client";
import type { LeadContactVerification } from "@/server/db/leads-schema";

// ---------------------------------------------------------------------------
// LEAD TRUST LAYER — "is this freemail actually the right person?"
//
// Two evidence sources, deliberately layered by cost + reliability:
//   1. Minerva geo (primary)  — resolve the email → person → top address, then
//      check it against the company's area. The playbook's rule: "send only
//      where Minerva geo matches". A mismatch is a *soft* downgrade (STR owners
//      are often remote), not a hard block.
//   2. Bright Data LinkedIn (opportunistic) — only fires when Minerva's resolve
//      step yields a profile URL (we store none ourselves), and never on a row
//      already geo-disqualified. Confirms current employer == the company.
//
// Writes a LeadContactVerification blob; scoring lives in lead-channel.service.
// ---------------------------------------------------------------------------

export type VerifyCompany = {
  name: string | null;
  domain: string;
  city: string | null;
  state: string | null;
  country: string | null;
};

// Full state name → USPS abbreviation, so "Oregon" and "OR" compare equal.
const US_STATES: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca",
  colorado: "co", connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga",
  hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia",
  kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md",
  massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms",
  missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv",
  "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny",
  "north carolina": "nc", "north dakota": "nd", ohio: "oh", oklahoma: "ok",
  oregon: "or", pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc",
  "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt",
  virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi",
  wyoming: "wy",
};

function normState(value?: string | null): string | null {
  if (!value) return null;
  const t = value.trim().toLowerCase();
  if (!t) return null;
  if (t.length === 2) return t;
  return US_STATES[t] ?? t;
}

function normCity(value?: string | null): string | null {
  const t = value?.trim().toLowerCase();
  return t || null;
}

function computeGeoMatch(
  minerva: { isMatch: boolean; city?: string | null; state?: string | null },
  company: VerifyCompany,
): LeadContactVerification["geoMatch"] {
  if (!minerva.isMatch) return "unknown";
  const mState = normState(minerva.state);
  const cState = normState(company.state);
  if (mState && cState) return mState === cState ? "match" : "mismatch";
  const mCity = normCity(minerva.city);
  const cCity = normCity(company.city);
  if (mCity && cCity) return mCity === cCity ? "match" : "mismatch";
  return "unknown";
}

// Strip legal/industry boilerplate so "Smith Vacation Rentals LLC" ≈ "smith".
const COMPANY_NOISE =
  /\b(inc|llc|ltd|limited|co|corp|company|group|properties|property|management|mgmt|vacation|vacations|rentals|rental|homes|lodging|hospitality|getaways|escapes|retreats|stays|stay)\b/g;

function normCompany(name?: string | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(COMPANY_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeCompanyMatch(
  linkedinCompany: string | null,
  company: VerifyCompany,
): LeadContactVerification["companyMatch"] {
  if (!linkedinCompany) return "unknown";
  const a = normCompany(linkedinCompany);
  const domainRoot = company.domain.split(".")[0]?.toLowerCase() ?? "";
  const b = normCompany(company.name) || domainRoot;
  if (!a || !b) return "unknown";
  if (a === b || a.includes(b) || b.includes(a)) return "match";

  const aTokens = new Set(a.split(" ").filter((t) => t.length > 2));
  const overlap = b.split(" ").filter((t) => t.length > 2 && aTokens.has(t));
  if (overlap.length > 0) return "match";

  // Domain root often beats a messy company name (e.g. cityninestay.com).
  if (domainRoot.length > 3 && a.replace(/ /g, "").includes(domainRoot)) {
    return "match";
  }
  return "mismatch";
}

/**
 * Run the trust layer for a single email against its company. Returns null only
 * when Minerva is unconfigured (nothing to attempt); otherwise always returns a
 * verification blob — an unresolved person still records "we tried, couldn't
 * confirm" so the UI can show it.
 */
export async function verifyContactPerson(input: {
  email: string;
  company: VerifyCompany;
}): Promise<LeadContactVerification | null> {
  const geo = await verifyContactGeo(input.email);
  if (!geo) return null;

  const geoMatch = computeGeoMatch(geo, input.company);

  const verification: LeadContactVerification = {
    verifiedAt: new Date().toISOString(),
    geoMatch,
    companyMatch: "unknown",
    minerva: {
      isMatch: geo.isMatch,
      city: geo.city ?? null,
      state: geo.state ?? null,
      postalCode: geo.postalCode ?? null,
      confidence: geo.confidence ?? null,
    },
  };

  // Opportunistic LinkedIn confirmation — only when we have a URL, Bright Data
  // is configured, and the row isn't already geo-disqualified (cost control).
  if (geo.linkedinUrl && isBrightDataConfigured && geoMatch !== "mismatch") {
    try {
      const profile = await scrapeLinkedinProfile(geo.linkedinUrl);
      if (profile) {
        verification.linkedin = {
          url: geo.linkedinUrl,
          currentCompany: profile.currentCompany,
          scrapedAt: new Date().toISOString(),
        };
        verification.companyMatch = computeCompanyMatch(
          profile.currentCompany,
          input.company,
        );
      }
    } catch (error) {
      console.error("❌ [lead-verify] LinkedIn scrape failed:", error);
    }
  }

  return verification;
}
