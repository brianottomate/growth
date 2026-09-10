"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, LayoutGrid, PenLine, Star, ZoomIn } from "lucide-react";

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
import { useTRPC } from "@/trpc/react";

import { HomeAdPreviews } from "./HomeAdPreviews";

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
};

const panel = "bg-card overflow-hidden rounded-2xl border";

/**
 * The homes on their WanderOS site, each opening a lightbox on the hero photo
 * at full size. The hero lives on their site, not in our library, so the way
 * into the Studio imports it first: one click brings the photo in (or finds
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
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex !== null ? (homes[openIndex] ?? null) : null;
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
        router.push(adPreviewStudioHref({ brandId, brandSlug, sourceAssetId: asset.id }));
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  // The preview grid draws from a library copy of the hero, so the same
  // import as the Studio door runs first; it finds the earlier copy when
  // there is one.
  const [previews, setPreviews] = useState<{ home: StripHome; assetId: string } | null>(null);
  const previewAds = useMutation(
    trpc.media.importUrls.mutationOptions({
      onSuccess: (result, variables) => {
        const asset = result.assets[0];
        const home = homes.find((row) => row.imageUrl === variables.images[0]?.url);
        if (!asset || !home) {
          toast.error("The photo could not be brought into the library");
          return;
        }
        setPreviews({ home, assetId: asset.id });
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
        if (current === null || homes.length === 0) return current;
        return (current + delta + homes.length) % homes.length;
      });
    },
    [homes.length],
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
      <ul className="grid grid-cols-2 gap-2.5 @xl:grid-cols-3 @4xl:grid-cols-6">
        {homes.map((home, index) => (
          <li key={home.id} className={cn(panel, "group")}>
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              className="block w-full text-left"
              aria-label={`Open ${home.name}`}
            >
              <span className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={home.thumbUrl ?? home.imageUrl}
                  alt={home.name}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition-opacity group-hover:opacity-90"
                />
                <span className="absolute inset-0 flex items-center justify-center text-white opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                  <ZoomIn className="size-4" />
                </span>
              </span>
              <span className="block px-2.5 py-2">
                <span className="flex items-center gap-1 text-xs font-semibold">
                  {home.url === featuredUrl ? (
                    <Star className="size-3 shrink-0 fill-amber-300 text-amber-300" aria-label="Featured" />
                  ) : null}
                  <span className="truncate">{home.name}</span>
                </span>
                <span className="text-muted-foreground block truncate text-[11px]">{home.facts}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpenIndex(null)}>
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
                    design.mutate({ brandId, images: [{ url: open.imageUrl, title: open.name }] })
                  }
                >
                  <PenLine className="size-3.5" />
                  {design.isPending ? "Bringing the photo in…" : "Design an ad from this photo"}
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
                        : { id: brandId, listingUrl: open.url, sourceUrl: open.imageUrl },
                    )
                  }
                >
                  <Star
                    className={
                      open.url === featuredUrl ? "size-3.5 fill-amber-300 text-amber-300" : "size-3.5"
                    }
                  />
                  {open.url === featuredUrl ? "Featured" : "Feature this home"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 border-white/20 bg-transparent text-white hover:bg-white/10"
                  loading={previewAds.isPending}
                  onClick={() =>
                    previewAds.mutate({ brandId, images: [{ url: open.imageUrl, title: open.name }] })
                  }
                >
                  <LayoutGrid className="size-3.5" />
                  Preview ads
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
                {[`${(openIndex ?? 0) + 1} of ${homes.length}`, open.facts || null].filter(Boolean).join(" · ")}
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

      <HomeAdPreviews
        open={previews !== null}
        onOpenChange={(next) => !next && setPreviews(null)}
        brandId={brandId}
        brandSlug={brandSlug}
        sourceAssetId={previews?.assetId ?? null}
        home={previews?.home ?? null}
      />
    </>
  );
}
