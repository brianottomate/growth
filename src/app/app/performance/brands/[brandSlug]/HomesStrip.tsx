"use client";

import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  PenLine,
  Plus,
  Search,
  Star,
  ZoomIn,
} from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { adPreviewStudioHref } from "@/lib/ad-preview-links";
import { orpc } from "@/orpc/client";

/** A home as the listing feed reports it; only what the tile and lightbox draw. */
export type StripHome = {
  id: string;
  name: string;
  url: string;
  imageUrl: string;
  thumbUrl: string | null;
  facts: string;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  rating: number | null;
};

const panel = "bg-card overflow-hidden rounded-2xl border";

/**
 * The homes on their WanderOS site. Browse them as photos, pick the three to
 * ten a set runs on (a tick on each tile), choose the hero that stands for the
 * brand, or open a lightbox on the hero and design an ad from it. The
 * catalog-card view of the same roster lives at the foot of the Ads tab.
 */
export function HomesStrip({
  homes,
  brandId,
  brandSlug,
  featuredUrl,
  picked,
}: {
  homes: StripHome[];
  brandId: string;
  brandSlug: string | null;
  /** The home that stands for the brand; its tile and lightbox say so. */
  featuredUrl: string | null;
  /** The committed set: feed id → its `home` row id. A tick toggles it. */
  picked: { externalId: string; homeId: string }[];
}) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return homes;
    return homes.filter((home) =>
      [home.name, home.city, home.state]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [homes, query]);
  // The lightbox steps through what is on screen, so it indexes the filtered
  // list rather than the whole roster.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex !== null ? (shown[openIndex] ?? null) : null;
  const router = useRouter();
  const design = useMutation(
    orpc.media.importUrls.mutationOptions({
      onSuccess: (result) => {
        const asset = result.assets[0];
        if (!asset) {
          toast.error("The photo could not be brought into the library");
          return;
        }
        router.push(
          adPreviewStudioHref({ brandId, brandSlug, sourceAssetId: asset.id }),
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  // The hero is a saved choice on the brand: the ad previews draw from it.
  const feature = useMutation(
    orpc.brand.setPreviewSource.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.featuredListingUrl
            ? "Hero set. The ad previews draw from this home now."
            : "Hero cleared",
        );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  // Picking commits (or drops) a `home` row for the set the ads run on.
  const byExternal = new Map(picked.map((p) => [p.externalId, p.homeId]));
  const add = useMutation(
    orpc.brand.homesAddWanderOs.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
      onSettled: () => setBusyId(null),
    }),
  );
  const drop = useMutation(
    orpc.brand.homesRemove.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
      onSettled: () => setBusyId(null),
    }),
  );
  const togglePick = (home: StripHome) => {
    const homeId = byExternal.get(home.id);
    if (homeId) {
      setBusyId(home.id);
      drop.mutate({ brandId, homeId });
      return;
    }
    setBusyId(home.id);
    add.mutate({ brandId, externalId: home.id });
  };

  const step = useCallback(
    (delta: number) => {
      setOpenIndex((current) => {
        if (current === null || shown.length === 0) return current;
        return (current + delta + shown.length) % shown.length;
      });
    },
    [shown.length],
  );

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, step]);

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpenIndex(null);
            }}
            placeholder={`Search ${homes.length} homes`}
            className="h-8 w-full max-w-72 rounded-full border bg-muted/40 pr-3 pl-8 text-xs outline-none focus:ring-2 focus:ring-sky-400/40"
          />
        </label>
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
        {shown.map((home, index) => {
          const isPicked = byExternal.has(home.id);
          const busy = busyId === home.id;
          return (
            <li
              key={home.id}
              className={cn(
                panel,
                "group relative",
                isPicked && "ring-1 ring-sky-400",
              )}
            >
              {/* The card is the way in to the home. The photo is a detail of
                it, so zooming is a control ON the card rather than the whole
                point of it. Siblings, so no interactive nests in another. */}
              <Link
                href={`/app/performance/brands/${brandSlug ?? brandId}/homes/${home.id}`}
                className="block"
              >
                <span className="relative block">
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
                  <img
                    src={home.thumbUrl ?? home.imageUrl}
                    alt={home.name}
                    loading="lazy"
                    className="aspect-[4/3] w-full bg-black/20 object-cover transition-opacity group-hover:opacity-90"
                  />
                </span>
                <span className="block px-2.5 py-2">
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    {home.url === featuredUrl ? (
                      <Star
                        className="size-3 shrink-0 fill-amber-300 text-amber-300"
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
                onClick={() => setOpenIndex(index)}
                aria-label={`See ${home.name} at full size`}
                title="See the photo at full size"
                className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full border border-white/50 bg-black/50 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ZoomIn className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => togglePick(home)}
                disabled={busy}
                aria-pressed={isPicked}
                aria-label={
                  isPicked
                    ? `Drop ${home.name} from the set`
                    : `Add ${home.name} to the set`
                }
                title={isPicked ? "In the set" : "Add to the set"}
                className={cn(
                  "absolute top-1.5 left-1.5 grid size-7 place-items-center rounded-full border text-white transition disabled:opacity-40",
                  isPicked
                    ? "border-sky-300 bg-sky-500 opacity-100"
                    : "border-white/50 bg-black/50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                )}
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : isPicked ? (
                  <Check className="size-3.5" />
                ) : (
                  <Plus className="size-3.5" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <Dialog
        open={open !== null}
        onOpenChange={(next) => !next && setOpenIndex(null)}
      >
        {open ? (
          <DialogContent
            tone="media"
            className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col overflow-hidden p-0 sm:max-w-[96vw]"
          >
            <DialogHeader
              divider="media"
              className="shrink-0 px-5 py-3 pr-12 text-left"
            >
              <DialogTitle
                tone="media"
                className="flex flex-wrap items-center gap-3 text-sm"
              >
                <span className="truncate">{open.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  tone="media-outline"
                  className="h-7 shrink-0"
                  loading={design.isPending}
                  onClick={() =>
                    design.mutate({
                      brandId,
                      images: [{ url: open.imageUrl, title: open.name }],
                    })
                  }
                >
                  <PenLine className="size-3.5" />
                  {design.isPending
                    ? "Bringing the photo in…"
                    : "Design an ad from this photo"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  tone="media-outline"
                  className="h-7 shrink-0"
                  loading={feature.isPending}
                  onClick={() =>
                    feature.mutate(
                      open.url === featuredUrl
                        ? { id: brandId, listingUrl: null, sourceUrl: null }
                        : {
                            id: brandId,
                            listingUrl: open.url,
                            sourceUrl: open.imageUrl,
                          },
                    )
                  }
                >
                  <Star
                    className={
                      open.url === featuredUrl
                        ? "size-3.5 fill-amber-300 text-amber-300"
                        : "size-3.5"
                    }
                  />
                  {open.url === featuredUrl ? "Hero" : "Use as hero"}
                </Button>
                <ButtonLink
                  href={open.url}
                  target="_blank"
                  rel="noreferrer"
                  size="sm"
                  variant="ghost"
                  tone="media-ghost"
                  className="h-7 shrink-0"
                >
                  <ExternalLink className="size-3.5" />
                  Their listing
                </ButtonLink>
              </DialogTitle>
              <DialogDescription tone="media" className="text-xs">
                {[
                  `${(openIndex ?? 0) + 1} of ${shown.length}`,
                  open.facts || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>
            <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              <img
                key={open.id}
                src={open.imageUrl}
                alt={open.name}
                className="max-h-full max-w-full object-contain"
              />
              {homes.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Previous home"
                    className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Next home"
                    className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              ) : null}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
