"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

export type BrandSearchEntry = {
  key: string;
  /** Name, slug, website, tagline and channel handles, lowercased server-side. */
  search: string;
  node: ReactNode;
};

export type BrandSearchGroup = {
  label: string;
  entries: BrandSearchEntry[];
  /** Off until explicitly enabled. The default directory shows our company and personal brands. */
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

  // A company card can link directly to a tracked brand below. Reveal that
  // group before scrolling, even though it is absent from the default view.
  useEffect(() => {
    const revealLinkedBrand = () => {
      const anchor = window.location.hash.slice(1);
      const group = groups.find((item) =>
        item.entries.some((entry) => `tracked-brand-${entry.key}` === anchor),
      );
      if (group)
        setHidden((current) =>
          current.includes(group.label)
            ? current.filter((label) => label !== group.label)
            : current,
        );
    };
    revealLinkedBrand();
    window.addEventListener("hashchange", revealLinkedBrand);
    return () => window.removeEventListener("hashchange", revealLinkedBrand);
  }, [groups]);

  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    if (anchor.startsWith("tracked-brand-"))
      document.getElementById(anchor)?.scrollIntoView();
  }, [hidden]);

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

  const total = matched.reduce(
    (count, group) => count + group.entries.length,
    0,
  );

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
          className="w-72 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
        />
        {(groups.length > 1 || groups.some((group) => group.defaultHidden)) &&
          groups.map((group) => {
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
        <p className="mt-10 text-sm text-muted-foreground">
          No brands match “{query}” in the groups you have on.
        </p>
      )}
      {query.trim() === "" && total === 0 && (
        <p className="mt-10 text-sm text-muted-foreground">
          No brands in the selected groups. Choose a group above or create a new
          brand.
        </p>
      )}

      {matched.map((group) =>
        group.entries.length === 0 ? null : (
          <Fragment key={group.label}>
            <h2 className="mt-8 mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
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
