/** Add ranked recommendations without replacing existing featured homes or exceeding capacity. */
export function featuredHomeAdditions(
  recommendedIds: string[],
  existingIds: string[],
  maximum = 10,
): string[] {
  const existing = new Set(existingIds);
  return [...new Set(recommendedIds)]
    .filter((id) => !existing.has(id))
    .slice(0, Math.max(0, maximum - existing.size));
}
