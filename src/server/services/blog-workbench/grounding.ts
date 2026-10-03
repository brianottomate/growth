import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import {
  firecrawl,
  isFirecrawlConfigured,
} from "@/server/clients/firecrawl.client";

import type { ContentBriefGroundingContext } from "./contract";

// Builds a crawl-derived STAND-IN for the production grounding context. The
// real ContentBriefGroundingContext comes from first-party property data in
// the monolith; that input is missing, so this derives one from the target
// business's public site instead and says so in its provenance. Extraction
// is extractive-only: the model may copy facts off the pages, never add any.

export const GROUNDING_VERSION = "crawl-derived/v1";

export type GroundingContextRecord = {
  // crawl-derived/v1 comes from this builder; synthetic-fixture/v1 is a
  // hand-authored fixture for briefs whose target domain has no crawlable
  // site (the golden-run example targets a parked domain).
  version:
    | typeof GROUNDING_VERSION
    | "synthetic-fixture/v1"
    | "source-article-derived/v1";
  provenance: string;
  targetDomain: string;
  crawledUrls: string[];
  derivedAt: string;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
  context: ContentBriefGroundingContext;
};

const MAX_LISTING_PAGES = 4;
const LISTING_PATH_HINT =
  /propert|rental|home|house|vacation|listing|stay|book/i;

const GroundingExtraction = z.object({
  businessName: z.string(),
  summary: z
    .string()
    .nullable()
    .describe("One or two sentences describing the business, from page text"),
  locations: z.array(z.string()),
  amenities: z
    .array(z.string())
    .describe("Amenities the pages explicitly mention"),
  activities: z
    .array(z.string())
    .describe("Nearby activities the pages explicitly mention"),
  targetAudience: z.string().nullable(),
  distinctiveFeatures: z.array(z.string()),
  typicalPriceRange: z
    .string()
    .nullable()
    .describe(
      "Only if a price or price band is printed on a page, quoted as printed",
    ),
  voice: z
    .string()
    .nullable()
    .describe(
      "One sentence characterizing the site's own writing voice, or null",
    ),
  properties: z.array(
    z.object({
      name: z.string(),
      href: z
        .string()
        .describe("The real URL of that property's page on their site"),
      sleeps: z.number().nullable(),
      bedrooms: z.number().nullable(),
      location: z.string().nullable(),
      amenities: z.array(z.string()),
    }),
  ),
});

const EXTRACTION_SYSTEM = [
  "You are building a grounding fact sheet for a vacation-rental manager",
  "from crawled pages of their own public website. Extract ONLY facts the",
  "pages state. Never infer, average, estimate, or fill gaps: a field the",
  "pages do not support is null or an empty list. Numbers (sleeps, bedrooms,",
  "prices) must appear on the pages. Property hrefs must be real URLs from",
  "the crawl, never constructed.",
].join("\n");

export async function buildCrawlDerivedGrounding(
  targetDomain: string,
): Promise<GroundingContextRecord> {
  if (!isFirecrawlConfigured) {
    throw new Error("Firecrawl is not configured");
  }

  const origin = `https://${targetDomain}`;
  const [homepage, siteMap] = await Promise.all([
    firecrawl.scrape(origin, {
      formats: ["markdown", "links"],
      onlyMainContent: false,
    }),
    firecrawl.map(origin, { limit: 100 }).catch(() => null),
  ]);

  const mappedUrls: string[] = (siteMap?.links ?? [])
    .map((link: { url?: string } | string) =>
      typeof link === "string" ? link : (link.url ?? ""),
    )
    .filter((url: string) => url.startsWith("http"));

  const listingUrls = mappedUrls
    .filter((url) => LISTING_PATH_HINT.test(new URL(url).pathname))
    .filter((url) => new URL(url).pathname !== "/")
    .slice(0, MAX_LISTING_PAGES);

  const listingPages = await Promise.all(
    listingUrls.map(async (url) => {
      try {
        const page = await firecrawl.scrape(url, {
          formats: ["markdown"],
          onlyMainContent: true,
        });
        return { url, markdown: page.markdown ?? "" };
      } catch {
        return { url, markdown: "" };
      }
    }),
  );

  const corpus = [
    `## PAGE ${origin}`,
    (homepage.markdown ?? "").slice(0, 30_000),
    ...listingPages
      .filter((page) => page.markdown)
      .map((page) => `## PAGE ${page.url}\n${page.markdown.slice(0, 15_000)}`),
  ].join("\n\n");

  const { output, usage } = await generateText({
    model: anthropic("claude-sonnet-5"),
    output: Output.object({ schema: GroundingExtraction }),
    system: EXTRACTION_SYSTEM,
    prompt: corpus,
  });

  // An empty extraction means the site had nothing to extract (parked
  // domain, splash page). Caching it would silently starve every later run.
  if (!output.businessName && output.properties.length === 0) {
    throw new Error(
      `Crawl of ${targetDomain} yielded no extractable business facts (parked or empty site?). Provide a synthetic-fixture/v1 grounding file instead.`,
    );
  }

  return {
    version: GROUNDING_VERSION,
    provenance:
      "Derived from a public-site crawl as a stand-in for the missing production grounding context. Not first-party property data.",
    targetDomain,
    crawledUrls: [origin, ...listingPages.map((page) => page.url)],
    derivedAt: new Date().toISOString(),
    model: "claude-sonnet-5",
    usage: {
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
    },
    context: output,
  };
}
