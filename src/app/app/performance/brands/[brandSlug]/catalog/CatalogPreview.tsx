"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/lib/utils";
import {
  catalogCardPreviewUrl,
  type CatalogDraft,
  type CatalogExport,
  type CatalogHome,
} from "@/lib/catalog-studio";

/** "studio" for the live cards, else an export id. */
type Source = string;
type Crop = "square" | "portrait";

/**
 * The catalog as a feed shows it: a carousel ad with the brand's header,
 * one primary text and a strip of cards, each with the home's name, its
 * nightly price and the button, at phone width. A local mock; nothing
 * reaches Meta. The square crop is how a catalog carousel may draw a card,
 * so an overlay that only fits the portrait frame shows up here first.
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
  const [crop, setCrop] = useState<Crop>("square");
  const [text, setText] = useState(
    `Find your next ${brandName} escape. Private homes, booked direct.`,
  );
  const byId = new Map(homes.map((h) => [h.id, h]));
  const chosen = ready.find((e) => e.id === source);
  const cards = chosen
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
        <div className="flex rounded-lg border p-0.5">
          {(["square", "portrait"] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant={crop === c ? "secondary" : "ghost"}
              aria-pressed={crop === c}
              onClick={() => setCrop(c)}
            >
              {c === "square" ? "Square crop" : "Card's own 4:5"}
            </Button>
          ))}
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted-foreground">Primary text</span>
          <Textarea
            value={text}
            rows={3}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="text-sm text-muted-foreground">{cards.length} cards</p>
      </div>
      <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
        <header className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="grid size-8 place-items-center rounded-full bg-muted text-sm font-semibold">
            {brandName.slice(0, 1).toUpperCase()}
          </div>
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
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              <img
                src={card.image}
                alt={card.name}
                loading="lazy"
                className={cn(
                  "w-full object-cover",
                  crop === "square" ? "aspect-square" : "aspect-[4/5]",
                )}
              />
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
    </div>
  );
}
