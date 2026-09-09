import { ChevronLeft, ChevronRight, Globe, MoreHorizontal } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";
import { posterForMedia } from "@/lib/media-url";

export type AdMockMedia = {
  url: string;
  thumbnail?: string | null;
  type?: string | null;
};

/**
 * Placements a creative can land in, with the crop each one applies. Local
 * previews render all three; Meta's own preview API renders the feed shapes
 * only from a pre-push draft, because story formats need the image uploaded
 * to the ad account first.
 */
export const AD_MOCK_SURFACES = [
  { id: "facebook", label: "Facebook feed", crop: "aspect-[1.91/1]" },
  { id: "instagram", label: "Instagram feed", crop: "aspect-square" },
  { id: "story", label: "Story / Reel", crop: "aspect-[9/16]" },
] as const;

export type AdMockSurface = (typeof AD_MOCK_SURFACES)[number]["id"];

export const ctaLabel = (cta: string | null | undefined) =>
  cta
    ? cta
        .toLowerCase()
        .split("_")
        .map((word) => word[0]?.toUpperCase() + word.slice(1))
        .join(" ")
    : "Learn more";

export const domainOf = (url: string | null | undefined) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toUpperCase();
  } catch {
    return "";
  }
};

/**
 * An ad as a feed would show it, composed locally from what we hold: the
 * brand's avatar and name, the primary text, the creative in the surface's
 * crop, the domain strip and the button. Instant, and nothing reaches a
 * platform. The dialog on the campaign page and the Ad previews section on
 * the brand page both draw this.
 */
export function AdMock({
  surface,
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
}: {
  surface: AdMockSurface;
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
  const crop = AD_MOCK_SURFACES.find((option) => option.id === surface)!.crop;
  const isVideo = media[0]?.type === "video";
  const isCarousel = !isVideo && media.length > 1 && Boolean(onCard);
  const active = media[Math.min(card, Math.max(media.length - 1, 0))];
  const image = posterForMedia(active);

  return (
    <div
      className={cn(
        "overflow-hidden bg-white text-black shadow-lg",
        isStory ? "rounded-2xl" : "rounded-lg",
        className ?? (isStory ? "w-64" : "w-80"),
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
              // Contained, not covered: a wide lockup cropped to a circle
              // shows three letters of the middle of the brand's name.
              className="size-8 rounded-full border border-black/5 bg-white object-contain p-0.5"
            />
          ) : (
            <div className="grid size-8 place-items-center rounded-full bg-neutral-200 text-xs font-semibold">
              {brandName.slice(0, 2)}
            </div>
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-semibold">{brandName}</p>
            <p className="flex items-center gap-1 text-[11px] text-neutral-500">
              Sponsored · <Globe className="size-2.5" />
            </p>
          </div>
          <MoreHorizontal className="ml-auto size-4 text-neutral-400" />
        </div>
      )}

      {!isStory && body && (
        <p className="line-clamp-4 px-3 pb-2 text-[13px] leading-snug">
          {body}
        </p>
      )}

      <div className={cn("relative bg-neutral-100", crop)}>
        {/* This is the surface an operator checks the creative on, so a video
            plays here rather than showing its poster. */}
        {isVideo && active?.url ? (
          <video
            src={active.url}
            poster={
              active.thumbnail && active.thumbnail !== active.url
                ? active.thumbnail
                : undefined
            }
            className="h-full w-full bg-black object-cover"
            controls
            playsInline
            preload="metadata"
          />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
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
        {isCarousel && onCard && (
          <>
            <button
              type="button"
              disabled={card === 0}
              onClick={() => onCard(Math.max(0, card - 1))}
              className="absolute top-1/2 left-1 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-white/90 disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={card >= media.length - 1}
              onClick={() => onCard(Math.min(media.length - 1, card + 1))}
              className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-white/90 disabled:opacity-30"
            >
              <ChevronRight className="size-3.5" />
            </button>
            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
              {card + 1} / {media.length}
            </span>
          </>
        )}
        {isStory && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-white">
            {body && (
              <p className="line-clamp-3 text-[12px] leading-snug">{body}</p>
            )}
            <div className="mt-2 rounded-full bg-white px-3 py-1.5 text-center text-[12px] font-semibold text-black">
              {ctaLabel(callToAction)}
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
              {headline ?? brandName}
            </p>
          </div>
          <span className="shrink-0 rounded bg-neutral-200 px-2.5 py-1 text-[12px] font-medium">
            {ctaLabel(callToAction)}
          </span>
        </div>
      )}
    </div>
  );
}
