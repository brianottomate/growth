"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Expand, Film, Image as ImageIcon } from "lucide-react";

import { useTRPC, type RouterOutputs } from "@/trpc/react";
import { MediaLightbox } from "@/app/app/media/MediaLightbox";
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

  // Picking is destructive-ish (it attaches to a spot), and a 100px tile is not
  // enough to tell two property shots apart, let alone judge a clip. Preview
  // reuses the library's own lightbox rather than growing a second one.
  const [preview, setPreview] = useState<
    RouterOutputs["media"]["list"][number] | null
  >(null);

  const picked = new Set(existingAssetIds);
  const visible = assets.filter(
    (a) => a.kind === "image" || a.kind === "gif" || a.kind === "video",
  );

  return (
    <>
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
            No media in this brand&apos;s library yet. Upload on the Media page,
            or drop a file directly on the spot.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-2 gap-y-3 py-2 sm:grid-cols-4">
            {visible.map((a) => {
              const isVideo = a.kind === "video";
              // Only an image URL may reach <img>. Video assets have no generated
              // tile yet, and falling back to `a.url` pointed the tag at the raw
              // .mov — a blank square that also pulled the whole file down.
              const thumb = isVideo
                ? a.thumbnailUrl
                : (a.thumbnailUrl ?? a.url);
              const already = picked.has(a.id);
              const name = a.title ?? a.filename ?? "Untitled";
              return (
                <div key={a.id} className="space-y-1">
                  <button
                    disabled={already}
                    title={name}
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
                      "bg-muted group relative block aspect-square w-full overflow-hidden rounded-lg border transition-opacity",
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
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Preview ${name}`}
                      title="Preview"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreview(a);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        setPreview(a);
                      }}
                      className="absolute top-1 right-1 grid size-6 place-items-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                    >
                      <Expand className="size-3" />
                    </span>
                    {already && (
                      <span className="absolute inset-0 grid place-items-center bg-black/40 text-[10px] font-semibold text-white">
                        Added
                      </span>
                    )}
                  </button>
                  {/* A grid of near-identical property shots is unnavigable without
                  names, and a video with no poster is otherwise anonymous. */}
                  <p
                    className="text-muted-foreground truncate text-[11px]"
                    title={name}
                  >
                    {name}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </SimpleDialog>
      {preview && (
        <MediaLightbox
          asset={preview}
          open
          onOpenChange={(next) => !next && setPreview(null)}
        />
      )}
    </>
  );
}
