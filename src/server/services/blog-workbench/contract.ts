import { z } from "zod";

// The two sides of the pipeline seam this workbench exists to inspect:
// SEO Engine emits a snake_case brief with run metadata; Cam's draft writer
// accepts a camelCase ContentBriefInput plus a separate grounding context.
// The official adapter between them has not been written, so the one here is
// an explicitly versioned draft (see ADAPTER_VERSION) that the workbench
// surfaces rather than hides.

// ---- SEO ENGINE RESPONSE (wire format, snake_case) -------------------

export const seoEngineOutlineSectionSchema = z.object({
  heading: z.string(),
  key_points: z.array(z.string()),
});

export const seoEngineBriefSchema = z.object({
  brief_id: z.string(),
  context_package_id: z.string(),
  measurement_id: z.string(),
  target_query: z.string(),
  guest_intent: z.string(),
  working_title: z.string(),
  summary: z.string(),
  outline: z.array(seoEngineOutlineSectionSchema),
  entities_to_cover: z.array(z.string()),
  recommended_page_kind: z.string(),
  suggested_word_count: z.number().nullable(),
});

export const seoEngineResponseSchema = z.object({
  run_id: z.string(),
  target_domain: z.string(),
  status: z.string(),
  brief_id: z.string(),
  error: z.string().nullable(),
  brief: seoEngineBriefSchema,
});

export type SeoEngineResponse = z.infer<typeof seoEngineResponseSchema>;

// ---- WRITER CONTRACT (Cam's draft, camelCase) -------------------------
// Mirrors the `ContentBriefInput` / `ContentBriefGroundingContext` types the
// draft `buildContentBriefPagePrompt` imports from `./types` in the monolith.
// Those types are not in any pushed branch; this is a faithful reconstruction
// from the prompt's property accesses.

export type ContentBriefInput = {
  targetQuery: string;
  guestIntent: string;
  workingTitle: string;
  summary: string;
  outline: Array<{ heading: string; keyPoints: string[] }>;
  entitiesToCover: string[];
  recommendedPageKind: string;
  suggestedWordCount: number | null;
};

export type ContentBriefGroundingContext = {
  businessName: string;
  summary: string | null;
  locations: string[];
  amenities: string[];
  activities: string[];
  targetAudience: string | null;
  distinctiveFeatures: string[];
  typicalPriceRange: string | null;
  voice: string | null;
  properties: Array<{
    name: string;
    href: string;
    sleeps: number | null;
    bedrooms: number | null;
    location: string | null;
    amenities: string[];
  }>;
};

// ---- ADAPTER ----------------------------------------------------------

export const ADAPTER_VERSION = "seo-response-to-writer/v1-draft";

/**
 * Normalizes the SEO Engine wire response into Cam's writer input. Pure
 * field mapping, no enrichment: run metadata stays behind, and nothing is
 * invented. The production adapter (unwritten) may enrich or reshape; when
 * it lands, this version string is how runs made with the draft stay honest.
 */
export function normalizeSeoResponseToBrief(
  response: SeoEngineResponse,
): ContentBriefInput {
  const brief = response.brief;
  return {
    targetQuery: brief.target_query,
    guestIntent: brief.guest_intent,
    workingTitle: brief.working_title,
    summary: brief.summary,
    outline: brief.outline.map((section) => ({
      heading: section.heading,
      keyPoints: section.key_points,
    })),
    entitiesToCover: brief.entities_to_cover,
    recommendedPageKind: brief.recommended_page_kind,
    suggestedWordCount: brief.suggested_word_count,
  };
}

// ---- MISSING INPUTS (modeled, never fabricated) ------------------------

export type MissingInput = {
  id: string;
  what: string;
  status: "missing" | "substituted";
  substitute: string | null;
};

export const MISSING_INPUTS: MissingInput[] = [
  {
    id: "production-grounding-context",
    what: "The real ContentBriefGroundingContext the monolith writer would build from first-party property data",
    status: "substituted",
    substitute:
      "A grounding fixture: crawl-derived/v1 when the target site is real, or a hand-authored synthetic-fixture/v1 when it is not (the example brief's domain is a parked page). Each file states its own provenance.",
  },
  {
    id: "cam-opus-article",
    what: "Cam's Opus-generated article for this exact brief",
    status: "substituted",
    substitute:
      "A workbench-generated article using the same draft prompt; it is NOT Cam's output and comparisons must say so",
  },
  {
    id: "cam-evaluator-scorecard",
    what: "Cam's evaluator results / scorecard from the model evaluation that favored Opus",
    status: "missing",
    substitute: null,
  },
  {
    id: "production-writer-branch",
    what: "The branch or PR containing the production writer (buildContentBriefPagePrompt is a draft file, present in no pushed branch)",
    status: "missing",
    substitute: null,
  },
  {
    id: "official-brief-adapter",
    what: "The official adapter mapping the SEO Engine response into the writer contract",
    status: "substituted",
    substitute: `Draft adapter ${ADAPTER_VERSION} in this workbench (pure field mapping)`,
  },
];
