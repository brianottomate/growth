"use client";

import Image from "next/image";
import { ExternalLink, PenLine } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RouterOutputs } from "@/orpc/client";

type LibraryAsset = RouterOutputs["media"]["list"][number];

export function MediaLightbox({
  asset,
  open,
  onOpenChange,
}: {
  asset: LibraryAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const title = asset.title ?? asset.filename ?? "Media preview";
  const imageUrl =
    asset.kind === "image"
      ? asset.provider === "r2"
        ? asset.url
        : asset.thumbnailUrl
      : null;
  const videoUrl =
    asset.kind === "video" && asset.provider === "r2" ? asset.url : null;
  const externalUrl = asset.externalUrl ?? asset.url;
  // A card the Studio froze carries its whole spec; it can be picked back up.
  const isComposition = Boolean(
    (asset.metadata as { composition?: unknown } | null)?.composition,
  );
  const studioHref = isComposition
    ? `/app/compositions?brandId=${encodeURIComponent(asset.brandId)}&asset=${encodeURIComponent(asset.id)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        tone="media"
        className="flex h-[90vh] w-[94vw] max-w-[94vw] flex-col overflow-hidden p-0 sm:max-w-[94vw]"
      >
        <DialogHeader
          divider="media"
          className="shrink-0 px-5 py-3 pr-12 text-left"
        >
          <DialogTitle tone="media" className="flex items-center gap-3 text-sm">
            <span className="truncate">{title}</span>
            {studioHref ? (
              <ButtonLink
                href={studioHref}
                size="sm"
                variant="outline"
                tone="media-outline"
                className="h-7"
              >
                <PenLine className="size-3.5" /> Open in Studio
              </ButtonLink>
            ) : null}
          </DialogTitle>
          <DialogDescription tone="media" className="text-xs">
            {[
              asset.folder?.name,
              `${asset.width ?? "?"}×${asset.height ?? "?"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
          {imageUrl && asset.provider === "r2" ? (
            <Image
              src={imageUrl}
              alt={asset.alt ?? title}
              fill
              sizes="94vw"
              className="object-contain p-4"
            />
          ) : imageUrl ? (
            // External thumbnails may come from hosts that are intentionally
            // not part of the Next Image allowlist.
            // oxlint-disable-next-line nextjs/no-img-element
            <img
              src={imageUrl}
              alt={asset.alt ?? title}
              className="max-h-full max-w-full object-contain"
            />
          ) : videoUrl ? (
            <video
              src={videoUrl}
              controls
              // The full file streams only when playback starts; opening the
              // lightbox alone fetches headers, not a 9MB clip.
              preload="metadata"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-white/65">
                This linked asset cannot be previewed directly.
              </p>
              {externalUrl && (
                <ButtonLink href={externalUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> Open source
                </ButtonLink>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
