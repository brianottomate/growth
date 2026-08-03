import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  pregenNativeCrawlPageTable,
  pregenNativeProspectTable,
} from "@/server/db/schema";
import { firecrawl } from "@/server/clients/firecrawl.client";

import type { StepContext } from "../pipeline";

// Mirrors the monolith's caps: markdown 15k for LLM context; listing scrape
// budget below the enrichment flow's MAX_LISTING_PAGES=20 since V0 renders
// at most 10 gallery units.
const MAX_MARKDOWN_CHARS = 15_000;
const MAX_LISTING_PAGES = 12;
const MAP_LIMIT = 500;

/**
 * Crawl the prospect's site: homepage (the generation context) plus the
 * listing pages that will feed the property grid. Growth-native equivalent
 * of the monolith's `siteEditorFetchExistingSitePage` + the enrichment
 * workflow's select-listing-pages / per-page scrape, collapsed onto
 * Firecrawl only (no Spider/Semrush/DataForSEO/BrightData tiers).
 */
export async function crawlStep(ctx: StepContext) {
  const origin = normalizeToOrigin(ctx.sourceUrl);

  const [homepage, mapped] = await Promise.all([
    scrapePage(origin),
    firecrawl.map(origin, { limit: MAP_LIMIT }).catch(() => null),
  ]);

  if (!homepage?.markdown) {
    throw new Error(`homepage scrape returned no content for ${origin}`);
  }

  await db.insert(pregenNativeCrawlPageTable).values({
    buildId: ctx.buildId,
    url: origin,
    kind: "homepage",
    markdown: homepage.markdown.slice(0, MAX_MARKDOWN_CHARS),
    metadata: {
      title: homepage.metadata?.title,
      description: homepage.metadata?.description,
      ogImage: homepage.metadata?.ogImage,
      imageUrls: homepage.imageUrls,
    },
  });

  // Derive a business name early so downstream steps never see a bare domain.
  const title =
    typeof homepage.metadata?.title === "string" ? homepage.metadata.title : null;
  if (title) {
    await db
      .update(pregenNativeProspectTable)
      .set({ name: title.split(/[|–—-]/)[0]?.trim() || title })
      .where(eq(pregenNativeProspectTable.id, ctx.prospectId));
  }

  const links = (mapped?.links ?? [])
    .map((l: { url: string } | string) => (typeof l === "string" ? l : l.url))
    .filter((u: string) => sameOrigin(u, origin));

  const listingUrls = await selectListingPages(links);

  let listingCount = 0;
  for (const url of listingUrls) {
    const page = await scrapePage(url);
    if (!page?.markdown) continue;
    await db.insert(pregenNativeCrawlPageTable).values({
      buildId: ctx.buildId,
      url,
      kind: "property",
      markdown: page.markdown.slice(0, MAX_MARKDOWN_CHARS),
      metadata: { title: page.metadata?.title, imageUrls: page.imageUrls },
    });
    listingCount += 1;
  }

  return {
    mappedLinks: links.length,
    listingCandidates: listingUrls.length,
    listingPagesCaptured: listingCount,
  };
}

// ---- SCRAPE ----------------------------------------------------------

type ScrapedPage = {
  markdown?: string;
  imageUrls: string[];
  metadata?: Record<string, unknown>;
};

async function scrapePage(url: string): Promise<ScrapedPage | null> {
  try {
    const result = await firecrawl.scrape(url, {
      formats: ["markdown", "images"],
      onlyMainContent: false,
      blockAds: true,
      waitFor: 4_000,
      timeout: 60_000,
      maxAge: 86_400_000,
      proxy: "auto",
    });
    return {
      markdown: result.markdown,
      imageUrls: (result.images ?? []).slice(0, 40),
      metadata: result.metadata,
    };
  } catch {
    return null;
  }
}

// ---- LISTING SELECTION ----------------------------------------------
// Prompt ported near-verbatim from the monolith's prospect-enrichment
// select-listing-pages.ts — one call over path strings, whole set at once,
// budget expressed to the model. Fallback: crawl order.

const SelectedPaths = z.object({
  paths: z.array(z.string()).describe("The paths to scrape, exactly as given"),
});

const selectionPrompt = (limit: number) =>
  [
    "You are choosing which pages to scrape from a vacation-rental manager's website.",
    "",
    "The paths below were discovered on the site. They mix marketing pages, collections",
    "of listings, sub-views OF a listing, and individual listing pages.",
    "",
    "CHOOSE a path only when it is the page a guest lands on for ONE specific rental —",
    "the page carrying that unit's name, photos, nightly rate and bedroom count.",
    "",
    "REJECT:",
    '- collections and search results ("/properties", "/cabins/pet-friendly", "/locations/aspen")',
    "- sub-views of a listing. These are the single biggest source of waste: a site will file",
    '  "/properties/123", "/properties/123/rates" and "/properties/123/reviews" all as property',
    "  pages, and the last two are the same unit again. Keep only the page that IS the listing.",
    '  Watch for the same unit under different prefixes too ("/vr/x" and "/vrm/company/vr/x").',
    "- booking, checkout, quote and enquiry paths",
    "- owner, management, blog, guide and policy pages",
    "",
    "Read the whole list before deciding — the shapes only become obvious in aggregate, and a",
    'listing can live anywhere, including at the root ("/ocean-breeze-cottage").',
    "",
    `Return AT MOST ${limit} paths, exactly as written, best first — the ones most likely to be`,
    "rich, complete listings. Fewer is fine if fewer qualify.",
  ].join("\n");

async function selectListingPages(urls: string[]): Promise<string[]> {
  const byPath = new Map<string, string>();
  for (const url of urls) {
    try {
      const path = new URL(url).pathname;
      if (path !== "/" && !byPath.has(path)) byPath.set(path, url);
    } catch {
      // unparseable URL from map output — skip
    }
  }
  if (byPath.size === 0) return [];

  try {
    const ask = () =>
      generateText({
        model: anthropic("claude-sonnet-5"),
        output: Output.object({ schema: SelectedPaths }),
        system: selectionPrompt(MAX_LISTING_PAGES),
        prompt: [...byPath.keys()].join("\n"),
      });
    const { output } = await ask().catch(ask);

    return [...new Set(output.paths)]
      .flatMap((path) => {
        const url = byPath.get(path);
        return url ? [url] : [];
      })
      .slice(0, MAX_LISTING_PAGES);
  } catch {
    return [...byPath.values()].slice(0, MAX_LISTING_PAGES);
  }
}

// ---- URL HELPERS ------------------------------------------------------

function normalizeToOrigin(input: string): string {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return new URL(withScheme).origin;
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}
