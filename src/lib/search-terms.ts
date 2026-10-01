// An audience's search terms are plain strings so every editor, chat tool and
// suggestion can write them. Match type rides in the notation search
// platforms share: `[exact]`, `"phrase"`, bare for broad.

export type SearchMatch = "broad" | "phrase" | "exact";
export type SearchTerm = { text: string; match: SearchMatch };

export function parseSearchTerm(raw: string): SearchTerm | null {
  const value = raw.trim();
  const exact = /^\[(.+)\]$/.exec(value);
  if (exact) return clean(exact[1]!, "exact");
  const phrase = /^"(.+)"$/.exec(value);
  if (phrase) return clean(phrase[1]!, "phrase");
  return clean(value, "broad");
}

function clean(text: string, match: SearchMatch): SearchTerm | null {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized ? { text: normalized, match } : null;
}

export function formatSearchTerm(term: SearchTerm) {
  if (term.match === "exact") return `[${term.text}]`;
  if (term.match === "phrase") return `"${term.text}"`;
  return term.text;
}

/** Parsed, deduped by text and match type, in the order given. */
export function searchTerms(raw: readonly string[] | null | undefined) {
  const seen = new Set<string>();
  const terms: SearchTerm[] = [];
  for (const value of raw ?? []) {
    const term = parseSearchTerm(value);
    if (!term) continue;
    const key = `${term.match}:${term.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}
