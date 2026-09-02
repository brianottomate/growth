import "server-only";

import { scrapeUrl } from "@/server/clients/firecrawl.client";
import type { BrandWebsiteMeta } from "@/server/db/brand-schema";
import { selectBrandLogo } from "@/server/services/brand-enrichment-meta";

/** Pull the first non-empty string from a metadata blob across candidate keys. */
function pick(
  meta: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (
      Array.isArray(value) &&
      typeof value[0] === "string" &&
      value[0].trim()
    ) {
      return value[0].trim();
    }
  }
  return undefined;
}

export type BrandEnrichment = {
  tagline?: string;
  description?: string;
  logo?: string;
  websiteMeta: BrandWebsiteMeta;
};

/**
 * Scrape a brand's website and map page metadata onto brand fields.
 *
 * Intentionally simple: pulls title/description/logo from the page's
 * OpenGraph/meta tags via Firecrawl. Returns null if the scrape fails so
 * callers can degrade gracefully. AI summarization and social discovery can
 * be layered in here later.
 */
export async function enrichBrandFromWebsite(
  url: string,
): Promise<BrandEnrichment | null> {
  const result = await scrapeUrl({ url, formats: ["markdown"] });
  if (!result?.metadata) return null;

  const meta = result.metadata;
  const title = pick(meta, "ogTitle", "og:title", "title");
  const description = pick(
    meta,
    "ogDescription",
    "og:description",
    "description",
  );
  const ogImage = pick(meta, "ogImage", "og:image");
  const favicon = pick(meta, "favicon");

  return {
    tagline: title,
    description,
    logo: selectBrandLogo({ favicon, ogImage }),
    websiteMeta: {
      title,
      description,
      favicon,
      ogImage,
      scrapedAt: new Date().toISOString(),
    },
  };
}

/**
 * A display-name guess from scraped metadata: the first segment of the page
 * title before the usual separator garnish ("Homi — find your place" → "Homi").
 */
export function suggestNameFromEnrichment(
  enrichment: BrandEnrichment,
): string | null {
  const title = enrichment.websiteMeta.title ?? enrichment.tagline;
  if (!title) return null;
  const first = title.split(/[|•·–—]|( - )/)[0]?.trim();
  return first && first.length >= 2 ? first : null;
}
