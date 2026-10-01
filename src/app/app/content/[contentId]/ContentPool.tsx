"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { HardDrive, Images, Sparkles, X } from "lucide-react";

import { orpc } from "@/orpc/client";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { MediaAssetView } from "@/components/media-asset-view";
import { cn } from "@/components/ui/lib/utils";
import type { MediaItem } from "@/server/db/schema";
import { MediaPickerDialog } from "./MediaPickerDialog";
import { ImageBatchImporter } from "./ImageBatchImporter";
import { GoogleDriveImportDialog } from "@/app/app/media/GoogleDriveImportDialog";
import { sendAssistantIntent } from "@/lib/assistant-events";

type Spot = { id: string; platform: string; media: MediaItem[] };

/** Identity for dedupe / membership: the library asset if present, else the URL. */
const keyOf = (m: MediaItem) => m.assetId ?? m.url;

/**
 * The piece's media pool. The VIEW is the union of idea-level media
 * (content_post.media) + everything attached to any spot — so anything on a
 * spot shows here automatically. Upload/pick adds to the idea-level pool; each
 * tile's platform toggles add/remove the asset on that spot (assign down from a
 * smaller, already-curated set instead of hunting the whole library per spot).
 */
export function ContentPool({
  contentPostId,
  brandId,
  brandName,
  contentTitle,
  directMedia,
  spots,
}: {
  contentPostId: string;
  brandId: string;
  brandName: string;
  contentTitle: string;
  directMedia: MediaItem[];
  spots: Spot[];
}) {
  const router = useRouter();
  const refresh = { onSettled: () => router.refresh() };
  const setPoolMedia = useMutation(
    orpc.content.setPoolMedia.mutationOptions(refresh),
  );
  const setSpotMedia = useMutation(
    orpc.content.setMedia.mutationOptions(refresh),
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  // Pool VIEW = idea-level media ∪ everything on a spot, deduped.
  const poolMap = new Map<string, MediaItem>();
  for (const m of directMedia) poolMap.set(keyOf(m), m);
  for (const s of spots)
    for (const m of s.media)
      if (!poolMap.has(keyOf(m))) poolMap.set(keyOf(m), m);
  const pool = [...poolMap.values()];
  const directKeys = new Set(directMedia.map(keyOf));

  const addToPool = async (items: MediaItem[]) => {
    if (!items.length) return;
    const next = [...directMedia];
    for (const it of items)
      if (!next.some((m) => keyOf(m) === keyOf(it))) next.push(it);
    await setPoolMedia.mutateAsync({ contentPostId, media: next });
  };
  const removeFromPool = (m: MediaItem) =>
    setPoolMedia.mutate({
      contentPostId,
      media: directMedia.filter((x) => keyOf(x) !== keyOf(m)),
    });
  const toggleOnSpot = (spot: Spot, m: MediaItem, on: boolean) => {
    const next = on
      ? spot.media.filter((x) => keyOf(x) !== keyOf(m))
      : [...spot.media, m];
    setSpotMedia.mutate({ platformPostId: spot.id, media: next });
  };

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Media pool · {pool.length}
      </h2>
      <div className="flex flex-wrap gap-3">
        {pool.map((m) => {
          const onPool = directKeys.has(keyOf(m));
          return (
            <div
              key={keyOf(m)}
              className="w-28 rounded-lg border bg-card p-1.5"
            >
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                <MediaAssetView item={m} label={`${contentTitle} media`} />
                {onPool && (
                  <button
                    onClick={() => removeFromPool(m)}
                    className="absolute top-1 right-1 rounded bg-black/60 p-0.5 text-white"
                    aria-label="Remove from pool"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
              {/* Assign down: toggle which spots this asset is on. */}
              {spots.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {spots.map((s) => {
                    const on = s.media.some((x) => keyOf(x) === keyOf(m));
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleOnSpot(s, m, on)}
                        title={`${on ? "Remove from" : "Add to"} ${platformLabel(s.platform)}`}
                        className={cn(
                          "rounded p-0.5 transition-opacity",
                          on
                            ? "opacity-100 ring-1 ring-foreground/40"
                            : "opacity-40 hover:opacity-100",
                        )}
                      >
                        <ChannelLogo
                          platform={s.platform}
                          className="size-3.5"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-stretch gap-2">
        <ImageBatchImporter
          brandId={brandId}
          existingCount={directMedia.length}
          onImported={addToPool}
        />
        <button
          onClick={() => setDriveOpen(true)}
          className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <HardDrive className="size-5" />
          Drive
        </button>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <Images className="size-5" />
          Library
        </button>
        <button
          onClick={() =>
            sendAssistantIntent({
              type: "work_content_post",
              brandId,
              brandName,
              contentPostId,
              contentTitle,
              visibleText: `Suggest media for “${contentTitle}” from the library, our archives, or a strong AI image prompt`,
            })
          }
          className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <Sparkles className="size-5" />
          Suggest media
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Anything attached to a spot also shows here. Toggle a platform icon to
        add or remove it on that spot, or ask chat to turn an ordered batch into
        a carousel. New uploads are saved to your media library.
      </p>

      <GoogleDriveImportDialog
        brandId={brandId}
        open={driveOpen}
        onOpenChange={setDriveOpen}
        onImported={(assets) =>
          addToPool(
            assets.map((asset) => ({
              url: asset.url!,
              type: "image" as const,
              assetId: asset.id,
              ...(asset.width ? { width: asset.width } : {}),
              ...(asset.height ? { height: asset.height } : {}),
              ...(asset.thumbnailUrl ? { thumbnail: asset.thumbnailUrl } : {}),
            })),
          )
        }
      />

      <MediaPickerDialog
        brandId={brandId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        existingAssetIds={pool
          .map((m) => m.assetId)
          .filter((id): id is string => !!id)}
        onPick={(item) => void addToPool([item])}
      />
    </section>
  );
}
