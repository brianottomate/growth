"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";

export type BrandSearchEntry = {
  key: string;
  /** Name, slug, website, tagline and channel handles, lowercased server-side. */
  search: string;
  node: ReactNode;
};

export type BrandSearchGroup = {
  label: string;
  entries: BrandSearchEntry[];
};

/**
 * Every brand card is rendered on the server and sent down whole; this only
 * decides which of them to mount. The list is tens of rows, so a query per
 * keystroke would cost more than it saves.
 */
export function BrandSearch({ groups }: { groups: BrandSearchGroup[] }) {
  const [query, setQuery] = useState("");

  const matched = useMemo(() => {
    // Space-separated terms all have to hit, so "winter escapes" narrows
    // rather than widening the way an OR would.
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return groups;
    return groups.map((group) => ({
      ...group,
      entries: group.entries.filter((entry) =>
        terms.every((term) => entry.search.includes(term)),
      ),
    }));
  }, [groups, query]);

  const total = matched.reduce(
    (count, group) => count + group.entries.length,
    0,
  );

  return (
    <>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search brands by name, URL or handle…"
        aria-label="Search brands"
        className="border-border bg-background focus:ring-ring mt-6 w-72 rounded-md border px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
      />

      {query.trim() !== "" && total === 0 && (
        <p className="text-muted-foreground mt-10 text-sm">
          No brands match “{query}”.
        </p>
      )}

      {matched.map((group) =>
        group.entries.length === 0 ? null : (
          <Fragment key={group.label}>
            <h2 className="text-muted-foreground mt-8 mb-3 text-xs font-semibold tracking-wider uppercase">
              {group.label}
            </h2>
            <div className="flex flex-col gap-4">
              {group.entries.map((entry) => (
                <Fragment key={entry.key}>{entry.node}</Fragment>
              ))}
            </div>
          </Fragment>
        ),
      )}
    </>
  );
}
