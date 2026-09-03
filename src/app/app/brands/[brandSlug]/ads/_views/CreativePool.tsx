"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import type { MediaItem } from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";

/**
 * The campaign's shared creative, mirroring the content post's pool: pick
 * from the brand's media library once here, then each ad draws from it instead
 * of re-picking. Same library the studio and compositions publish into.
 */
export function CreativePool({
  campaignId,
  brandId,
  pool,
}: {
  campaignId: string;
  brandId: string;
  pool: MediaItem[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

  const setPool = useMutation(
    trpc.ads.setCampaignCreativePool.mutationOptions({
      onSettled: () => router.refresh(),
    }),
  );

  const add = (item: MediaItem) => {
    if (pool.some((existing) => existing.url === item.url)) return;
    setPool.mutate({ campaignId, media: [...pool, item] });
  };
  const remove = (url: string) =>
    setPool.mutate({
      campaignId,
      media: pool.filter((item) => item.url !== url),
    });

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold">
            Creative pool{" "}
            <span className="text-muted-foreground text-sm font-normal">
              {pool.length}
            </span>
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Shared across this campaign&apos;s ads. Pick once here rather than
            per ad. Drop new files straight into{" "}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="underline"
            >
              the picker
            </button>
            , browse the{" "}
            <Link href="/app/media" className="underline">
              media library
            </Link>
            , or make something in{" "}
            <Link href="/app/studio" className="underline">
              the studio
            </Link>
            .
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
          <ImagePlus className="size-3.5" />
          Add creative
        </Button>
      </div>

      {pool.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing yet.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {pool.map((item) => (
            <div
              key={item.url}
              className="bg-card group relative w-32 shrink-0 overflow-hidden rounded-lg border"
            >
              <div className="bg-muted relative h-20">
                {/* A video's `thumbnail` can be the clip itself when no poster
                was ever cut, and an <img> pointed at an .mp4 is a blank tile
                that still downloads the whole file. Let <video> paint its own
                first frame instead. */}
                {item.type === "video" ? (
                  <video
                    src={item.url}
                    poster={
                      item.thumbnail && item.thumbnail !== item.url
                        ? item.thumbnail
                        : undefined
                    }
                    className="h-full w-full bg-black object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnail ?? item.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                {item.type === "video" && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Video
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(item.url)}
                className="absolute top-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
              >
                Remove
              </button>
            </div>
          ))}
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
