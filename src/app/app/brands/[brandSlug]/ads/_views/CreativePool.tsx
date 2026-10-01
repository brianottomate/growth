"use client";
import { MediaAssetView } from "@/components/media-asset-view";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImagePlus, Images } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListingSamplesDialog } from "@/app/app/compositions/ListingSamplesDialog";
import { SiteImagesDialog } from "@/app/app/compositions/SiteImagesDialog";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import type { MediaItem } from "@/server/db/schema";
import { orpc } from "@/orpc/client";

/** Seconds as m:ss, the way a clip's length is normally written. */
function clipLength(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

/**
 * A readable name for a pool item that has no library row behind it.
 *
 * Chat uploads land as `video-att_<id>-<the-name-they-had>.mp4`, so the id
 * prefix is stripped: five tiles reading "video-att_BDjm…" are five tiles a
 * person cannot tell apart.
 */
function nameFromUrl(url: string): string {
  try {
    const file = new URL(url).pathname.split("/").pop() ?? "";
    const decoded = decodeURIComponent(file).replace(/\.[a-z0-9]+$/i, "");
    return (
      decoded.replace(/^(?:video|image)-att_[A-Za-z0-9]+-/, "") || "Untitled"
    );
  } catch {
    return "Untitled";
  }
}

/**
 * The campaign's photos, mirroring the content post's pool: pick from the
 * brand's media library once here, then each ad draws from it instead of
 * re-picking. Same library the Studio and the homes run publish into.
 */
export function CreativePool({
  campaignId,
  brandId,
  pool,
  askAssistant,
}: {
  campaignId: string;
  brandId: string;
  pool: MediaItem[];
  /** The step's "Ask the assistant" button, rendered by the page. */
  askAssistant?: React.ReactNode;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

  // The pool stores MediaItem JSON — url, type, thumbnail — and nothing a
  // person can read. Everything worth showing on a tile (name, length, tags,
  // whether it has been analyzed) lives on the library row, so resolve the
  // ids the pool carries. Items with no `assetId` are raw uploads that were
  // never promoted; they get what the URL can tell us and a marker saying so.
  const assetIds = useMemo(
    () =>
      [
        ...new Set(pool.map((item) => item.assetId).filter(Boolean)),
      ] as string[],
    [pool],
  );
  const assets = useQuery({
    ...orpc.media.byIds.queryOptions({ input: { brandId, ids: assetIds } }),
    enabled: assetIds.length > 0,
  });
  const assetById = useMemo(
    () => new Map((assets.data ?? []).map((asset) => [asset.id, asset])),
    [assets.data],
  );

  const setPool = useMutation(
    orpc.ads.setCampaignCreativePool.mutationOptions({
      onSettled: () => router.refresh(),
    }),
  );

  // The library resolves each url again on save and its own kind wins, so
  // only the url, the asset and a type hint travel.
  const save = (items: MediaItem[]) =>
    setPool.mutate({
      campaignId,
      media: items.map((item) => ({
        url: item.url,
        assetId: item.assetId || undefined,
        type: item.type === "carousel" ? undefined : item.type,
      })),
    });

  const add = (item: MediaItem) => {
    if (pool.some((existing) => existing.url === item.url)) return;
    save([...pool, item]);
  };
  const remove = (url: string) => save(pool.filter((item) => item.url !== url));

  const addImported = (assets: { id: string; url: string | null }[]) => {
    const fresh = assets
      .filter(
        (asset) => asset.url && !pool.some((item) => item.assetId === asset.id),
      )
      .map((asset) => ({
        url: asset.url!,
        type: "image" as const,
        assetId: asset.id,
      }));
    if (fresh.length === 0) return;
    save([...pool, ...fresh]);
  };

  return (
    <section className="space-y-3">
      {pool.length > 0 ? (
        <div className="flex items-center justify-end gap-2">
          <ListingSamplesDialog brandId={brandId} onImported={addImported} />
          <SiteImagesDialog brandId={brandId} onImported={addImported} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
          >
            <ImagePlus className="size-3.5" />
            From the library
          </Button>
        </div>
      ) : null}

      {pool.length === 0 ? (
        <EmptyState
          compact
          icon={Images}
          title="No photos yet"
          description="From their listings, the library, or the Studio."
          actions={
            <>
              <ListingSamplesDialog
                brandId={brandId}
                onImported={addImported}
              />
              <SiteImagesDialog brandId={brandId} onImported={addImported} />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPickerOpen(true)}
              >
                <ImagePlus className="size-3.5" />
                From the library
              </Button>
              <ButtonLink
                size="sm"
                variant="ghost"
                href={`/app/compositions?brandId=${encodeURIComponent(brandId)}`}
              >
                Open the Studio
              </ButtonLink>
              {askAssistant}
            </>
          }
        />
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {pool.map((item) => {
            const asset = item.assetId ? assetById.get(item.assetId) : null;
            const name =
              asset?.title ?? asset?.filename ?? nameFromUrl(item.url);
            const length = clipLength(asset?.duration);
            const width = asset?.width ?? item.width;
            const height = asset?.height ?? item.height;
            const facts = [
              length,
              width && height ? `${width}\u00d7${height}` : null,
            ].filter((value): value is string => Boolean(value));
            return (
              <div
                key={item.url}
                className="group relative w-40 shrink-0 overflow-hidden rounded-lg border bg-card"
                title={asset?.alt ?? name}
              >
                <div className="relative h-24 bg-muted">
                  <MediaAssetView item={item} label="Campaign creative" />
                </div>

                <div className="space-y-1 p-2">
                  <p className="truncate text-xs font-medium" title={name}>
                    {name}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
                    {facts.length > 0 ? <span>{facts.join(" · ")}</span> : null}
                    {/* Not in the library means no tags, no analysis, and
                      nothing reusable on another campaign — worth saying on
                      the tile rather than only in a chat transcript. */}
                    {!item.assetId && (
                      <span className="text-amber-600 dark:text-amber-500">
                        Not in library
                      </span>
                    )}
                    {asset?.analyzed && <span>Analyzed</span>}
                  </div>
                  {asset && asset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {asset.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-muted px-1 py-0.5 text-[10px]"
                        >
                          {tag}
                        </span>
                      ))}
                      {asset.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{asset.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(item.url)}
                  className="absolute top-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 backdrop-blur-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      <MediaPickerDialog
        brandId={brandId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        existingAssetIds={pool
          .map((item) => item.assetId)
          .filter((id): id is string => Boolean(id))}
        onPick={(item) => {
          add(item);
          setPickerOpen(false);
        }}
      />
    </section>
  );
}
