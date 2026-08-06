"use client";

import { useQuery } from "@tanstack/react-query";
import { Film, Image as ImageIcon } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { SimpleDialog } from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import type { MediaItem } from "@/server/db/schema";

/**
 * Pick an existing asset from the brand's media library and assign it to a spot.
 * The shared-pool counterpart to the per-spot drop-upload: the same `media_asset`
 * library that powers /app/media, surfaced as an assign picker (the swipestats
 * "add from library" pattern). Picked items become a `MediaItem` carrying
 * `assetId`, so the spot references the library asset rather than re-uploading.
 */
export function MediaPickerDialog({
  brandId,
  open,
  onOpenChange,
  onPick,
  existingAssetIds,
}: {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: MediaItem) => void;
  existingAssetIds: string[];
}) {
  const trpc = useTRPC();
  const { data: assets = [], isLoading } = useQuery({
    ...trpc.media.list.queryOptions({ brandId }),
    enabled: open,
  });

  const picked = new Set(existingAssetIds);
  const visible = assets.filter(
    (a) => a.kind === "image" || a.kind === "gif" || a.kind === "video",
  );

  return (
    <SimpleDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add from library"
      size="lg"
      scrollable
    >
      {isLoading ? (
        <p className="text-muted-foreground py-8 text-sm">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="text-muted-foreground py-10 text-center text-sm">
          No media in this brand&apos;s library yet. Upload on the Media page, or drop a
          file directly on the spot.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 py-2 sm:grid-cols-4">
          {visible.map((a) => {
            const isVideo = a.kind === "video";
            // Only an image URL may reach <img>. Video assets have no generated
            // tile yet, and falling back to `a.url` pointed the tag at the raw
            // .mov — a blank square that also pulled the whole file down.
            const thumb = isVideo ? a.thumbnailUrl : (a.thumbnailUrl ?? a.url);
            const already = picked.has(a.id);
            return (
              <button
                key={a.id}
                disabled={already}
                title={a.title ?? undefined}
                onClick={() => {
                  onPick({
                    url: a.url ?? a.thumbnailUrl ?? "",
                    type: a.kind === "video" ? "video" : "image",
                    thumbnail: a.thumbnailUrl ?? a.url ?? undefined,
                    assetId: a.id,
                    width: a.width ?? undefined,
                    height: a.height ?? undefined,
                  });
                  onOpenChange(false);
                }}
                className={cn(
                  "bg-muted group relative aspect-square overflow-hidden rounded-lg border transition-opacity",
                  already
                    ? "opacity-40"
                    : "hover:ring-foreground/30 cursor-pointer hover:ring-2",
                )}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={a.title ?? ""}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-muted-foreground flex size-full items-center justify-center">
                    {isVideo ? (
                      <Film className="size-5" />
                    ) : (
                      <ImageIcon className="size-5" />
                    )}
                  </span>
                )}
                {isVideo && (
                  <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Video
                  </span>
                )}
                {already && (
                  <span className="absolute inset-0 grid place-items-center bg-black/40 text-[10px] font-semibold text-white">
                    Added
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </SimpleDialog>
  );
}
