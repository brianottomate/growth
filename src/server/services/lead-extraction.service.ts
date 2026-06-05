import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import type { DiscoveryResult } from "./lead-discovery.service";

/**
 * Lead extraction — collapse raw discovery output into ONE structured object
 * via a single AI synthesis pass (generateText + Output.object, matching the
 * wander-fit.ts pattern). No DB write; returns the typed object for inspection.
 *
 * Callable from tRPC and scripts.
 */

const EXTRACTION_MODEL = "claude-sonnet-4-5";

// Per-result char budget when flattening provider data into the prompt.
const MAX_CHARS_PER_PROVIDER = 8000;

// ---- The structured shape we want out of enrichment ----------------
// Everything nullable: discovery is lossy, and a confident null beats a
// hallucinated value. Each field is .describe()'d to steer the model.

export const LeadEnrichmentSchema = z.object({
  company: z.object({
    legalName: z.string().nullable().describe("Registered legal entity name, if found"),
    brandName: z.string().nullable().describe("Customer-facing brand / trading name"),
    description: z.string().nullable().describe("1-2 sentence description of what the company does"),
    tagline: z.string().nullable().describe("Short positioning line / slogan"),
    foundedYear: z.number().int().nullable().describe("Year founded, if stated"),
    hqLocation: z.string().nullable().describe("Headquarters city, state/country"),
    serviceAreas: z.array(z.string()).describe("Cities/regions/markets they operate in (empty array if unknown)"),
  }),
  portfolio: z.object({
    estimatedUnitCount: z.number().int().nullable().describe("Best estimate of properties/units under management"),
    unitCountConfidence: z.enum(["stated", "estimated", "unknown"]).describe("Is the unit count explicitly stated, inferred, or unknown?"),
    propertyTypes: z.array(z.enum(["short_term_rental", "vacation_rental", "long_term_rental", "hotel", "hoa", "commercial", "other"])).describe("Types of property they manage"),
  }),
  pms: z.object({
    detected: z.string().nullable().describe("Property management software detected (e.g. Guesty, Hostaway, Streamline)"),
    confidence: z.enum(["high", "medium", "low", "unknown"]).describe("Confidence in the PMS detection"),
  }),
  brand: z.object({
    logoUrl: z.string().nullable().describe("URL of the company logo if found"),
    primaryColors: z.array(z.string()).describe("Hex/named brand colors observed (empty if unknown)"),
    voice: z.string().nullable().describe("Short note on brand tone/voice"),
    hasOnlineBooking: z.boolean().nullable().describe("Does the site offer direct online booking?"),
  }),
  contacts: z.array(
    z.object({
      name: z.string().nullable(),
      role: z.string().nullable().describe("Job title / role"),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    }),
  ).describe("Key people / decision-makers found (empty if none)"),
  pregenFit: z.object({
    score: z.number().int().min(0).max(100).describe("0-100: how strong a Wander Sites pregen-site target this is"),
    rationale: z.string().describe("Why this score — what makes them a good/poor pregen target"),
    signals: z.array(z.string()).describe("Concrete positive/negative signals (e.g. 'weak existing site', 'large portfolio', 'already has modern booking')"),
  }),
  icpTierGuess: z.enum(["tier_1", "tier_2", "tier_3", "untiered"]).describe("Best ICP tier guess based on size/fit"),
  redFlags: z.array(z.string()).describe("Disqualifiers: marketplace/aggregator not a real PM, dead site, not vacation rental, etc. (empty if none)"),
  confidence: z.enum(["high", "medium", "low"]).describe("Overall confidence in this enrichment given the evidence"),
  citations: z.array(z.string()).describe("Source URLs that informed this (empty if none)"),
});

export type LeadEnrichmentExtraction = z.infer<typeof LeadEnrichmentSchema>;

export type ExtractionResult = {
  domain: string;
  model: string;
  providersUsed: string[];
  structured: LeadEnrichmentExtraction;
  usage: { inputTokens?: number; outputTokens?: number } | null;
};

const GUIDANCE = `You are enriching a property-management / short-term-rental company for an outbound sales pipeline (Wander Sites: we pre-generate modern websites for property managers and pitch them).

Synthesize the provider context below into the structured schema. Rules:
- Only assert what the evidence supports. Prefer null over guessing.
- "pregenFit" reflects how good a target this is for a pre-generated replacement website: weak/dated existing sites + sizeable portfolios + no modern booking = HIGH; marketplaces, aggregators, or companies with strong modern sites = LOW.
- Flag in redFlags if this is NOT a property manager (e.g. an OTA/marketplace, a single listing, a dead/parked domain).
- Cite the source URLs you actually relied on.`;

/** Flatten the discovery payload into a bounded, labeled prompt context. */
function buildContext(discovery: DiscoveryResult): string {
  const sections: string[] = [];
  for (const p of discovery.providers) {
    if (!p.ok) {
      sections.push(`### ${p.source} (FAILED)\n${p.error}`);
      continue;
    }
    let body = "";
    try {
      body = JSON.stringify(p.data, null, 2);
    } catch {
      body = String(p.data);
    }
    if (body.length > MAX_CHARS_PER_PROVIDER) {
      body = body.slice(0, MAX_CHARS_PER_PROVIDER) + "\n…[truncated]";
    }
    sections.push(`### ${p.source}\n${body}`);
  }
  return sections.join("\n\n");
}

export async function extractFromDiscovery(
  discovery: DiscoveryResult,
): Promise<ExtractionResult> {
  const context = buildContext(discovery);

  const { output, usage } = await generateText({
    model: anthropic(EXTRACTION_MODEL),
    output: Output.object({
      name: "LeadEnrichment",
      description: "Structured enrichment of a property-management lead",
      schema: LeadEnrichmentSchema,
    }),
    prompt: `${GUIDANCE}\n\nDOMAIN: ${discovery.domain}\n\n=== PROVIDER CONTEXT ===\n${context}`,
  });

  return {
    domain: discovery.domain,
    model: EXTRACTION_MODEL,
    providersUsed: discovery.providers.filter((p) => p.ok).map((p) => p.source),
    structured: output,
    usage: usage
      ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
      : null,
  };
}

/** Convenience: discover + extract in one call (used by the tRPC enrich mutation). */
export async function discoverAndExtract(
  discovery: DiscoveryResult,
): Promise<ExtractionResult> {
  return extractFromDiscovery(discovery);
}
