/** Below this many homes, "on every home" says nothing about the brand. */
const MIN_HOMES = 5;
/** An amenity on this share of homes or more is the brand's, not the home's. */
const BRAND_WIDE_SHARE = 0.8;

/**
 * Amenities nearly every home in the catalog lists. A resort-style operator
 * gives every cabin the hot tub and the community pool, so leading with them
 * prints one headline on every card and tells a guest nothing about the home.
 */
export function brandWideAmenities(
  homes: readonly { amenities?: readonly string[] | null }[],
): string[] {
  if (homes.length < MIN_HOMES) return [];
  const counts = new Map<string, { label: string; count: number }>();
  for (const home of homes) {
    const seen = new Set<string>();
    for (const label of home.amenities ?? []) {
      const key = label.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const row = counts.get(key) ?? { label: label.trim(), count: 0 };
      row.count += 1;
      counts.set(key, row);
    }
  }
  return [...counts.values()]
    .filter((row) => row.count / homes.length >= BRAND_WIDE_SHARE)
    .map((row) => row.label);
}

/** Catalog copy never carries an em dash; it reads as machine-written. */
export const EM_DASH_MESSAGE =
  "No em dashes: use a comma, a colon or two short phrases instead.";
export const hasEmDash = (text: string) => text.includes("—");
