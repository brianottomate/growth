import { z } from "zod";

// The two sides of the pipeline seam this workbench exists to inspect:
// SEO Engine emits a snake_case brief with run metadata; the site editor
// accepts a camelCase ContentBriefInput plus a separate grounding context.
// The workbench keeps its adapter explicit and versioned because it runs from
// a frozen fixture instead of importing the production service runtime.

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

// ---- WRITER CONTRACT (site editor, camelCase) -------------------------
// Mirrors the production `ContentBriefInput` and
// `ContentBriefGroundingContext` seam without coupling this fixture-backed lab
// to the monolith package graph.

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
  sourceUrls?: string[];
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
 * Normalizes the SEO Engine wire response into the site-editor writer input. Pure
 * field mapping, no enrichment: run metadata stays behind, and nothing is
 * invented. The version keeps fixture runs comparable as the production
 * ingestion path evolves independently.
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
    what: "The live ContentBriefGroundingContext built from first-party property data",
    status: "substituted",
    substitute:
      "A grounding fixture: crawl-derived/v1 when the target site is real, or a hand-authored synthetic-fixture/v1 when it is not (the example brief's domain is a parked page). Each file states its own provenance.",
  },
  {
    id: "production-writer-execution",
    what: "A production site-editor execution for this exact frozen brief",
    status: "substituted",
    substitute:
      "An independent workbench run using the same contract shape. Its receipts describe only the workbench run.",
  },
  {
    id: "live-brief-ingestion",
    what: "A current brief fetched from the production SEO pipeline",
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
