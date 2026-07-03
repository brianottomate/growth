import "server-only";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

// =====================================================
// PMS MAPPING — AI-POWERED
// =====================================================
//
// Maps free-text PMS names from inbound forms to HubSpot's enumerated values
// using structured output. Ported from wander.com's services/hubspot/
// pms-mapping.ts (docs/hubspot-gateway-plan.md Phase 1), rewritten from
// OpenAI structured outputs to the house convention (generateText +
// Output.object + Anthropic). Two HubSpot fields have diverging enums:
//
//   company.pms_ai_identified             — "PMS (AI Identified)"
//   deal.pms__what_are_they_running_today — "PMS (confirmed)"
//
// The model receives both enum lists and the raw input, returning the best
// match for each field (or null if unrecognized). Structured output
// guarantees only valid enum values are returned — no hallucinated PMS names.
//
// This replaces the older approach of a ~80-entry hardcoded lookup map
// + Levenshtein fuzzy matching. Benefits:
//   - Handles typos, abbreviations, variations ("Guesty for Pros" → Guesty)
//   - No map maintenance when HubSpot enums change — update the arrays below
//   - Graceful degradation: API failure → undefined (never throws)

const MODEL = "claude-haiku-4-5-20251001";

// ── HubSpot enum values (source of truth) ──────────────────────────────────
// When HubSpot gets a new PMS option, add it to the relevant array(s) below.

const COMPANY_PMS_VALUES = [
  "Guesty",
  "Hostaway",
  "Lodgify",
  "Streamline",
  "Escapia",
  "Track",
  "Rentals United",
  "Hostfully",
  "OwnerRez",
  "Hospitable",
  "Cirrus",
  "Avantio",
  "Lodgix",
  "Boom",
  "Rental Wise",
  "Direct",
  "WebRez/SynXis",
  "iGMS",
  "Guest Wisely",
  "Stays",
  "Uplisting",
  "Hostex",
  "Nexpax",
  "Hostify",
  "Kross Booking",
  "ResNexus",
  "LMPM",
  "LiveRez",
  "Vacation RentPro",
  "Barefoot",
  "Brightside",
  "Smily",
  "Smoobu",
  "Tokeet",
  "SuperControl",
  "Virtual Resort Manager",
  "RMS Cloud",
  "Futurestay",
  "Rental Network Software (RNS)",
  "MAPRO",
  "Turbo",
  "Beds24",
  "Octorate",
  "VRWorks",
  "iVacationOnline",
  "RezExpert",
  "RealTimeRental",
  "Stayflexi",
  "Cloudbeds",
  "Siteminder",
  "Checkfront",
  "Campspot",
  "Eviivo",
  "Jurny",
  "Kigo",
  "Rentvine",
  "Bookerville",
  "Beyond Pricing",
  "Boostly",
  "Houfy",
  "Wheelhouse",
  "Sabre SynXis",
  "ThinkReservations",
  "Innsight",
  "Tambourine",
  "RezStream",
  "Mews",
  "iQware",
  "innRoad",
  "WebRezPro",
  "Book-It-Now",
  "IRM",
  "HotelKey",
  "Unknown",
] as const;

const DEAL_PMS_VALUES = [
  "Guesty",
  "Hostaway",
  "Lodgify",
  "Streamline",
  "Escapia",
  "Track",
  "Rentals United",
  "Hostfully",
  "OwnerRez",
  "Hospitable",
  "CiiRUS",
  "Avantio",
  "Lodgix",
  "Boom",
  "Rental Wise",
  "Direct",
  "WebRez/SynXis",
  "iGMS",
  "Guest Wisely",
  "Stays",
  "Uplisting",
  "Hostex",
  "Nexpax",
  "Hostify",
  "Kross Booking",
  "ResNexus",
  "LMPM",
  "LiveRez",
  "Vacation RentPro",
  "Barefoot",
  "BrightSide",
  "Smily",
  "Smoobu",
  "Tokeet",
  "SuperControl",
  "Virtual Resort Manager",
  "RMS Cloud",
  "Futurestay",
  "Rental Network Software (RNS)",
  "MAPRO",
  "Turbo",
  "Beds24",
  "Octorate",
  "VRWorks",
  "iVacationOnline",
  "RezExpert",
  "RealTimeRental",
  "Stayflexi",
  "Cloudbeds",
  "Siteminder",
  "Checkfront",
  "Campspot",
  "eviivo",
  "eZee Absolute",
  "ReservationKey",
  "RDPWin",
  "Lodgable",
  "Vacation Rental Desk",
  "Not Using PMS",
  "Other (msg danny to add it)",
] as const;

// ── Zod schema for structured output ───────────────────────────────────────

const PmsMappingResult = z.object({
  pmsCompany: z
    .enum(COMPANY_PMS_VALUES)
    .nullable()
    .describe(
      "Best-matching HubSpot company PMS value, or null if unrecognized",
    ),
  pmsDeal: z
    .enum(DEAL_PMS_VALUES)
    .nullable()
    .describe("Best-matching HubSpot deal PMS value, or null if unrecognized"),
});

// ── Core mapping function ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You map property management software (PMS) names from inbound lead forms to HubSpot CRM enum values.

Given a free-text PMS name, return the best match from each enum list. The two lists (company vs deal) have slightly different values for the same PMS in some cases — pick the correct value for each independently.

Rules:
- Match the PMS even if the input has typos, abbreviations, or extra words (e.g. "Guesty for Pros" → Guesty, "OwnerRez.com" → OwnerRez)
- If the user says they don't use a PMS (e.g. "none", "no pms", "n/a", "don't have one"), return company: "Unknown", deal: "Not Using PMS"
- If you genuinely cannot identify the PMS, return company: "Unknown", deal: "Other (msg danny to add it)"
- If a PMS exists in one list but not the other, return null for the missing one
- Never invent values outside the provided enums`;

/**
 * Maps a free-text PMS name to HubSpot enum values using AI structured output.
 * Returns undefined values on API failure — never throws.
 */
export async function mapPmsToHsValues(
  pms: string | null | undefined,
): Promise<{ pmsCompany: string | undefined; pmsDeal: string | undefined }> {
  // Bound the model input: a PMS name is never long, so guard against
  // pathological free-text here.
  const input = pms?.trim().slice(0, 200);
  if (!input) return { pmsCompany: undefined, pmsDeal: undefined };

  try {
    const { output } = await generateText({
      model: anthropic(MODEL),
      output: Output.object({
        name: "pms_mapping",
        description:
          "Best-matching HubSpot PMS enum values for a free-text PMS name",
        schema: PmsMappingResult,
      }),
      system: SYSTEM_PROMPT,
      prompt: input,
      temperature: 0,
    });

    return {
      pmsCompany: output.pmsCompany ?? undefined,
      pmsDeal: output.pmsDeal ?? undefined,
    };
  } catch (error) {
    console.error(
      "[mapPmsToHsValues] AI call failed, skipping PMS mapping",
      error,
    );
    return { pmsCompany: undefined, pmsDeal: undefined };
  }
}
