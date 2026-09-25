"use client";

import Link from "next/link";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, ImageOff, Loader2, Plus, Search, Star } from "lucide-react";

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
  heroUrl,
}: {
  homes: RowHome[];
  brandSlug: string;
  /** The brand hero's listing URL; its tile carries a star. */
  heroUrl: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return homes;
    return homes.filter((home) =>
      `${home.name} ${home.facts}`.toLowerCase().includes(q),
    );
  }, [homes, query]);
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
            placeholder={`Search ${homes.length} homes`}
            className="h-8 w-full max-w-72 rounded-full border bg-muted/40 pr-3 pl-8 text-xs outline-none focus:ring-2 focus:ring-ring"
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
        {shown.map((home) => {
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
              <Link
                href={`/app/performance/brands/${brandSlug}/homes/${home.externalId}`}
                className="block"
              >
                {home.heroThumbUrl ? (
                  // oxlint-disable-next-line nextjs/no-img-element
                  <img
                    src={home.heroThumbUrl}
                    alt={home.name}
                    loading="lazy"
                    className="aspect-[4/3] w-full bg-muted object-cover transition-opacity group-hover:opacity-90"
                  />
                ) : (
                  <span className="grid aspect-[4/3] w-full grid-cols-1 place-items-center bg-muted text-muted-foreground">
                    <ImageOff className="size-4" aria-label="No hero photo" />
                  </span>
                )}
                <span className="block px-2.5 py-2">
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    {home.url === heroUrl ? (
                      <Star
                        className="size-3 shrink-0 fill-current"
                        aria-label="Brand hero"
                      />
                    ) : null}
                    <span className="truncate group-hover:underline">
                      {home.name}
                    </span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {home.facts}
                  </span>
                </span>
              </Link>
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
                  "absolute top-1.5 left-1.5 grid size-7 place-items-center rounded-full border text-white transition disabled:opacity-40",
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
    </>
  );
}
