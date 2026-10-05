"use client";

import { HomePreview } from "@/components/home-preview";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

/** A home as its row holds it: what the tile draws and the featured tick. */
export type RowHome = {
  id: string;
  externalId: string;
  name: string;
  url: string;
  /** The hero's gallery thumbnail; the full file is too heavy for a tile. */
  heroThumbUrl: string | null;
  featured: boolean;
  facts: string;
};

const panel = "bg-card overflow-hidden rounded-2xl border";

/** Guidance, not a limit: a set reads best on three to ten homes. */
const SUGGESTED_MAX = 10;

/**
 * Every home on the record for a brand, drawn from its rows. The card opens
 * the home; the tick features it or takes it out. This replaces the feed-read
 * strip for brands whose homes are ingested; `HomesStrip` stays for the rest
 * until they are.
 */
export function HomeRowsGrid({
  homes,
  brandSlug,
}: {
  homes: RowHome[];
  brandSlug: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loadAll, setLoadAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return homes;
    return homes.filter((home) =>
      `${home.name} ${home.facts}`.toLowerCase().includes(q),
    );
  }, [homes, query]);
  const visible = loadAll ? shown : shown.slice(0, 12);
  const featuredCount = homes.filter((home) => home.featured).length;

  const toggle = useMutation(
    orpc.brand.homesSetFeatured.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
      onSettled: () => setBusyId(null),
    }),
  );

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search homes"
            placeholder={`Search ${homes.length} homes`}
            className="h-11 w-full max-w-72 rounded-full border bg-muted/40 pr-3 pl-8 text-base outline-none focus:ring-2 focus:ring-ring @xl:h-8 @xl:text-xs"
          />
        </label>
        {featuredCount > SUGGESTED_MAX ? (
          <p className="text-[11.5px] text-muted-foreground">
            {featuredCount} featured. Sets read best on 3 to 10 homes.
          </p>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p
          className={cn(
            panel,
            "px-4 py-8 text-center text-xs text-muted-foreground",
          )}
        >
          No home matches “{query}”.
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-2.5 @xl:grid-cols-3 @4xl:grid-cols-6">
        {visible.map((home) => {
          const busy = busyId === home.id;
          return (
            <li
              key={home.id}
              className={cn(
                panel,
                "group relative",
                home.featured && "ring-1 ring-ring",
              )}
            >
              <HomePreview
                href={`/app/performance/clients/${brandSlug}/homes/${home.externalId}`}
                name={home.name}
                imageUrl={home.heroThumbUrl}
                facts={home.facts}
                layout="card"
              />
              <button
                type="button"
                onClick={() => {
                  setBusyId(home.id);
                  toggle.mutate({ homeId: home.id, featured: !home.featured });
                }}
                disabled={busy}
                aria-pressed={home.featured}
                aria-label={
                  home.featured
                    ? `Stop featuring ${home.name}`
                    : `Feature ${home.name}`
                }
                title={home.featured ? "Featured" : "Feature this home"}
                className={cn(
                  "absolute top-1.5 left-1.5 grid size-11 place-items-center rounded-full border text-white transition disabled:opacity-40 @xl:size-7",
                  home.featured
                    ? "border-white/70 bg-black/70 opacity-100"
                    : "border-white/50 bg-black/50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
                )}
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : home.featured ? (
                  <Check className="size-3.5" />
                ) : (
                  <Plus className="size-3.5" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {visible.length < shown.length ? (
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <span className="text-xs text-muted-foreground">
            {visible.length} of {shown.length} homes
          </span>
          <Button size="sm" variant="outline" onClick={() => setLoadAll(true)}>
            Load all
          </Button>
        </div>
      ) : null}
    </>
  );
}
