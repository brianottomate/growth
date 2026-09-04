import "server-only";

import type { BrandingProfile } from "@mendable/firecrawl-js";

import { scrapeUrl } from "@/server/clients/firecrawl.client";
import type { BrandIdentity, BrandWebsiteMeta } from "@/server/db/brand-schema";
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
  /** Absent when Firecrawl returned no branding profile for the page. */
  brandIdentity?: BrandIdentity;
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (value: string | undefined) =>
  value && HEX.test(value.trim()) ? value.trim().toLowerCase() : undefined;

/**
 * Firecrawl's branding profile, reduced to what the brand row stores and the
 * renderer reads. Only six-digit hex colours survive: the renderer feeds them
 * to satori unchecked, and Firecrawl sometimes reports `rgb()` or a name.
 * Fonts come from the typography roles when present, else the flat list.
 */
export function identityFromBranding(
  branding: BrandingProfile | undefined,
  fallback: { favicon?: string; ogImage?: string },
): BrandIdentity | undefined {
  if (!branding) return undefined;
  const families = branding.typography?.fontFamilies;
  const fonts: NonNullable<BrandIdentity["fonts"]> = [];
  if (families?.primary) fonts.push({ family: families.primary, role: "body" });
  if (families?.heading && families.heading !== families.primary) {
    fonts.push({ family: families.heading, role: "heading" });
  }
  if (fonts.length === 0) {
    for (const font of branding.fonts ?? []) {
      if (font.family) fonts.push({ family: font.family });
    }
  }
  const colors = {
    primary: hex(branding.colors?.primary),
    secondary: hex(branding.colors?.secondary),
    accent: hex(branding.colors?.accent),
  };
  return {
    colorScheme: branding.colorScheme,
    colors,
    fonts,
    logo: branding.logo ?? branding.images?.logo ?? null,
    favicon: branding.images?.favicon ?? fallback.favicon ?? null,
    ...(branding.personality && { personality: branding.personality }),
    extractedAt: new Date().toISOString(),
  };
}

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
  const result = await scrapeUrl({ url, formats: ["markdown", "branding"] });
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

  const brandIdentity = identityFromBranding(result.branding, {
    favicon,
    ogImage,
  });

  return {
    tagline: title,
    description,
    logo: selectBrandLogo({ logo: brandIdentity?.logo, favicon, ogImage }),
    brandIdentity,
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
