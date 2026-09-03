"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

import { AdPreviewDialog, type PreviewAd } from "./AdPreviewDialog";
import { posterForMedia } from "@/lib/media-url";

type DraftAd = {
  id: string;
  name: string;
  type: "creative" | "text";
  content: unknown;
};

/**
 * The plan's drafted ads: suggestions every platform compiles from. Each tile
 * opens the preview, which composes the ad locally rather than depending on a
 * platform round-trip.
 */
export function DraftedAds({
  ads,
  brandSlug,
  brandName,
  brandLogo,
  landingUrl,
}: {
  ads: DraftAd[];
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  landingUrl: string | null;
}) {
  const [previewing, setPreviewing] = useState<PreviewAd | null>(null);
  if (ads.length === 0) return null;

  const toPreview = (ad: DraftAd): PreviewAd => {
    const content = ad.content as {
      headline?: string;
      body?: string;
      linkUrl?: string;
      callToAction?: string;
      media?: Array<{ url: string; thumbnail?: string; type?: string }>;
      headlines?: string[];
      descriptions?: string[];
    };
    return {
      id: ad.id,
      name: ad.name,
      // A text ad has no single headline; its first asset stands in.
      headline: content.headline ?? content.headlines?.[0] ?? null,
      body: content.body ?? content.descriptions?.[0] ?? null,
      linkUrl: content.linkUrl ?? null,
      callToAction: content.callToAction ?? null,
      media: content.media ?? [],
    };
  };

  return (
    <div className="bg-card rounded-xl border p-3.5">
      <p className="text-sm font-semibold">
        Drafted ads
        <span className="text-muted-foreground ml-1.5 font-normal">
          {ads.length}
        </span>
      </p>
      <div className="mt-2 flex w-full gap-2 overflow-x-auto">
        {ads.map((ad) => {
          const preview = toPreview(ad);
          const first = preview.media[0];
          const isVideo = first?.type === "video";
          // Shared rule: a video's poster or nothing. An <img> pointed at an
          // .mp4 renders nothing and downloads all of it to get there.
          const image = posterForMedia(first);
          return (
            <button
              key={ad.id}
              type="button"
              onClick={() => setPreviewing(preview)}
              className="bg-background hover:border-foreground/25 w-32 shrink-0 overflow-hidden rounded-lg border text-left"
            >
              <div className="bg-muted relative h-20">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : isVideo && first?.url ? (
                  <video
                    src={first.url}
                    className="h-full w-full bg-black object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full items-center justify-center p-2 text-center text-[10px]">
                    {preview.headline ?? "Text ad"}
                  </div>
                )}
                <span className="absolute top-1 left-1 rounded-full bg-black/60 p-1 text-white">
                  <Eye className="size-3" />
                </span>
                <span className="absolute top-1 right-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                  {preview.media.length > 1
                    ? `${preview.media.length} cards`
                    : ad.type}
                </span>
              </div>
              <div className="p-2">
                <p className="truncate text-[11px] font-medium">
                  {preview.headline ?? ad.name}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {previewing && (
        <AdPreviewDialog
          ad={previewing}
          brandName={brandName}
          brandLogo={brandLogo}
          brandSlug={brandSlug}
          landingUrl={landingUrl}
          open
          onOpenChange={(next) => !next && setPreviewing(null)}
        />
      )}
    </div>
  );
}
