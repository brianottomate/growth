import type { ZodType } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import { env } from "@/env";

// =====================================================
// CLIENT INITIALIZATION
// =====================================================

/**
 * Firecrawl API client for web scraping
 *
 * @see https://docs.firecrawl.dev
 */
export const firecrawl = new Firecrawl({
  apiKey: env.FIRECRAWL_API_KEY!,
});

// =====================================================
// TYPE DEFINITIONS
// =====================================================

interface ScrapeResult {
  markdown?: string;
  metadata?: Record<string, unknown>;
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
  formats?: ("markdown" | "html")[];
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
