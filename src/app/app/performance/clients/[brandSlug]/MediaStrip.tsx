"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, PenLine, ZoomIn } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { adPreviewStudioHref, reopenCardHref } from "@/lib/ad-preview-links";

/** The fields a tile and its lightbox need; the page reads them off the library rows. */
export type StripImage = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  title: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  /** A card the Studio rendered, as opposed to a photo of a home. */
  isCard: boolean;
};

/**
 * The brand page's media strip: the same tiles, each opening a lightbox with
 * the full-size image. Arrows and the keyboard step through the strip so a
 * set of homes can be looked at without closing and reopening, and the
 * lightbox is a way into the Studio: a photo becomes the source of a new ad
 * preview, a card reopens as itself. The full media library keeps its own,
 * richer lightbox; this one looks and hands off.
 */
export function MediaStrip({
  images,
  brandId,
  brandSlug,
}: {
  images: StripImage[];
  brandId: string;
  brandSlug: string | null;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex !== null ? (images[openIndex] ?? null) : null;

  const step = useCallback(
    (delta: number) => {
      setOpenIndex((current) => {
        if (current === null || images.length === 0) return current;
        return (current + delta + images.length) % images.length;
      });
    },
    [images.length],
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
      <ul className="grid grid-cols-3 gap-2 @xl:grid-cols-6 @4xl:grid-cols-9">
        {images.map((image, index) => (
          <li
            key={image.id}
            className="aspect-square overflow-hidden rounded-xl border bg-muted"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              className="group relative block size-full text-left"
              title={image.title ?? undefined}
              aria-label={image.title ? `Open ${image.title}` : "Open image"}
            >
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              <img
                src={image.thumbnailUrl ?? image.url}
                alt={image.alt ?? image.title ?? ""}
                loading="lazy"
                className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                <ZoomIn className="size-4" />
              </span>
              {image.isCard ? (
                <span className="absolute top-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9.5px] font-medium tracking-wide text-white/90 uppercase">
                  card
                </span>
              ) : null}
            </button>
          </li>
        ))}
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
                className="flex items-center gap-3 text-sm"
              >
                <span className="truncate">{open.title ?? "Image"}</span>
                <ButtonLink
                  href={
                    open.isCard
                      ? reopenCardHref({ brandId, brandSlug, assetId: open.id })
                      : adPreviewStudioHref({
                          brandId,
                          brandSlug,
                          sourceAssetId: open.id,
                        })
                  }
                  size="sm"
                  variant="outline"
                  tone="media-outline"
                  className="h-7 shrink-0"
                >
                  <PenLine className="size-3.5" />
                  {open.isCard
                    ? "Open in Studio"
                    : "Design an ad from this photo"}
                </ButtonLink>
              </DialogTitle>
              <DialogDescription tone="media" className="text-xs">
                {[
                  `${(openIndex ?? 0) + 1} of ${images.length}`,
                  open.isCard ? "Rendered card" : "Photo",
                  open.width && open.height
                    ? `${open.width}×${open.height}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>
            <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
              {/* The full-size file, not the tile: this is the surface for looking closely. */}
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              <img
                key={open.id}
                src={open.url}
                alt={open.alt ?? open.title ?? ""}
                className="max-h-full max-w-full object-contain"
              />
              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Previous image"
                    className={cn(
                      "absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full",
                      "bg-white/10 text-white transition hover:bg-white/20",
                    )}
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Next image"
                    className={cn(
                      "absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full",
                      "bg-white/10 text-white transition hover:bg-white/20",
                    )}
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
