import type { ZodType } from "zod";
import Firecrawl, { type BrandingProfile } from "@mendable/firecrawl-js";
import { env } from "@/env";

// =====================================================
// CLIENT INITIALIZATION
// =====================================================

/**
 * Firecrawl API client for web scraping
 *
 * @see https://docs.firecrawl.dev
 */
export const isFirecrawlConfigured = !!env.FIRECRAWL_API_KEY;

// Optional integrations must never construct network clients during a build.
// Callers that need Firecrawl already handle a failed/null scrape; the one
// enrichment helper below makes the same absence explicit.
export const firecrawl = isFirecrawlConfigured
  ? new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY })
  : (null as unknown as Firecrawl);

/**
 * Scrape a site for lead enrichment: main-content markdown + page metadata +
 * a full-page screenshot URL. Throws on failure (the discovery service wraps
 * each provider in its own try/catch envelope).
 */
/**
 * Scrape a prospect's site for ranking and copy.
 *
 * Nothing is thrown away. The whole Firecrawl response comes back on `raw` and
 * gets stored, because every consumer so far has wanted a field the previous
 * version had already dropped, and a re-scrape costs a credit and a fresh page
 * that no longer matches what a stored judgement was made against.
 *
 * `onlyMainContent` is off for the same reason. It strips the hero, which is
 * usually an operator's best asset, along with the nav and footer where the
 * markets, phone number and license line live.
 */
export async function scrapeForEnrichment(url: string): Promise<{
  markdown?: string;
  html?: string;
  links?: string[];
  metadata?: Record<string, unknown>;
  screenshot?: string;
  images?: string[];
  raw?: Record<string, unknown>;
}> {
  if (!isFirecrawlConfigured) return {};
  const result = await firecrawl.scrape(url, {
    // `images` is a first-class format in the SDK and returns the page's image
    // URLs, which is what lets us judge whether an operator has real photography
    // or placeholder stock.
    formats: ["markdown", "html", "links", "screenshot", "images"],
    onlyMainContent: false,
  });
  const loose = result as Record<string, unknown>;
  return {
    markdown: result.markdown,
    html: loose.html as string | undefined,
    links: loose.links as string[] | undefined,
    metadata: result.metadata,
    // v4 returns the screenshot as a hosted URL on `screenshot`.
    screenshot:
      (loose.screenshot as string | undefined) ??
      (loose.screenshotUrl as string | undefined),
    images: loose.images as string[] | undefined,
    raw: loose,
  };
}

/**
 * The image URLs a page carries, for an operator to pick from.
 *
 * Firecrawl's `images` format splits srcsets on commas, and WanderOS sites
 * serve every photo through `/i/width=…,height=…,format=webp?src=<original>`,
 * so what comes back is mostly fragments like `/quality=85`. Anything carrying
 * a `src` parameter yields its original asset; anything else must look like an
 * image file to survive.
 */
export async function scrapeSiteImages(url: string): Promise<string[]> {
  if (!isFirecrawlConfigured) return [];
  const result = (await firecrawl.scrape(url, {
    formats: ["images"],
    onlyMainContent: false,
  })) as { images?: string[] };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of result.images ?? []) {
    const candidate = raw.trim().split(/\s+/)[0] ?? "";
    if (!/^https?:\/\//i.test(candidate)) continue;
    let resolved: string | null = null;
    try {
      const parsed = new URL(candidate);
      const src = parsed.searchParams.get("src");
      if (src && /^https?:\/\//i.test(src)) resolved = src;
      else if (
        /\.(jpe?g|png|webp|avif)(\?|$)/i.test(parsed.pathname + parsed.search)
      )
        resolved = candidate;
      else if (
        /images\.unsplash\.com|assets\.wander\.com|cloudinary|imgix/i.test(
          parsed.hostname,
        )
      )
        resolved = candidate;
    } catch {
      continue;
    }
    if (!resolved) continue;
    if (
      /favicon|sprite|pixel|tracking|1x1|\.(svg|ico|gif)(\?|$)/i.test(resolved)
    )
      continue;
    const key = resolved.replace(/[?#].*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

// =====================================================
// TYPE DEFINITIONS
// =====================================================

interface ScrapeResult {
  markdown?: string;
  metadata?: Record<string, unknown>;
  /** Firecrawl's extracted brand profile, when `branding` was requested. */
  branding?: BrandingProfile;
}

interface ExtractResult {
  data: unknown;
}

interface MapResult {
  links: string[];
}

// =====================================================
// SCRAPING OPERATIONS
// =====================================================

/**
 * Scrape a URL and extract content in specified formats
 *
 * Returns null if scraping fails - non-critical operation for graceful degradation.
 *
 * @example
 * ```ts
 * const result = await scrapeUrl({
 *   url: "https://example.com",
 *   formats: ["markdown", "html"]
 * });
 *
 * if (result) {
 *   console.log(result.markdown);
 * }
 * ```
 */
export async function scrapeUrl(params: {
  url: string;
  formats?: ("markdown" | "html" | "branding")[];
}): Promise<ScrapeResult | null> {
  try {
    console.log("🔵 [Firecrawl] Scraping URL:", { url: params.url });

    const result = await firecrawl.scrape(params.url, {
      formats: params.formats || ["markdown"],
    });

    console.log("✅ [Firecrawl] Scrape succeeded:", {
      url: params.url,
      hasMarkdown: !!result.markdown,
    });

    return {
      markdown: result.markdown,
      metadata: result.metadata,
      branding: (result as { branding?: BrandingProfile }).branding,
    };
  } catch (error) {
    console.error("❌ [Firecrawl] Scrape failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      url: params.url,
    });
    return null;
  }
}

// =====================================================
// EXTRACTION OPERATIONS
// =====================================================

/**
 * Extract structured data from a URL using AI
 *
 * Returns null if extraction fails - non-critical operation for graceful degradation.
 *
 * @example
 * ```ts
 * const result = await extractStructuredData({
 *   url: "https://example.com/product",
 *   schema: productSchema,
 *   prompt: "Extract product information"
 * });
 *
 * if (result) {
 *   console.log(result.data);
 * }
 * ```
 */
export async function extractStructuredData(params: {
  url: string;
  schema?: ZodType;
  prompt?: string;
}): Promise<ExtractResult | null> {
  try {
    console.log("🔵 [Firecrawl] Extracting structured data:", {
      url: params.url,
    });

    const result = await firecrawl.extract({
      urls: [params.url],
      prompt: params.prompt || "Extract structured data from this page",
      schema: params.schema as Record<string, unknown> | undefined,
    });

    console.log("✅ [Firecrawl] Extraction succeeded:", {
      url: params.url,
    });

    return { data: result };
  } catch (error) {
    console.error("❌ [Firecrawl] Extraction failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      url: params.url,
    });
    return null;
  }
}

/**
 * Scrape a single page and pull a structured object out of it in ONE call,
 * via the v2 `json` format (the `/extract` endpoint is deprecated/maintenance).
 * Optionally also return the raw HTML from the same scrape (e.g. to regex for
 * chat-widget script signatures) so we don't pay for a second fetch.
 *
 * Returns null on hard failure; `json` is null if the model found nothing.
 *
 * @example
 * const res = await scrapeStructured({ url, schema: ContactChannelsSchema, includeHtml: true });
 * res?.json   // typed extraction
 * res?.html   // raw HTML (only when includeHtml)
 */
export async function scrapeStructured<T>(params: {
  url: string;
  schema: ZodType<T>;
  prompt?: string;
  includeHtml?: boolean;
}): Promise<{ json: T | null; html?: string } | null> {
  try {
    console.log("🔵 [Firecrawl] Structured scrape:", { url: params.url });

    const result = await firecrawl.scrape(params.url, {
      formats: [
        {
          type: "json",
          schema: params.schema,
          prompt: params.prompt,
        },
        ...(params.includeHtml ? (["html"] as const) : []),
      ],
      onlyMainContent: false, // contact details often live in the footer/header
    });

    console.log("✅ [Firecrawl] Structured scrape succeeded:", {
      url: params.url,
      hasJson: result.json != null,
    });

    return {
      json: (result.json as T | undefined) ?? null,
      html: result.html,
    };
  } catch (error) {
    console.error("❌ [Firecrawl] Structured scrape failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      url: params.url,
    });
    return null;
  }
}

/**
 * Scrape basic content from a URL (markdown only)
 *
 * Simplified scraping that returns markdown content and metadata.
 * Returns null if scraping fails or no content is found.
 *
 * @example
 * ```ts
 * const result = await scrapeBasicContent({ url: "https://example.com" });
 *
 * if (result) {
 *   console.log(result.content); // Markdown content
 *   console.log(result.title);   // Page title
 * }
 * ```
 */
export async function scrapeBasicContent(params: { url: string }): Promise<{
  title?: string;
  description?: string;
  content?: string;
  metadata?: Record<string, unknown>;
} | null> {
  try {
    console.log("🔵 [Firecrawl] Scraping basic content:", {
      url: params.url,
    });

    const result = await firecrawl.scrape(params.url, {
      formats: ["markdown"],
    });

    if (!result.markdown) {
      console.error("❌ [Firecrawl] No content returned:", {
        url: params.url,
      });
      return null;
    }

    console.log("✅ [Firecrawl] Basic scrape succeeded:", {
      url: params.url,
      hasContent: true,
    });

    return {
      title: result.metadata?.title,
      description: result.metadata?.description,
      content: result.markdown,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error("❌ [Firecrawl] Basic scrape failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      url: params.url,
    });
    return null;
  }
}

// =====================================================
// UTILITY OPERATIONS
// =====================================================

/**
 * Map a website to discover all pages/links
 *
 * Returns null if mapping fails - non-critical operation for graceful degradation.
 *
 * @example
 * ```ts
 * const result = await mapWebsite({
 *   url: "https://example.com",
 *   search: "blog",
 *   limit: 10
 * });
 *
 * if (result) {
 *   console.log(result.links); // Array of discovered URLs
 * }
 * ```
 */
export async function mapWebsite(params: {
  url: string;
  search?: string;
  limit?: number;
}): Promise<MapResult | null> {
  try {
    console.log("🔵 [Firecrawl] Mapping website:", {
      url: params.url,
      limit: params.limit,
    });

    const result = await firecrawl.map(params.url, {
      search: params.search,
      limit: params.limit,
    });

    const links = result.links.map((link: { url: string }) => link.url);

    console.log("✅ [Firecrawl] Website mapped successfully:", {
      url: params.url,
      linkCount: links.length,
    });

    return { links };
  } catch (error) {
    console.error("❌ [Firecrawl] Website mapping failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      url: params.url,
    });
    return null;
  }
}
