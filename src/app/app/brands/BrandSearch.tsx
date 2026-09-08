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
  /**
   * Off until asked for. Prospects are the group that grows without bound, and
   * they are reached by searching for one rather than by scrolling past them.
   */
  defaultHidden?: boolean;
};

/**
 * Every brand card is rendered on the server and sent down whole; this only
 * decides which of them to mount. The list is tens of rows, so a query per
 * keystroke would cost more than it saves.
 */
export function BrandSearch({ groups }: { groups: BrandSearchGroup[] }) {
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<string[]>(() =>
    groups.filter((group) => group.defaultHidden).map((group) => group.label),
  );

  const shown = groups.filter((group) => !hidden.includes(group.label));

  const matched = useMemo(() => {
    // Space-separated terms all have to hit, so "winter escapes" narrows
    // rather than widening the way an OR would.
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return shown;
    return shown.map((group) => ({
      ...group,
      entries: group.entries.filter((entry) =>
        terms.every((term) => entry.search.includes(term)),
      ),
    }));
  }, [shown, query]);

  const total = matched.reduce((count, group) => count + group.entries.length, 0);

  const toggle = (label: string) =>
    setHidden((current) =>
      current.includes(label)
        ? current.filter((row) => row !== label)
        : [...current, label],
    );

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search brands by name, URL or handle…"
          aria-label="Search brands"
          className="border-border bg-background focus:ring-ring w-72 rounded-md border px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
        />
        {groups.length > 1 && groups.map((group) => {
          const on = !hidden.includes(group.label);
          return (
            <button
              key={group.label}
              type="button"
              onClick={() => toggle(group.label)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {group.label} {group.entries.length}
            </button>
          );
        })}
      </div>

      {query.trim() !== "" && total === 0 && (
        <p className="text-muted-foreground mt-10 text-sm">
          No brands match “{query}” in the groups you have on.
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
