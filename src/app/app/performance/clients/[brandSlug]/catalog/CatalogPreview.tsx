"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import {
  catalogCardPreviewUrl,
  defaultCatalogAdCopy,
  type CatalogAdCopy,
  type CatalogDraft,
  type CatalogHome,
} from "@/lib/catalog-studio";
import { previewAtWidth } from "@/lib/compositions";

export type CatalogPreviewCard = {
  key: string;
  image: string | undefined;
  /** What Meta shows under the card. */
  headline: string;
  description: string;
};

/**
 * The catalog as Meta shows it, at phone width: the feed carousel and the
 * story with its expanded "More from" grid, stacked, from the live Studio
 * cards. A local mock; nothing reaches
 * Meta. Tiles are square. An older 4:5 export is fitted inside the tile with
 * bars at the sides, the way Meta showed Winter Park's (2026-09-28).
 */
export function CatalogPreview({
  brandId,
  brandName,
  homes,
  draft,
}: {
  brandId: string;
  brandName: string;
  homes: CatalogHome[];
  draft: CatalogDraft;
}) {
  const cards: CatalogPreviewCard[] = draft.cards
    .filter((c) => c.included)
    .map((card) => ({
      key: card.homeId,
      image:
        previewAtWidth(catalogCardPreviewUrl(brandId, card), 300) ??
        card.imageUrl,
      headline: card.adHeadline,
      description: card.adDescription,
    }));
  return (
    <CatalogCollectionPreview
      brandName={brandName}
      cards={cards}
      ad={draft.ad}
    />
  );
}

/** Shared catalog mock for Studio and local experiments; cards are already resolved. */
export function CatalogCollectionPreview({
  brandName,
  cards,
  compact = false,
  ad: saved,
}: {
  brandName: string;
  cards: CatalogPreviewCard[];
  compact?: boolean;
  /** The saved ad copy; the mock falls back to the default. */
  ad?: CatalogAdCopy;
}) {
  const ad = saved ?? defaultCatalogAdCopy(brandName);
  const text = ad.primaryText;

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-start gap-6"
          : "grid grid-cols-1 items-start gap-6 @3xl:grid-cols-2 @6xl:grid-cols-3"
      }
    >
      <div className={compact ? "w-80 max-w-full space-y-2" : ""}>
        {compact && <h4 className="text-sm font-medium">Feed carousel</h4>}
        <FeedPreview brandName={brandName} text={text} ad={ad} cards={cards} />
      </div>
      <div className={compact ? "w-80 max-w-full space-y-2" : ""}>
        {compact && <h4 className="text-sm font-medium">Catalog story</h4>}
        <StoryPreview brandName={brandName} cards={cards} />
      </div>
      <div className={compact ? "w-80 max-w-full space-y-2" : ""}>
        {compact && (
          <h4 className="text-sm font-medium">More from · whole catalog</h4>
        )}
        <MoreFromPreview brandName={brandName} cards={cards} />
      </div>
    </div>
  );
}

function FeedPreview({
  brandName,
  text,
  ad,
  cards,
}: {
  brandName: string;
  text: string;
  ad: CatalogAdCopy;
  cards: CatalogPreviewCard[];
}) {
  return (
    <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar brandName={brandName} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{brandName}</p>
          <p className="text-xs text-muted-foreground">Sponsored</p>
        </div>
      </header>
      <p className="line-clamp-3 px-3 pb-3 text-[13px] leading-relaxed whitespace-pre-wrap">
        {text}
      </p>
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-4">
        {cards.map((card) => (
          <article
            key={card.key}
            className="w-[78%] shrink-0 snap-start overflow-hidden rounded-lg border"
          >
            <Tile card={card} />
            <div className="flex items-center gap-2 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">
                  {card.headline}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {card.description}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs font-medium">
                Book now
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/**
 * The story: one large card over a two-column grid, on a backdrop Meta takes
 * from the lead card's colours. "Expand story" opens every card as a grid
 * with the home's name under it.
 */
function StoryPreview({
  brandName,
  cards,
}: {
  brandName: string;
  cards: CatalogPreviewCard[];
}) {
  const [lead, ...rest] = cards;
  const backdrop = useAverageColor(lead?.image);

  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[390px] overflow-hidden rounded-2xl border bg-black text-white shadow-sm">
      <div className="absolute inset-0 flex flex-col">
        <div
          className="flex min-h-0 flex-1 flex-col rounded-b-2xl transition-colors"
          style={{ backgroundColor: backdrop }}
        >
          <div className="flex gap-1 px-2 pt-2">
            <span className="h-0.5 flex-1 rounded-full bg-white/80" />
            <span className="h-0.5 flex-1 rounded-full bg-white/35" />
          </div>
          <header className="flex items-center gap-2 px-3 py-2.5">
            <Avatar brandName={brandName} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold">{brandName}</p>
              <p className="text-xs text-white/85">▸ Expand story</p>
            </div>
            <X className="ml-auto size-5" aria-hidden="true" />
          </header>
          <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-4 pt-2">
            {lead ? <Tile card={lead} className="rounded-xl" /> : null}
            <div className="grid grid-cols-2 gap-2">
              {rest.slice(0, 4).map((card) => (
                <Tile key={card.key} card={card} className="rounded-xl" />
              ))}
            </div>
          </div>
        </div>
        <footer className="flex items-center gap-3 px-3 py-3">
          <span className="flex-1 rounded-full border border-white/40 px-4 py-2 text-[13px] text-white/80">
            Send message…
          </span>
          <span className="text-xs font-medium">Ad</span>
        </footer>
      </div>
    </div>
  );
}

/** What "Expand story" opens: every card as a grid with the home's name under it. */
function MoreFromPreview({
  brandName,
  cards,
}: {
  brandName: string;
  cards: CatalogPreviewCard[];
}) {
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[390px] overflow-hidden rounded-2xl border bg-background text-foreground shadow-sm">
      <div className="absolute inset-0 flex flex-col">
        <header className="flex items-center gap-3 px-3 py-3">
          <span className="grid size-8 place-items-center rounded-full bg-muted">
            <X className="size-4" aria-hidden="true" />
          </span>
          <p className="truncate text-sm font-semibold">
            More from {brandName}
          </p>
        </header>
        <div className="grid flex-1 grid-cols-2 content-start gap-x-2 gap-y-3 overflow-y-auto px-2 pb-3">
          {cards.map((card) => (
            <article key={card.key} className="space-y-1">
              <Tile card={card} className="rounded-lg" />
              <p className="line-clamp-2 px-0.5 text-[11px] leading-tight font-semibold">
                {card.headline}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function Avatar({ brandName }: { brandName: string }) {
  return (
    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground">
      {brandName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Tile({
  card,
  className,
}: {
  card: CatalogPreviewCard;
  className?: string;
}) {
  return (
    // oxlint-disable-next-line nextjs/no-img-element
    <img
      src={card.image}
      alt={card.headline}
      loading="lazy"
      className={`aspect-square w-full bg-neutral-700 object-contain ${className ?? ""}`}
    />
  );
}

/** The image's mean colour, or a neutral grey until it loads or if it cannot be read. */
const NEUTRAL = "rgb(64 64 64)";
function useAverageColor(src: string | undefined) {
  const [color, setColor] = useState(NEUTRAL);
  useEffect(() => {
    // A new lead card starts neutral, so an unreadable one never keeps the last colour.
    setColor(NEUTRAL);
    if (!src) return;
    let current = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        if (current) setColor(`rgb(${r} ${g} ${b})`);
      } catch {
        // A cross-origin image without CORS headers taints the canvas.
      }
    };
    img.src = src;
    return () => {
      current = false;
    };
  }, [src]);
  return color;
}
