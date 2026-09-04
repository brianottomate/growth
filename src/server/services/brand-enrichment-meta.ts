/**
 * The best logo a scrape offered. Firecrawl's branding profile names the
 * real logo when it finds one; the favicon is a 32px fallback and the OG
 * image is usually a photo, so they come last.
 */
export function selectBrandLogo({
  logo,
  favicon,
  ogImage,
}: {
  logo?: string | null;
  favicon?: string;
  ogImage?: string;
}): string | undefined {
  return logo?.trim() || favicon || ogImage;
}
