import "server-only";

import { generateText, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import {
  firecrawl,
  isFirecrawlConfigured,
  scrapeBasicContent,
} from "@/server/clients/firecrawl.client";

// ---------------------------------------------------------------------------
// DOMAIN DISCOVERY — name → verified website + target-fit, by an AI analyst.
//
// The permit dataset gives a company name + market but (95% of the time) no
// domain. A claude-sonnet-5 agent with web-search + site-read tools (Firecrawl
// is the fetch layer; the model is the judgment layer) goes and verifies the
// operator's real domain — and, since it's already reading the site, ALSO
// judges whether the company is a viable target for a future sales workflow.
//
// Two distinct axes, deliberately separate:
//   • VERIFICATION — is this domain really this company? (belongsToCompany)
//   • FIT — is this company a good prospect? Independent/regional STR managers
//     are the target; enterprise brands, timeshare, OTAs/aggregators, defunct
//     companies, non-STR businesses, and single-property individuals are not.
//     (vistana.com is real AND vacation-rental — but it's Marriott's timeshare
//     arm, so verified≠viable. Fit catches that.)
//
// House rule: generateText + tools + a structured submit tool (never regex for
// the judgment). Model pinned in MODEL.
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-5";

export type CompanyInput = {
  name: string;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  ownerName?: string | null;
  knownEmail?: string | null;
  permits?: number | null; // permit count — a size hint for the fit judgment
};

export type DomainConfidence = "high" | "medium" | "low" | "none";
export type FitTier = "strong" | "possible" | "weak" | "disqualified";
export type FitSegment =
  | "independent_operator"
  | "regional_manager"
  | "enterprise_or_brand"
  | "timeshare"
  | "ota_or_aggregator"
  | "individual_host"
  | "not_str"
  | "other";

export type DomainFit = {
  tier: FitTier;
  segment: FitSegment;
  disqualifiers: string[];
  rationale: string;
};

export type DomainDiscoveryResult = {
  domain: string | null;
  confidence: DomainConfidence;
  isStrOperator: boolean;
  evidence: string[];
  reasoning: string;
  fit: DomainFit;
  toolCalls: number; // searches + reads the agent made
};

const NO_FIT: DomainFit = {
  tier: "weak",
  segment: "other",
  disqualifiers: [],
  rationale: "not evaluated",
};

const verdictSchema = z.object({
  domain: z
    .string()
    .nullable()
    .describe(
      "The operator's OWN website domain (bare host, no scheme/path, e.g. 'acme.com'), or null if none could be verified.",
    ),
  belongsToCompany: z
    .boolean()
    .describe("Whether the domain is verified to belong to THIS company."),
  confidence: z.enum(["high", "medium", "low"]),
  isStrOperator: z
    .boolean()
    .describe("Whether the site is a short-term-rental / property-management operator."),
  evidence: z
    .array(z.string())
    .describe(
      "Concrete corroboration found on the site, e.g. 'permit phone (504) 717-0897 on contact page', 'exact company name in footer'.",
    ),
  reasoning: z.string().describe("One or two sentences explaining the verification verdict."),
  fit: z
    .object({
      tier: z
        .enum(["strong", "possible", "weak", "disqualified"])
        .describe(
          "How good a prospect this is for us (see the fit rubric). 'strong' = clearly an independent/regional STR manager we'd target; 'disqualified' = enterprise/timeshare/OTA/non-STR/defunct.",
        ),
      segment: z.enum([
        "independent_operator",
        "regional_manager",
        "enterprise_or_brand",
        "timeshare",
        "ota_or_aggregator",
        "individual_host",
        "not_str",
        "other",
      ]),
      disqualifiers: z
        .array(z.string())
        .describe("Reasons this is NOT a good target, if any (e.g. 'national timeshare brand (Marriott)')."),
      rationale: z.string().describe("One sentence on the fit judgment."),
    })
    .describe("Target-fit assessment — separate from whether the domain is verified."),
});
type Verdict = z.infer<typeof verdictSchema>;

const SYSTEM = `You are a diligence analyst. You are given a US short-term-rental property-management company from a GOVERNMENT PERMIT filing (so the name, phone, and address are real and authoritative). Do TWO things and report both.

(1) VERIFY THE DOMAIN. Find the operator's OWN website and verify it genuinely belongs to THIS company.
- Use web_search to find candidates and read_site to inspect them. If a permit email with a real company domain is given, read that domain first.
- VERIFY, don't assume. A shared generic word (a city, "vacation", "rentals", a common surname) is NOT proof. Require real corroboration: exact company name (or an obvious DBA/brand) on the site, the permit phone/email appearing, the owner's name, or a clearly consistent location + operator type.
- Never return an aggregator/listing site (airbnb, vrbo, booking, tripadvisor, yelp, bbb), a directory, a social profile, or a government/permit portal.
- Returning null (no verifiable domain) is a valid, useful answer — better than a wrong guess.

(2) SCORE TARGET FIT — is this a good prospect for us? We sell modern direct-booking websites (Wander Sites) to INDEPENDENT and regional short-term-rental property managers who would plausibly respond to cold outreach. Fit is SEPARATE from verification — a real, verified domain can still be a bad target.
- strong: an independent or regional STR property manager / vacation-rental operator (roughly a handful up to a few hundred properties) that could benefit from a better site.
- possible: plausibly a fit but ambiguous (unclear size/independence, or a mixed real-estate + STR business).
- weak: a single-property individual host (better suited to direct mail than cold email).
- disqualified: an enterprise or national brand (e.g. Marriott, Hilton, Wyndham, Vacasa- or Sonder-scale nationals), a TIMESHARE operator (note: vistana.com → Marriott Vacation Clubs is timeshare), an OTA/aggregator, a hotel chain, a company that isn't actually short-term rental (e.g. a homebuilder), or a defunct company.
- Use the permit count as a size hint: a few → small operator; hundreds → mid/large regional; thousands → almost certainly enterprise/timeshare — scrutinize hard.
Put the reasons in disqualifiers[] when tier is weak/disqualified.

When finished — whether or not you verified a domain — call submitVerdict exactly once with both the verification result and the fit assessment. Do not answer in plain text.`;

/**
 * Discover + verify the operator's website for one permit company AND assess
 * target fit, via an agentic loop (claude-sonnet-5 + Firecrawl search/read).
 */
export async function discoverDomain(
  input: CompanyInput,
  opts?: { maxSteps?: number },
): Promise<DomainDiscoveryResult> {
  if (!isFirecrawlConfigured) {
    return {
      domain: null,
      confidence: "none",
      isStrOperator: false,
      evidence: [],
      reasoning: "Firecrawl not configured",
      fit: NO_FIT,
      toolCalls: 0,
    };
  }

  let toolCalls = 0;
  let verdict: Verdict | null = null;

  const record = [
    `Company: ${input.name}`,
    input.city || input.state
      ? `Location: ${[input.city, input.state].filter(Boolean).join(", ")}`
      : null,
    input.permits != null ? `Permits on file: ${input.permits}` : null,
    input.phone ? `Permit phone: ${input.phone}` : null,
    input.knownEmail ? `Permit email: ${input.knownEmail}` : null,
    input.ownerName ? `Owner: ${input.ownerName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await generateText({
      model: anthropic(MODEL),
      stopWhen: stepCountIs(opts?.maxSteps ?? 12),
      system: SYSTEM,
      prompt: `Find and verify the website for this permit company, and score its fit:\n\n${record}`,
      tools: {
        web_search: tool({
          description: "Search the web. Returns up to 8 results (url, title, snippet).",
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            toolCalls++;
            try {
              const res = await firecrawl.search(query, { limit: 8, sources: ["web"] });
              const web = (res.web ?? []).filter(
                (r): r is { url: string; title?: string; description?: string } =>
                  typeof (r as { url?: unknown }).url === "string",
              );
              return {
                results: web.slice(0, 8).map((r) => ({
                  url: r.url,
                  title: r.title ?? null,
                  snippet: r.description ?? null,
                })),
              };
            } catch (e) {
              return { error: e instanceof Error ? e.message : "search failed" };
            }
          },
        }),
        read_site: tool({
          description:
            "Fetch a URL and return its page content as markdown (home/about/contact are most useful).",
          inputSchema: z.object({ url: z.string() }),
          execute: async ({ url }) => {
            toolCalls++;
            const s = await scrapeBasicContent({ url });
            const content = (s?.content ?? "").slice(0, 8000);
            return { url, content: content || "(could not read site)" };
          },
        }),
        submitVerdict: tool({
          description:
            "Submit your final verdict (verification + fit). Call exactly once when done.",
          inputSchema: verdictSchema,
          execute: (v) => {
            verdict = v;
            return { received: true };
          },
        }),
      },
    });
  } catch (error) {
    return {
      domain: null,
      confidence: "none",
      isStrOperator: false,
      evidence: [],
      reasoning: `agent error: ${error instanceof Error ? error.message : String(error)}`,
      fit: NO_FIT,
      toolCalls,
    };
  }

  if (!verdict) {
    return {
      domain: null,
      confidence: "none",
      isStrOperator: false,
      evidence: [],
      reasoning: "agent did not submit a verdict",
      fit: NO_FIT,
      toolCalls,
    };
  }

  const v: Verdict = verdict;
  const norm = (d: string) =>
    d
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim();

  const verified = v.belongsToCompany && !!v.domain;
  return {
    domain: verified && v.domain ? norm(v.domain) : null,
    confidence: verified ? v.confidence : "none",
    isStrOperator: v.isStrOperator,
    evidence: v.evidence,
    reasoning: v.reasoning,
    fit: v.fit,
    toolCalls,
  };
}
