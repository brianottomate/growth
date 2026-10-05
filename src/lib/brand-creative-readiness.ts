/** Foundations required before an import automatically prepares creative. */
export function missingCreativeFoundations(brand: {
  brandIdentity?: unknown;
  brandMark?: unknown;
  story?: string | null;
}) {
  return [
    !brand.brandIdentity && "brand identity",
    !brand.story?.trim() && "brand story",
    !brand.brandMark && "creative mark",
  ].filter((item): item is string => Boolean(item));
}
