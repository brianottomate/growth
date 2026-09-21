"use client";

import { useState, type ComponentProps } from "react";
import { Link, Heart, MessageCircle, MoreHorizontal, X } from "lucide-react";
import { posterForMedia } from "@/lib/media-url";
import {
  SocialPostMock,
  ctaLabel,
  domainOf,
  type SocialMockCrop,
} from "@/components/social-mock";
import { cn } from "@/components/ui/lib/utils";
import { AD_PLACEMENT_SPECS } from "@/lib/ad-placements";

export { ctaLabel, domainOf };

export type AdMockMedia = {
  url: string;
  thumbnail?: string | null;
  type?: string | null;
};

/**
 * Placements a creative can land in. Local previews render all three; Meta's
 * own preview API renders the feed shapes only from a pre-push draft, because
 * story formats need the image uploaded to the ad account first. The crop each
 * one draws is the placement spec's, so the mock box and the composition render
 * never disagree — one source of truth in `AD_PLACEMENT_SPECS`.
 */
export const AD_MOCK_SURFACES = [
  { id: "facebook", label: "Facebook feed" },
  { id: "instagram", label: "Instagram feed" },
  { id: "story", label: "Story / Reel" },
] as const;

export type AdMockSurface = (typeof AD_MOCK_SURFACES)[number]["id"];

/** The crop a surface draws, read off the placement it maps to. */
function cropForSurface(surface: AdMockSurface) {
  return (
    AD_PLACEMENT_SPECS.find((spec) => spec.surface === surface)?.crop ??
    "square"
  );
}

/**
 * An ad as a feed would show it: the shared social mock with sponsored chrome,
 * the creative in the surface's crop, the domain strip and the button.
 * Instant, and nothing reaches a platform.
 */
export function AdMock({
  surface,
  crop,
  brandName,
  brandLogo,
  body,
  headline,
  link,
  callToAction,
  media,
  card = 0,
  onCard,
  className,
  publisher = "instagram",
  verticalKind = "story",
  previewState = "normal",
  diagnostics = false,
}: {
  publisher?: "facebook" | "instagram";
  verticalKind?: "story" | "reel";
  previewState?: "normal" | "caption" | "end-card";
  diagnostics?: boolean;
  surface: AdMockSurface;
  /**
   * The crop to draw, when it is not the surface's own — a placement whose
   * shape differs from its surface's feed, like the 16:9 landscape on the
   * Facebook chrome. Defaults to the surface's placement crop.
   */
  crop?: SocialMockCrop;
  brandName: string;
  brandLogo: string | null;
  body: string | null;
  headline: string | null;
  link: string | null;
  callToAction: string | null;
  media: AdMockMedia[];
  /** Which card of a carousel shows; pass `onCard` to let the viewer page. */
  card?: number;
  onCard?: (next: number) => void;
  /** Replaces the default width; the mock keeps its own radius and chrome. */
  className?: string;
}) {
  const isStory = surface === "story";
  if (isStory)
    return (
      <VerticalAdPreview
        {...{
          publisher,
          verticalKind,
          previewState,
          diagnostics,
          brandName,
          brandLogo,
          body,
          callToAction,
          media,
          card,
          onCard,
          className,
        }}
      />
    );
  return (
    <SocialPostMock
      className={cn("shadow-lg", className ?? (isStory ? "w-64" : "w-80"))}
      crop={crop ?? cropForSurface(surface)}
      card={card}
      // Without a pager the ad shows its first card, as before.
      onCard={onCard}
      clampText
      post={{
        platform: isStory ? "instagram" : surface,
        format: isStory ? "instagram.story" : null,
        name: brandName,
        // A wide lockup cropped to a circle shows three letters of the
        // middle of the brand's name, so the logo is contained.
        avatars: [{ url: brandLogo, fit: "contain" }],
        text: body,
        media: onCard ? media : media.slice(0, 1),
        sponsored: true,
        ad: { headline, link, callToAction },
      }}
    />
  );
}

/** Keep phone-sized typography and scale the entire preview, including its layout height. */
export function CompactAdMock(props: ComponentProps<typeof AdMock>) {
  return (
    <div className="w-72 max-w-full">
      <div style={{ width: 384, maxWidth: "100%", zoom: 0.75 }}>
        <AdMock {...props} className="w-full" />
      </div>
    </div>
  );
}

function VerticalAdPreview({
  publisher,
  verticalKind,
  previewState,
  diagnostics,
  brandName,
  brandLogo,
  body,
  callToAction,
  media,
  card,
  onCard,
  className,
}: {
  publisher: "facebook" | "instagram";
  verticalKind: "story" | "reel";
  previewState: "normal" | "caption" | "end-card";
  diagnostics: boolean;
  brandName: string;
  brandLogo: string | null;
  body: string | null;
  callToAction: string | null;
  media: AdMockMedia[];
  card: number;
  onCard?: (card: number) => void;
  className?: string;
}) {
  const [localCard, setLocalCard] = useState(0);
  const index = Math.min(
    onCard ? card : localCard,
    Math.max(0, media.length - 1),
  );
  const current = media[index];
  const go = onCard ?? setLocalCard;
  const isReel = verticalKind === "reel";
  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl bg-black text-white",
        className,
      )}
    >
      <div className="relative aspect-[9/16] overflow-hidden">
        {/* oxlint-disable-next-line nextjs/no-img-element */}
        {current?.type === "video" ? (
          <video
            src={current.url}
            poster={current.thumbnail ?? undefined}
            controls
            playsInline
            preload="metadata"
            className={cn(
              "absolute inset-0 size-full",
              diagnostics ? "object-contain" : "object-cover",
            )}
          />
        ) : (
          current && (
            <img
              src={posterForMedia(current) ?? current.url}
              alt="Ad creative"
              className={cn(
                "absolute inset-0 size-full",
                diagnostics ? "object-contain" : "object-cover",
              )}
            />
          )
        )}
        {!isReel && (
          <>
            <div className="absolute inset-x-2 top-2 z-10 flex gap-1">
              {media.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Story frame ${i + 1}`}
                  onClick={() => go(i)}
                  className="flex-1 py-1"
                >
                  <span
                    className={cn(
                      "block h-0.5 rounded",
                      i <= index ? "bg-white" : "bg-white/40",
                    )}
                  />
                </button>
              ))}
            </div>
            <div className="absolute inset-x-0 top-5 flex items-center gap-2 bg-gradient-to-b from-black/40 to-transparent px-3 pb-6 text-xs">
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              {brandLogo && (
                <img
                  src={brandLogo}
                  alt=""
                  className="size-7 rounded-full bg-white object-contain"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {brandName}
                  {publisher === "instagram" && media.length > 1
                    ? ` · ${index + 1} of ${media.length}`
                    : ""}
                </p>
                {publisher === "facebook" && <p>Ad</p>}
              </div>
              <MoreHorizontal className="size-4" />
              <X className="size-4" />
            </div>
          </>
        )}
        {isReel && (
          <>
            <div className="absolute right-3 bottom-24 flex flex-col gap-5">
              <Heart className="size-5" />
              <MessageCircle className="size-5" />
              <MoreHorizontal className="size-5" />
            </div>
            <div className="absolute inset-x-3 bottom-16 space-y-2 pr-8 text-xs">
              <p className="font-semibold">{brandName} · Sponsored</p>
              <p className="line-clamp-2">{body}</p>
            </div>
          </>
        )}
        <div
          className={cn(
            "absolute inset-x-4 flex justify-center",
            isReel ? "bottom-4" : "bottom-[5%]",
          )}
        >
          <span className="flex items-center gap-2 rounded-xl bg-white px-5 py-2 text-lg font-medium text-black">
            <Link className="size-5 text-blue-500" />
            {ctaLabel(callToAction)}
          </span>
        </div>
        {!isReel && previewState === "caption" && body && (
          <p className="absolute inset-x-3 bottom-[14%] truncate rounded-2xl bg-white/90 px-3 py-2 text-xs text-black">
            {body}
          </p>
        )}
        {!isReel && previewState === "end-card" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/65 p-10">
            <div className="w-full space-y-4 rounded-xl bg-white p-5 text-center text-black">
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              {brandLogo && (
                <img
                  src={brandLogo}
                  alt=""
                  className="mx-auto size-12 rounded-full object-contain"
                />
              )}
              <p className="font-semibold">{brandName}</p>
              <p className="line-clamp-3 text-sm">{body}</p>
              <span className="block rounded bg-blue-500 p-2 text-sm font-semibold text-white">
                {ctaLabel(callToAction)}
              </span>
            </div>
          </div>
        )}
        {!isReel && media.length > 1 && (
          <div className="absolute inset-x-0 top-[14%] bottom-[20%] z-20 flex">
            <button
              type="button"
              aria-label="Previous story frame"
              disabled={index === 0}
              onClick={() => go(index - 1)}
              className="w-1/3 cursor-pointer focus-visible:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white disabled:cursor-default"
            />
            <button
              type="button"
              aria-label="Next story frame"
              disabled={index === media.length - 1}
              onClick={() => go(index + 1)}
              className="flex-1 cursor-pointer focus-visible:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white disabled:cursor-default"
            />
          </div>
        )}
        {diagnostics && (
          <div className="pointer-events-none absolute inset-x-[6%] top-[14%] bottom-[25%] border border-dashed border-white">
            <span className="bg-black/80 p-1 text-[10px]">
              Composition guide · not a Meta guarantee
            </span>
          </div>
        )}
      </div>
      {!isReel && publisher === "instagram" && (
        <div className="flex items-center gap-3 px-3 py-4 text-xs">
          <span className="flex-1 rounded-full border border-white/40 px-3 py-2">
            Send message…
          </span>
          <Heart className="size-5" />
          <MessageCircle className="size-5" />
          <span>Ad</span>
        </div>
      )}
      {isReel && (
        <p className="p-2 text-[10px] text-white/70">
          Reels approximation · not calibrated from the supplied Story
          screenshots.
        </p>
      )}
    </article>
  );
}
