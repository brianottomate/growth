"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  catalogCardPreviewUrl,
  type CatalogDraft,
  type CatalogExport,
  type CatalogHome,
} from "@/lib/catalog-studio";

/** "studio" for the live cards, else an export id. */
type Source = string;
type Placement = "feed" | "story";
type PreviewCard = {
  key: string;
  image: string | undefined;
  home: CatalogHome | undefined;
  name: string;
};

/**
 * The catalog as Meta shows it, at phone width: the feed carousel, or the
 * story with its expanded "More from" grid. A local mock; nothing reaches
 * Meta. Tiles are square. An older 4:5 export is fitted inside the tile with
 * bars at the sides, the way Meta showed Winter Park's (2026-09-28).
 */
export function CatalogPreview({
  brandId,
  brandName,
  homes,
  draft,
  exports,
}: {
  brandId: string;
  brandName: string;
  homes: CatalogHome[];
  draft: CatalogDraft;
  exports: CatalogExport[];
}) {
  const ready = exports.filter((e) => e.status === "ready" && e.assets?.length);
  const [source, setSource] = useState<Source>("studio");
  const [placement, setPlacement] = useState<Placement>("feed");
  const [text, setText] = useState(
    `Find your next ${brandName} escape. Private homes, booked direct.`,
  );
  const byId = new Map(homes.map((h) => [h.id, h]));
  const chosen = ready.find((e) => e.id === source);
  const cards: PreviewCard[] = chosen
    ? chosen.assets!.map((asset) => ({
        key: asset.assetId,
        image: asset.url,
        home: byId.get(asset.homeId),
        name: asset.name,
      }))
    : draft.cards
        .filter((c) => c.included)
        .map((card) => ({
          key: card.homeId,
          image: catalogCardPreviewUrl(brandId, card) ?? card.imageUrl,
          home: byId.get(card.homeId),
          name: byId.get(card.homeId)?.name ?? card.homeId,
        }));
  const exportLabel = (e: CatalogExport) =>
    `${e.label ?? "Export"} · ${new Date(e.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;

  return (
    <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,390px)]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={source === "studio" ? "secondary" : "ghost"}
            aria-pressed={source === "studio"}
            onClick={() => setSource("studio")}
          >
            Studio
          </Button>
          {ready.map((e) => (
            <Button
              key={e.id}
              size="sm"
              variant={source === e.id ? "secondary" : "ghost"}
              aria-pressed={source === e.id}
              onClick={() => setSource(e.id)}
            >
              {exportLabel(e)}
            </Button>
          ))}
        </div>
        <div className="flex w-fit rounded-lg border p-0.5">
          {(["feed", "story"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={placement === p ? "secondary" : "ghost"}
              aria-pressed={placement === p}
              onClick={() => setPlacement(p)}
            >
              {p === "feed" ? "Feed" : "Story"}
            </Button>
          ))}
        </div>
        {placement === "feed" ? (
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Primary text</span>
            <Textarea
              value={text}
              rows={3}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        ) : null}
        <p className="text-sm text-muted-foreground">{cards.length} cards</p>
      </div>
      {placement === "feed" ? (
        <FeedPreview brandName={brandName} text={text} cards={cards} />
      ) : (
        <StoryPreview brandName={brandName} cards={cards} />
      )}
    </div>
  );
}

function FeedPreview({
  brandName,
  text,
  cards,
}: {
  brandName: string;
  text: string;
  cards: PreviewCard[];
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
                  {card.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {card.home?.nightlyFrom
                    ? `From $${card.home.nightlyFrom.toLocaleString("en-US")} a night`
                    : (card.home?.city ?? "")}
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
  cards: PreviewCard[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [lead, ...rest] = cards;
  const backdrop = useAverageColor(lead?.image);

  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[390px] overflow-hidden rounded-2xl border bg-black text-white shadow-sm">
      {expanded ? (
        <div className="absolute inset-0 flex flex-col bg-background text-foreground">
          <header className="flex items-center gap-3 px-3 py-3">
            <button
              type="button"
              aria-label="Close"
              onClick={() => setExpanded(false)}
              className="grid size-8 place-items-center rounded-full bg-muted"
            >
              <X className="size-4" />
            </button>
            <p className="truncate text-sm font-semibold">
              More from {brandName}
            </p>
          </header>
          <div className="grid flex-1 grid-cols-2 content-start gap-x-2 gap-y-3 overflow-y-auto px-2 pb-3">
            {cards.map((card) => (
              <article key={card.key} className="space-y-1">
                <Tile card={card} className="rounded-lg" />
                <p className="line-clamp-2 px-0.5 text-[11px] leading-tight font-semibold">
                  {card.name}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : (
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
                <p className="truncate text-[13px] font-semibold">
                  {brandName}
                </p>
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-xs text-white/85 hover:underline"
                >
                  ▸ Expand story
                </button>
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
      )}
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

function Tile({ card, className }: { card: PreviewCard; className?: string }) {
  return (
    // oxlint-disable-next-line nextjs/no-img-element
    <img
      src={card.image}
      alt={card.name}
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
