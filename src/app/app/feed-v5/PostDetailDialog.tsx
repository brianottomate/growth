"use client";

/* eslint-disable @next/next/no-img-element -- social CDN URLs are dynamic and not in Next remote patterns */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import {
  Check,
  CloudDownload,
  Grid2X2,
  Images,
  Library,
  RefreshCw,
  ScanSearch,
  Square,
  SquareCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import { useTRPC } from "@/trpc/react";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import type { V5Brand, V5Entry, V5Media } from "./V5Client";
import {
  VIDEO_DETAIL_VIEWS,
  VideoAnalysisWorkspace,
} from "./VideoAnalysisWorkspace";

function MediaView({ item }: { item: V5Media }) {
  if (item.type === "video") {
    return (
      <video
        src={item.url}
        poster={item.thumbnail ?? undefined}
        controls
        playsInline
        className="max-h-[62vh] w-full rounded-lg bg-black object-contain"
      />
    );
  }
  return (
    <img
      // Instagram/CDN originals can expire. The ingest mirror keeps a durable
      // Blob poster in thumbnail, which is the best available display fallback
      // without automatically turning every timeline item into a library asset.
      src={item.thumbnail ?? item.url}
      alt=""
      className="max-h-[62vh] w-full rounded-lg bg-black object-contain"
    />
  );
}

export function PostDetailDialog({
  entry,
  ownedBrands,
  onOpenChange,
}: {
  entry: V5Entry | null;
  ownedBrands: V5Brand[];
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [mediaView, setMediaView] = useState<"carousel" | "grid">("grid");
  const [videoParams, setVideoParams] = useQueryStates(
    {
      media: parseAsInteger,
      view: parseAsStringLiteral(VIDEO_DETAIL_VIEWS),
      action: parseAsString,
    },
    { history: "push" },
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const defaultBrand = useMemo(
    () =>
      (entry?.role === "owned"
        ? ownedBrands.find((brand) => brand.id === entry.brandId)
        : null) ?? ownedBrands[0],
    [entry, ownedBrands],
  );
  const [destinationBrandId, setDestinationBrandId] = useState("");

  useEffect(() => {
    setSelected(new Set(entry?.media.map((_, index) => index) ?? []));
    setDestinationBrandId(defaultBrand?.id ?? "");
    setMediaView("grid");
  }, [entry, defaultBrand?.id]);

  const capture = useMutation(
    trpc.media.captureFromPost.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `${result.captured} media item${result.captured === 1 ? "" : "s"} saved to the library`,
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const stabilize = useMutation(
    trpc.media.stabilizePostMedia.mutationOptions({
      onSuccess: (result) => {
        router.refresh();
        if (result.stabilized) {
          toast.success(
            `${result.stabilized} preview${result.stabilized === 1 ? "" : "s"} kept in Blob`,
          );
        } else if (result.failed) {
          toast.error(
            "Those source images have already expired and could not be preserved",
          );
        } else {
          toast.success("All available previews are already kept");
        }
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const refreshInstagram = useMutation(
    trpc.media.refreshInstagramPost.mutationOptions({
      onSuccess: (result) => {
        router.refresh();
        toast.success(
          `Instagram refreshed · ${result.updatedExisting} post${result.updatedExisting === 1 ? "" : "s"} updated${
            result.videoCached
              ? ` · ${result.videoCached} video cached for playback`
              : ""
          }`,
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (!entry) return null;
  const media = entry.media;
  const requestedVideoIndex = videoParams.media ?? 0;
  const requestedVideo = media[requestedVideoIndex];
  const videoWorkspaceOpen =
    Boolean(videoParams.view) && requestedVideo?.type === "video";
  const firstVideoIndex = media.findIndex((item) => item.type === "video");
  const allSelected = media.length > 0 && selected.size === media.length;
  const toggle = (index: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <Dialog
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) {
          void setVideoParams({ media: null, view: null, action: null });
        }
        onOpenChange(open);
      }}
    >
      <DialogContent size="2xl" className="max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-12">
            <ChannelLogo platform={entry.platform} className="size-5" />
            {entry.brandName} · {platformLabel(entry.platform)}
            <span className="text-muted-foreground text-sm font-normal">
              {new Date(entry.at).toLocaleDateString()}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Inspect this timeline post, its media, and any permanent creative
            analysis.
          </DialogDescription>
        </DialogHeader>

        {videoWorkspaceOpen && videoParams.view ? (
          <VideoAnalysisWorkspace
            entry={entry}
            mediaIndex={requestedVideoIndex}
            view={videoParams.view}
            action={videoParams.action}
            onViewChange={(view) => void setVideoParams({ view })}
            onActionConsumed={() => void setVideoParams({ action: null })}
          />
        ) : media.length > 0 ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-sm">
                  {media.length} media item{media.length === 1 ? "" : "s"}
                </span>
                <div className="flex rounded-md border p-0.5">
                  <Button
                    variant={mediaView === "carousel" ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setMediaView("carousel")}
                  >
                    <Images className="size-3.5" /> Carousel
                  </Button>
                  <Button
                    variant={mediaView === "grid" ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setMediaView("grid")}
                  >
                    <Grid2X2 className="size-3.5" /> Grid
                  </Button>
                </div>
              </div>

              {mediaView === "carousel" ? (
                <Carousel opts={{ loop: media.length > 1 }} className="mx-10">
                  <CarouselContent>
                    {media.map((item, index) => (
                      <CarouselItem key={`${item.url}-${index}`}>
                        <div className="relative">
                          <MediaView item={item} />
                          <button
                            onClick={() => toggle(index)}
                            className={cn(
                              "absolute top-3 left-3 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur",
                              selected.has(index)
                                ? "border-emerald-400/70 bg-emerald-600/85 text-white"
                                : "border-white/30 bg-black/60 text-white",
                            )}
                          >
                            {selected.has(index) ? (
                              <SquareCheck className="size-3.5" />
                            ) : (
                              <Square className="size-3.5" />
                            )}
                            Media {index + 1}
                          </button>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious />
                  <CarouselNext />
                </Carousel>
              ) : (
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                  {media.map((item, index) => (
                    <button
                      key={`${item.url}-${index}`}
                      onClick={() => toggle(index)}
                      className={cn(
                        "relative overflow-hidden rounded-lg border-2 bg-black text-left",
                        selected.has(index)
                          ? "border-emerald-500"
                          : "border-transparent opacity-75 hover:opacity-100",
                      )}
                    >
                      {item.type === "video" ? (
                        <video
                          src={item.url}
                          poster={item.thumbnail ?? undefined}
                          muted
                          playsInline
                          className="aspect-square size-full object-cover"
                        />
                      ) : (
                        <img
                          src={item.thumbnail ?? item.url}
                          alt=""
                          className="aspect-square size-full object-cover"
                        />
                      )}
                      <span className="absolute top-2 left-2 rounded-full bg-black/65 p-1 text-white">
                        {selected.has(index) ? (
                          <SquareCheck className="size-4" />
                        ) : (
                          <Square className="size-4" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <aside className="flex flex-col gap-4 rounded-xl border p-4">
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">
                  Caption
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  {entry.text || "No caption"}
                </p>
              </div>
              <div className="mt-auto space-y-3 border-t pt-4">
                {firstVideoIndex >= 0 && (
                  <Button
                    className="w-full gap-2"
                    onClick={() =>
                      void setVideoParams({
                        media: firstVideoIndex,
                        view: "video",
                        action: "analyze",
                      })
                    }
                  >
                    <ScanSearch className="size-4" />
                    Analyze reel
                  </Button>
                )}
                {entry.platform === "instagram" && entry.externalUrl && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    loading={refreshInstagram.isPending}
                    onClick={() =>
                      refreshInstagram.mutate({ platformPostId: entry.id })
                    }
                  >
                    <RefreshCw className="size-4" />
                    Refresh & cache Instagram media
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  loading={stabilize.isPending}
                  onClick={() => stabilize.mutate({ platformPostId: entry.id })}
                >
                  <CloudDownload className="size-4" />
                  Keep previews
                </Button>
                <p className="text-muted-foreground -mt-1 text-[11px] leading-relaxed">
                  Saves durable display copies to Blob when the social URL is
                  still live. It does not add anything to your library.
                </p>
                <button
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
                  onClick={() =>
                    setSelected(
                      allSelected
                        ? new Set()
                        : new Set(media.map((_, index) => index)),
                    )
                  }
                >
                  <Check className="size-3.5" />
                  {allSelected ? "Clear selection" : "Select all media"}
                </button>
                {ownedBrands.length > 1 && (
                  <Select
                    value={destinationBrandId}
                    onValueChange={setDestinationBrandId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Destination library" />
                    </SelectTrigger>
                    <SelectContent>
                      {ownedBrands.map((brand) => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  className="w-full gap-2"
                  disabled={!selected.size || !destinationBrandId}
                  loading={capture.isPending}
                  onClick={() =>
                    capture.mutate({
                      platformPostId: entry.id,
                      destinationBrandId,
                      mediaIndexes: [...selected].sort((a, b) => a - b),
                    })
                  }
                >
                  <Library className="size-4" />
                  Save {selected.size || ""} to library
                </Button>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Selected originals are downloaded and stored in your Blob
                  library with a link back to this post.
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="rounded-xl border p-6">
            <p className="text-sm whitespace-pre-wrap">
              {entry.text || "This post has no media."}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
