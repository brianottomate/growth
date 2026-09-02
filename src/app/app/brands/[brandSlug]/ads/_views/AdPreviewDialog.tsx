"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Globe, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { useTRPC } from "@/trpc/react";

type Media = { url: string; thumbnail?: string; type?: string };

export type PreviewAd = {
  id: string;
  name: string;
  headline: string | null;
  body: string | null;
  linkUrl: string | null;
  callToAction: string | null;
  media: Media[];
};

/**
 * Placements a drafted creative can land in, with the crop each one applies.
 * Local previews render all three; Meta's own preview API renders the feed
 * shapes only from a pre-push draft, because story formats need the image
 * uploaded to the ad account first.
 */
const SURFACES = [
  { id: "facebook", label: "Facebook feed", crop: "aspect-[1.91/1]" },
  { id: "instagram", label: "Instagram feed", crop: "aspect-square" },
  { id: "story", label: "Story / Reel", crop: "aspect-[9/16]" },
] as const;

type SurfaceId = (typeof SURFACES)[number]["id"];

const ctaLabel = (cta: string | null) =>
  cta
    ? cta
        .toLowerCase()
        .split("_")
        .map((word) => word[0]?.toUpperCase() + word.slice(1))
        .join(" ")
    : "Learn more";

const domainOf = (url: string | null) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toUpperCase();
  } catch {
    return "";
  }
};

/**
 * How a drafted ad will look, rendered locally.
 *
 * The same idea as the content post's platform previews: composed from the
 * draft we hold, so it is instant, works before any platform connection, and
 * covers the story crop Meta cannot render pre-push. Meta's own render stays
 * one click away for the feed shapes, since only it is authoritative.
 */
export function AdPreviewDialog({
  ad,
  brandName,
  brandLogo,
  brandSlug,
  landingUrl,
  open,
  onOpenChange,
}: {
  ad: PreviewAd;
  brandName: string;
  brandLogo: string | null;
  brandSlug: string;
  landingUrl: string | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const trpc = useTRPC();
  const [surface, setSurface] = useState<SurfaceId>("facebook");
  const [card, setCard] = useState(0);
  const [showMeta, setShowMeta] = useState(false);

  const destinations = useQuery(
    trpc.ads.destinations.queryOptions(
      { brandSlug, platform: "meta" },
      { enabled: open && showMeta },
    ),
  );
  const destination = destinations.data?.destinations[0];
  const metaPreview = useMutation(trpc.ads.previewAd.mutationOptions());

  const isVideo = ad.media[0]?.type === "video";
  const isCarousel = !isVideo && ad.media.length > 1;
  const active = ad.media[Math.min(card, ad.media.length - 1)];
  const image = active?.thumbnail ?? active?.url;
  const link = ad.linkUrl ?? landingUrl;
  const crop = SURFACES.find((s) => s.id === surface)!.crop;
  const isStory = surface === "story";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ad.name}</DialogTitle>
          <DialogDescription>
            Composed from the draft — instant, and nothing reaches a platform.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {SURFACES.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={surface === option.id ? "default" : "outline"}
              onClick={() => setSurface(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="flex justify-center py-2">
          <div
            className={cn(
              "overflow-hidden bg-white text-black shadow-lg",
              isStory ? "w-64 rounded-2xl" : "w-80 rounded-lg",
            )}
          >
            {/* Story places its chrome over the creative; feed stacks it. */}
            {!isStory && (
              <div className="flex items-center gap-2 p-3">
                {brandLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brandLogo}
                    alt=""
                    className="size-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid size-8 place-items-center rounded-full bg-neutral-200 text-xs font-semibold">
                    {brandName.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[13px] font-semibold">
                    {brandName}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-neutral-500">
                    Sponsored · <Globe className="size-2.5" />
                  </p>
                </div>
                <MoreHorizontal className="ml-auto size-4 text-neutral-400" />
              </div>
            )}

            {!isStory && ad.body && (
              <p className="line-clamp-4 px-3 pb-2 text-[13px] leading-snug">
                {ad.body}
              </p>
            )}

            <div className={cn("relative bg-neutral-100", crop)}>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center text-xs text-neutral-400">
                  No creative
                </div>
              )}
              {isVideo && (
                <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  video
                </span>
              )}
              {isCarousel && (
                <>
                  <button
                    type="button"
                    disabled={card === 0}
                    onClick={() => setCard((c) => Math.max(0, c - 1))}
                    className="absolute top-1/2 left-1 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-white/90 disabled:opacity-30"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={card >= ad.media.length - 1}
                    onClick={() =>
                      setCard((c) => Math.min(ad.media.length - 1, c + 1))
                    }
                    className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-white/90 disabled:opacity-30"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                  <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
                    {card + 1} / {ad.media.length}
                  </span>
                </>
              )}
              {isStory && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-white">
                  {ad.body && (
                    <p className="line-clamp-3 text-[12px] leading-snug">
                      {ad.body}
                    </p>
                  )}
                  <div className="mt-2 rounded-full bg-white px-3 py-1.5 text-center text-[12px] font-semibold text-black">
                    {ctaLabel(ad.callToAction)}
                  </div>
                </div>
              )}
            </div>

            {!isStory && (
              <div className="flex items-center gap-2 bg-neutral-100 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] tracking-wide text-neutral-500">
                    {domainOf(link)}
                  </p>
                  <p className="truncate text-[13px] font-semibold">
                    {ad.headline ?? ad.name}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-neutral-200 px-2.5 py-1 text-[12px] font-medium">
                  {ctaLabel(ad.callToAction)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="border-t pt-3">
          {!showMeta ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowMeta(true)}
            >
              Check against Meta&apos;s own render
            </Button>
          ) : destinations.isPending ? (
            <p className="text-muted-foreground text-xs">
              Finding the allowlisted destination…
            </p>
          ) : !destination ? (
            <p className="text-muted-foreground text-xs">
              No allowlisted Meta destination yet — connect and allow an ad
              account on the setup page.
            </p>
          ) : isVideo ? (
            <p className="text-muted-foreground text-xs">
              Meta cannot render a video draft before it is pushed. The local
              preview above is the shape; push paused to see the real thing.
            </p>
          ) : metaPreview.data ? (
            <div className="flex max-h-[50vh] gap-3 overflow-auto">
              {metaPreview.data.previewUrls.map((src, index) => (
                <iframe
                  key={src}
                  src={src}
                  title={metaPreview.data.formats[index] ?? "Meta preview"}
                  className="h-[520px] w-full min-w-72 rounded-lg border bg-white"
                  sandbox="allow-scripts allow-same-origin"
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                loading={metaPreview.isPending}
                onClick={() =>
                  metaPreview.mutate({
                    adId: ad.id,
                    connectionAccountId: destination.connectionAccountId,
                    adAccountId: destination.adAccountId,
                  })
                }
              >
                Render on Meta
              </Button>
              <span className="text-muted-foreground text-xs">
                Feed placements only before a push.
              </span>
            </div>
          )}
          {metaPreview.error && (
            <p className="mt-2 text-xs text-red-300">
              {metaPreview.error.message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
