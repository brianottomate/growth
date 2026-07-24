import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import { discoverDomain, type DiscoveryResult } from "./lead-discovery.service";

/**
 * Unit-count estimation — the headline enrichment. Sales doesn't trust
 * `portfolio_size`, so instead of one bare number we TRIANGULATE independent
 * signals (their own site, OTA host profiles, stated claims, existing priors)
 * and return an estimate WITH a range, confidence, what-the-number-represents
 * ("basis"), and citations. The range + receipts are what earn trust.
 *
 * Complements Danny's browseruse estimate (HubSpot `…ai_guess_1`); ours lands
 * in `…ai_guess_2_exact` / `…_range`. Two independent methods → agreement is
 * the strongest trust signal, divergence is itself actionable.
 */

const UNIT_MODEL = "claude-sonnet-5";
const MAX_CHARS_PER_PROVIDER = 12000; // listing pages are dense — give it room

export const UnitBasis = ["managed_units", "listings", "mixed", "unknown"] as const;
export const Confidence = ["high", "medium", "low"] as const;

export const UnitEstimateSchema = z.object({
  signals: z
    .array(
      z.object({
        value: z.number().int().nullable().describe("Unit/listing count from this signal"),
        sourceType: z
          .enum([
            "own_site_listings", // counted listings on their booking/inventory pages
            "own_site_stated", // a stated total on their site ("we manage N homes")
            "ota_profile", // Airbnb/VRBO/etc host profile listing count
            "press_directory", // press, LinkedIn, directories
            "prior", // an existing data point we fed in
          ])
          .describe("Where this number came from"),
        basis: z
          .enum(["managed_units", "listings", "unknown"])
          .describe("Does this number represent managed units or just listings shown?"),
        citation: z.string().nullable().describe("Source URL"),
        snippet: z.string().nullable().describe("The exact text/evidence supporting it"),
        confidence: z.enum(Confidence),
      }),
    )
    .describe("Every independent unit-count signal found (empty if none)"),
  estimate: z.number().int().nullable().describe("Best single estimate of MANAGED units"),
  low: z.number().int().nullable().describe("Low end of a plausible range"),
  high: z.number().int().nullable().describe("High end of a plausible range"),
  basis: z.enum(UnitBasis).describe("What the final estimate represents"),
  confidence: z.enum(Confidence).describe("Overall confidence, driven by source agreement"),
  method: z.string().describe("Which signal/approach drove the final number"),
  reasoning: z.string().describe("How the estimate was reconciled across signals"),
  discrepancyVsSalesPortfolio: z
    .string()
    .nullable()
    .describe("If it differs from the sales portfolio_size prior, explain why (e.g. listings vs managed units)"),
});

export type UnitEstimate = z.infer<typeof UnitEstimateSchema>;

export type UnitPriors = {
  salesPortfolioSize?: number | null; // HubSpot portfolio_size (the distrusted one)
  clayPortfolioSize?: number | null; // HubSpot clay_portfolio_size
  browseruseGuess?: number | null; // HubSpot …ai_guess_1_exact
  oursPregen?: number | null; // our ingested unit_count
};

export type UnitEstimateResult = {
  domain: string;
  model: string;
  providersUsed: string[];
  estimate: UnitEstimate;
};

const GUIDANCE = `You estimate how many properties/units a property-management company actually MANAGES. This feeds a sales team that does NOT trust the existing portfolio numbers — so be rigorous and show your work.

Critical distinction: a "listing count" (units shown on a booking site or OTA) is NOT the same as "managed units". Marketplaces/aggregators inflate listing counts wildly. Always classify each signal's basis and reconcile toward MANAGED units.

Rules:
- Extract EVERY independent unit-count signal from the evidence, each with its source URL and the exact supporting snippet. Never invent a number or a citation.
- Prefer a stated total from the company itself ("we manage 250+ homes") over a raw listing count.
- If signals agree → high confidence + tight range. If they conflict or are sparse → low confidence + wide range, and say so.
- The PRIORS provided are existing data points (sales/Clay/browseruse/our import) — treat them as signals to corroborate or contradict, not ground truth.
- If a prior (especially sales portfolio_size) looks wrong, explain why in discrepancyVsSalesPortfolio.`;

function buildContext(discovery: DiscoveryResult, priors: UnitPriors): string {
  const priorLines = [
    priors.salesPortfolioSize != null && `- sales portfolio_size: ${priors.salesPortfolioSize}`,
    priors.clayPortfolioSize != null && `- clay_portfolio_size: ${priors.clayPortfolioSize}`,
    priors.browseruseGuess != null && `- browseruse ai_guess_1: ${priors.browseruseGuess}`,
    priors.oursPregen != null && `- our imported unit_count: ${priors.oursPregen}`,
  ].filter(Boolean);

  const sections: string[] = [];
  if (priorLines.length) sections.push(`### PRIORS (existing data points)\n${priorLines.join("\n")}`);

  for (const p of discovery.providers) {
    if (!p.ok) continue;
    let body = "";
    try {
      body = JSON.stringify(p.data, null, 2);
    } catch {
      body = String(p.data);
    }
    if (body.length > MAX_CHARS_PER_PROVIDER) body = body.slice(0, MAX_CHARS_PER_PROVIDER) + "\n…[truncated]";
    sections.push(`### ${p.source}\n${body}`);
  }
  return sections.join("\n\n");
}

/** Estimate from an already-gathered discovery payload (no new fetches). */
export async function estimateUnitsFromDiscovery(
  discovery: DiscoveryResult,
  priors: UnitPriors = {},
): Promise<UnitEstimateResult> {
  const context = buildContext(discovery, priors);

  const { output } = await generateText({
    model: anthropic(UNIT_MODEL),
    output: Output.object({
      name: "UnitEstimate",
      description: "Triangulated managed-unit estimate with range, confidence, and citations",
      schema: UnitEstimateSchema,
    }),
    prompt: `${GUIDANCE}\n\nDOMAIN: ${discovery.domain}\n\n=== EVIDENCE ===\n${context}`,
  });

  return {
    domain: discovery.domain,
    model: UNIT_MODEL,
    providersUsed: discovery.providers.filter((p) => p.ok).map((p) => p.source),
    estimate: output,
  };
}

/** Convenience: discover + estimate in one call. */
export async function estimateUnits(
  domain: string,
  priors: UnitPriors = {},
): Promise<UnitEstimateResult> {
  const discovery = await discoverDomain(domain);
  return estimateUnitsFromDiscovery(discovery, priors);
}
