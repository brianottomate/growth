"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Expand, Film, Image as ImageIcon } from "lucide-react";

import { useTRPC, type RouterOutputs } from "@/trpc/react";
import { MediaLightbox } from "@/app/app/media/MediaLightbox";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import { SimpleDialog } from "@/components/ui/dialog";
import { Dropzone, MEDIA_ACCEPT } from "@/components/ui/dropzone";
import { cn } from "@/components/ui/lib/utils";
import type { MediaItem } from "@/server/db/schema";

/**
 * Pick an existing asset from the brand's media library and assign it to a spot.
 * The shared-pool counterpart to the per-spot drop-upload: the same `media_asset`
 * library that powers /app/media, surfaced as an assign picker (the swipestats
 * "add from library" pattern). Picked items become a `MediaItem` carrying
 * `assetId`, so the spot references the library asset rather than re-uploading.
 *
 * It also uploads. Sending an operator to /app/media and back is a poor trade
 * when the file is already on their desktop and they are standing in the picker
 * — and this dialog is the only creative entry point on the campaign page.
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
  const queryClient = useQueryClient();
  const listOptions = trpc.media.list.queryOptions({ brandId });
  const { data: assets = [], isLoading } = useQuery({
    ...listOptions,
    enabled: open,
  });
  const { uploadFiles, uploading } = useMediaUpload(brandId);

  // Uploads land in the pool right away rather than making the operator find
  // them again in the grid; refreshing the list keeps the two in step.
  const handleFiles = async (files: File[]) => {
    const uploaded = await uploadFiles(files);
    await queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
    for (const item of uploaded) onPick(item);
  };

  // Picking is destructive-ish (it attaches to a spot), and a 100px tile is not
  // enough to tell two property shots apart, let alone judge a clip. Preview
  // reuses the library's own lightbox rather than growing a second one.
  const [preview, setPreview] = useState<
    RouterOutputs["media"]["list"][number] | null
  >(null);

  // Client-side, over the set already loaded: the library is small enough per
  // brand that a round trip per keystroke buys nothing. Matches the fields
  // `listMedia` searches server-side (title, filename, alt, tag names) so the
  // two never disagree, and every space-separated term has to hit.
  const [query, setQuery] = useState("");
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const picked = new Set(existingAssetIds);
  const pickable = assets.filter(
    (a) => a.kind === "image" || a.kind === "gif" || a.kind === "video",
  );
  const visible = pickable.filter((a) => {
    if (terms.length === 0) return true;
    const haystack = [
      a.title,
      a.filename,
      a.alt,
      a.kind,
      a.folder?.name,
      ...a.tagAssignments.map((assignment) => assignment.tag.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });

  return (
    <>
      <SimpleDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Add from library"
        size="lg"
        scrollable
      >
        <div className="space-y-2 pb-1">
          <Dropzone
            compact
            accept={MEDIA_ACCEPT}
            onFiles={handleFiles}
            uploading={uploading}
            title="Drop images or video here"
            hint="or click to browse · added to this brand's library"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/app/media"
              target="_blank"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline"
            >
              Open the full media library
              <ExternalLink className="size-3" />
            </Link>
            {pickable.length > 0 && (
              <div className="flex items-center gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by name or tag…"
                  className="border-border bg-background focus:border-foreground/40 w-52 rounded-md border px-2 py-1 text-xs outline-none"
                />
                <span className="text-muted-foreground text-xs tabular-nums">
                  {terms.length > 0
                    ? `${visible.length}/${pickable.length}`
                    : pickable.length}
                </span>
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground py-8 text-sm">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            {terms.length > 0
              ? `Nothing matches “${query.trim()}”.`
              : "Nothing in this brand's library yet."}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-2 gap-y-3 py-2 sm:grid-cols-4">
            {visible.map((a) => {
              const isVideo = a.kind === "video";
              // Only an image URL may reach <img>. Uploads cut a poster frame,
              // but anything older has none, and falling back to `a.url` pointed
              // the tag at the raw .mov — a blank square that also pulled the
              // whole file down.
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
                        type: isVideo ? "video" : "image",
                        // Never fall back to the asset's own url for video: a
                        // clip standing in as its own still reads as "has a
                        // thumbnail" downstream, and Meta rejects the push.
                        thumbnail:
                          (isVideo ? a.thumbnailUrl : a.thumbnailUrl ?? a.url) ??
                          undefined,
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
