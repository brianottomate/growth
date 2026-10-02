"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Keep the sales desk responsive while its organization-scoped results load. */
export function PitchSearch({
  term,
  children,
}: {
  term: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(term);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requested = useRef<string | null>(null);

  useEffect(() => {
    // Restore bookmarked/back-forward queries without resetting newer typing.
    if (requested.current === null) setQuery(term);
    if (requested.current === term) requested.current = null;
  }, [term]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function search(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const nextTerm = value.trim().slice(0, 160);
    requested.current = nextTerm;
    startTransition(() => {
      const params = new URLSearchParams();
      if (nextTerm) params.set("q", nextTerm);
      router.replace(`/app/performance/pitch${nextTerm ? `?${params}` : ""}`, {
        scroll: false,
      });
    });
  }

  const searching = pending || query.trim().slice(0, 160) !== term;
  return (
    <div className="space-y-7">
      <form
        className="flex gap-2"
        action="/app/performance/pitch"
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          search(query);
        }}
      >
        <input
          name="q"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => search(value), 350);
          }}
          maxLength={160}
          autoFocus
          aria-label="Search company or website"
          aria-describedby="pitch-search-status"
          placeholder="Search a company or paste their website…"
          className="min-h-16 min-w-0 flex-1 rounded-2xl border bg-card px-5 text-lg"
        />
        <button
          className="rounded-2xl bg-primary px-5 text-primary-foreground"
          type="submit"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>
      <p
        id="pitch-search-status"
        role="status"
        className="text-sm text-muted-foreground"
      >
        {searching
          ? "Finding matching prospects and leads…"
          : "Searches as you type. Open a pitch below, or add a matching lead as a prospect."}
      </p>
      <div
        aria-busy={searching}
        className={
          searching ? "pointer-events-none space-y-7 opacity-50" : "space-y-7"
        }
      >
        {children}
      </div>
    </div>
  );
}
