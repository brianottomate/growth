const nameKey = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

/** Preserve existing personas and drop repeated names from a proposed starter set. */
export function newPersonaSuggestions<T extends { name: string }>(
  suggestions: T[],
  existingNames: string[],
): T[] {
  const used = new Set(existingNames.map(nameKey));
  return suggestions
    .filter((suggestion) => {
      const key = nameKey(suggestion.name);
      if (!key || used.has(key)) return false;
      used.add(key);
      return true;
    })
    .slice(0, 3);
}
