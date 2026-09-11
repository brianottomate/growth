"use client";

import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  PenLine,
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
import {
  homeCatalogCopy,
  homeCatalogPreviewUrl,
} from "@/lib/home-ad-previews";
import { useTRPC } from "@/trpc/react";

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

/** A page of catalog cards. Every card is a server render, so they arrive in tens. */
const CATALOG_PAGE = 10;

/** What the download is, on hover; the page itself stays heading and data. */
const FEED_TITLE =
  "Meta Hotels and rentals feed, one row per home with a photo. Street address and coordinates are not on the WanderOS feed and export empty.";

/**
 * The homes on their WanderOS site, as their own photos or as the listing card
 * an Advantage+ catalog ad would draw, which is one roster seen two ways rather
 * than the same homes listed twice down the page. Each opens a lightbox on the
 * hero at full size. The hero lives on their site, not in our library, so the
 * way into the Studio imports it first: one click brings the photo in (or finds
 * the earlier import of the same URL) and opens the house card on it.
 */
export function HomesStrip({
  homes,
  brandId,
  brandSlug,
  featuredUrl,
}: {
  homes: StripHome[];
  brandId: string;
  brandSlug: string | null;
  /** The home that stands for the brand; its tile and lightbox say so. */
  featuredUrl: string | null;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"photo" | "catalog">("photo");
  // Only the catalog view pages: each of its tiles is a server render, while a
  // hero is a URL the feed already gave us.
  const [page, setPage] = useState(CATALOG_PAGE);
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
  const visible = view === "catalog" ? shown.slice(0, page) : shown;
  const left = shown.length - visible.length;
  const router = useRouter();
  const trpc = useTRPC();
  const design = useMutation(
    trpc.media.importUrls.mutationOptions({
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

  // Featuring is a saved choice on the brand: the ad previews draw from it.
  const feature = useMutation(
    trpc.brand.setPreviewSource.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.featuredListingUrl
            ? "Featured. The ad previews draw from this home now."
            : "No longer featured",
        );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

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
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpenIndex(null);
              setPage(CATALOG_PAGE);
            }}
            placeholder={`Search ${homes.length} homes`}
            className="bg-muted/40 h-8 w-full max-w-72 rounded-full border pr-3 pl-8 text-xs outline-none focus:ring-2 focus:ring-sky-400/40"
          />
        </label>
        <div className="flex items-center gap-3 text-[11.5px]">
          {view === "catalog"
            ? (["csv", "xml"] as const).map((format) => (
                <a
                  key={format}
                  href={`/api/performance/catalog/${encodeURIComponent(brandId)}?format=${format}`}
                  download
                  title={FEED_TITLE}
                  className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                >
                  <Download className="size-3" />
                  Meta {format.toUpperCase()}
                </a>
              ))
            : null}
          <div className="flex items-center gap-0.5 rounded-full border p-0.5">
            {(
              [
                { id: "photo", label: "Photos" },
                { id: "catalog", label: "Catalog cards" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                aria-pressed={view === option.id}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] transition-colors",
                  view === option.id
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {shown.length === 0 ? (
        <p
          className={cn(
            panel,
            "text-muted-foreground px-4 py-8 text-center text-xs",
          )}
        >
          No home matches “{query}”.
        </p>
      ) : null}
      <ul
        className={cn(
          "grid grid-cols-2 gap-2.5 @xl:grid-cols-3",
          view === "catalog" ? "@4xl:grid-cols-5" : "@4xl:grid-cols-6",
        )}
      >
        {visible.map((home, index) => (
          <li key={home.id} className={cn(panel, "group relative")}>
            {/* The card is the way in to the home. The photo is a detail of
                it, so zooming is a control ON the card rather than the whole
                point of it. Siblings, so no interactive nests in another. */}
            <Link
              href={`/app/performance/brands/${brandSlug ?? brandId}/homes/${home.id}`}
              className="block"
            >
              <span className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    view === "catalog"
                      ? homeCatalogPreviewUrl({
                          brandId,
                          source: { url: home.imageUrl },
                          formatId: "square",
                          copy: homeCatalogCopy(home),
                        })
                      : (home.thumbUrl ?? home.imageUrl)
                  }
                  alt={home.name}
                  loading="lazy"
                  className={cn(
                    "w-full bg-black/20 object-cover transition-opacity group-hover:opacity-90",
                    view === "catalog" ? "aspect-square" : "aspect-[4/3]",
                  )}
                />
              </span>
              <span className="block px-2.5 py-2">
                <span className="flex items-center gap-1 text-xs font-semibold">
                  {home.url === featuredUrl ? (
                    <Star
                      className="size-3 shrink-0 fill-amber-300 text-amber-300"
                      aria-label="Featured"
                    />
                  ) : null}
                  <span className="truncate group-hover:underline">
                    {home.name}
                  </span>
                </span>
                <span className="text-muted-foreground block truncate text-[11px]">
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
          </li>
        ))}
      </ul>
      {left > 0 ? (
        <div className="mt-2.5 flex items-center gap-3 text-[11.5px]">
          <button
            type="button"
            onClick={() => setPage(page + CATALOG_PAGE)}
            className="text-sky-300 hover:underline"
          >
            Load {Math.min(CATALOG_PAGE, left)} more
          </button>
          {left > CATALOG_PAGE ? (
            <button
              type="button"
              onClick={() => setPage(shown.length)}
              className="text-muted-foreground hover:text-foreground"
            >
              Show all {shown.length}
            </button>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={open !== null}
        onOpenChange={(next) => !next && setOpenIndex(null)}
      >
        {open ? (
          <DialogContent className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col overflow-hidden border-white/10 bg-black/95 p-0 text-white sm:max-w-[96vw]">
            <DialogHeader className="shrink-0 border-b border-white/10 px-5 py-3 pr-12 text-left">
              <DialogTitle className="flex flex-wrap items-center gap-3 text-sm text-white">
                <span className="truncate">{open.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 border-white/20 bg-transparent text-white hover:bg-white/10"
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
                  className="h-7 shrink-0 border-white/20 bg-transparent text-white hover:bg-white/10"
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
                  {open.url === featuredUrl ? "Featured" : "Feature this home"}
                </Button>
                <ButtonLink
                  href={open.url}
                  target="_blank"
                  rel="noreferrer"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  <ExternalLink className="size-3.5" />
                  Their listing
                </ButtonLink>
              </DialogTitle>
              <DialogDescription className="text-xs text-white/55">
                {[
                  `${(openIndex ?? 0) + 1} of ${shown.length}`,
                  open.facts || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>
            <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
