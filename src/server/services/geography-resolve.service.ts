import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import { usStateCode, usStateName } from "@/lib/us-states";
import type { AudienceGeographyPlan } from "@/server/db/schema";

const MODEL = "claude-sonnet-5";

/**
 * Turn the location fields on a set of listings into a buyable geography.
 *
 * The lookup table this replaces could only fix the cases it already knew.
 * Our own listing feed states the same place several ways — one Hocking Hills
 * portfolio files homes as "OH" and as "Ohio", so the plan carried both and
 * the ad copy read "OH, OHIO" — and that is the tame version. The feed also
 * carries misspellings, town names in the state field, non-US regions with no
 * code at all, and "Logan Ohio" as a city. A closed map cannot normalize data
 * whose shape it does not know in advance.
 *
 * So the model does the resolving and the schema does the constraining: the
 * field descriptions say exactly what a state code is and the schema holds it
 * to two characters, which is the whole guard. Nothing re-checks the answer
 * against the state table afterwards — a schema plus a precise description is
 * the contract, and a second copy of the rule downstream is just somewhere for
 * the two to disagree. What the model adds over the map is judgement — collapsing spellings, recognising a state
 * written as a town, and naming the market a media buyer would actually buy
 * ("Hocking Hills") rather than the administrative region a feed happens to
 * record.
 */

const ResolvedSchema = z.object({
  countries: z
    .array(z.string().length(2))
    .max(20)
    .describe("ISO 3166-1 alpha-2 codes, uppercase. US for the United States."),
  states: z
    .array(z.string().length(2))
    .max(60)
    .describe(
      "US state codes ONLY: exactly two uppercase letters, the USPS abbreviation. 'OH', never 'Ohio', 'OHIO', 'Oh' or 'US-OH'. A place outside the United States has no code and belongs in regions instead, so leave this empty for it.",
    ),
  regions: z
    .array(z.string().min(2).max(60))
    .max(60)
    .describe(
      "Region names a Meta or Google geo search resolves — full state names for the US, province or region names elsewhere.",
    ),
  cities: z
    .array(z.string().min(2).max(80))
    .max(80)
    .describe("City or town names, correctly spelled, no state suffix."),
  markets: z
    .array(z.string().min(2).max(60))
    .max(12)
    .describe(
      "Named travel markets these homes sit in, as a media buyer would say them — 'Hocking Hills', 'Smoky Mountains'. Only ones you are confident about. Empty if none applies.",
    ),
});

export type ResolvedGeography = AudienceGeographyPlan & {
  /** Named travel markets, the part no lookup table can derive. */
  markets?: string[];
};

type LocationRow = {
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

/**
 * The deterministic pass, kept as the fallback.
 *
 * A pitch page and an ad draft must not fail because a model call did, so
 * every exit from the resolver below lands here. It still collapses a state
 * name to its code, which handles the one case we know by name.
 */
export function geographyByLookup(rows: LocationRow[]): AudienceGeographyPlan {
  const countries = new Set<string>();
  const states = new Set<string>();
  const cities = new Set<string>();

  for (const row of rows) {
    const country = row.country?.trim().toUpperCase();
    if (country) countries.add(country);
    const state = usStateCode(row.state) ?? row.state?.trim().toUpperCase();
    if (state) states.add(state);
    const city = row.city?.trim();
    if (city) cities.add(city);
  }

  const plan: AudienceGeographyPlan = {};
  if (countries.size > 0) plan.countries = [...countries].sort();
  if (states.size > 0) {
    plan.states = [...states].sort();
    const regions = plan.states
      .map((code) => usStateName(code))
      .filter((name): name is string => name !== null);
    if (regions.length > 0) plan.regions = regions;
  }
  if (cities.size > 0) plan.cities = [...cities].sort();
  return plan;
}

/** The distinct location triples, which is all the model needs to see. */
function distinctLocations(rows: LocationRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const parts = [row.city, row.state, row.country]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part));
    if (parts.length > 0) seen.add(parts.join(" | "));
  }
  return [...seen].sort();
}

/**
 * Trim, drop blanks, dedupe, sort. Every field of the model's answer wants
 * exactly this; `normalize` is where a field adds its own rule.
 */
function clean(
  values: (string | null | undefined)[],
  normalize: (value: string) => string | null = (value) => value.trim(),
): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const cleaned = value ? normalize(value) : null;
    if (cleaned) out.add(cleaned);
  }
  return [...out].sort();
}

/**
 * Resolve listing locations into a geography plan, with the model doing the
 * normalizing and the lookup table catching a failure.
 *
 * Deduplicated before the call: a 54-home portfolio is usually three or four
 * distinct places, so the prompt stays small however large the portfolio is.
 */
export async function resolveGeography(
  rows: LocationRow[],
): Promise<ResolvedGeography> {
  const fallback = geographyByLookup(rows);
  const locations = distinctLocations(rows);
  if (locations.length === 0) return fallback;

  try {
    const { output } = await generateText({
      model: anthropic(MODEL),
      output: Output.object({ schema: ResolvedSchema }),
      system: [
        "You normalize vacation-rental listing locations into ad-targeting geography.",
        "The input is messy on purpose: the same place appears spelled several ways, a state may be written as a full name, a code, or a town, and some rows are not in the US.",
        "Collapse duplicates so each real place appears once. Correct obvious misspellings.",
        "Never invent a location that is not implied by the input. If a row is too vague to place, leave it out rather than guessing a state.",
        "Only name a travel market you are confident the homes actually sit in.",
      ].join(" "),
      prompt: [
        "Listing locations, one per line, as 'city | state | country' with missing parts omitted:",
        ...locations.map((line) => `- ${line}`),
        "",
        "Return the deduplicated geography for targeting these homes.",
      ].join("\n"),
    });
    if (!output) return fallback;

    const states = clean(output.states, (code) => code.trim().toUpperCase());
    const countries = clean(output.countries, (code) =>
      /^[a-z]{2}$/i.test(code.trim()) ? code.trim().toUpperCase() : null,
    );
    const cities = clean(output.cities);
    const markets = clean(output.markets);
    // Both: the code round-trips and the display name is what a platform's geo
    // search takes, and the model may name a region that has no US code.
    const regions = clean([...states.map(usStateName), ...output.regions]);

    // Nothing usable is a failed run, not an empty geography — an empty one
    // would target everywhere, and the fallback knows what the raw fields said.
    if (countries.length === 0 && states.length === 0 && cities.length === 0) {
      return fallback;
    }

    return {
      ...(countries.length > 0 ? { countries } : {}),
      ...(states.length > 0 ? { states } : {}),
      ...(regions.length > 0 ? { regions } : {}),
      ...(cities.length > 0 ? { cities } : {}),
      ...(markets.length > 0 ? { markets } : {}),
    };
  } catch (error) {
    console.error("geography resolve failed", error);
    return fallback;
  }
}
