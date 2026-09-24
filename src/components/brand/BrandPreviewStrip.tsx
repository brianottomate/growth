"use client";

import { useState } from "react";

import { cn } from "@/components/ui/lib/utils";
import {
  getCompositionFormat,
  type CompositionFormatId,
  type CompositionTemplateId,
} from "@/lib/compositions";

/** The photo the strip draws, and the listing facts that fill the copy. */
export type PreviewHome = {
  name: string;
  imageUrl: string;
  place: string | null;
  facts: string | null;
  rating: number | null;
  /** The brand's hero home, or a library photo chosen with no home behind it. */
  source: "hero" | "library";
};

// Hidden for now: the alternative blueprints and their aspect picker.
const SHOW_ALTERNATIVES = false;

type Card = {
  templateId: CompositionTemplateId;
  formatId: CompositionFormatId;
  label: string;
  fields: (
    home: PreviewHome | null,
    brandName: string,
  ) => Record<string, string>;
};

const CTA = "Explore your next escape";

// The blueprints the starter-ads workflow draws (hero-overlay for the first
// and last feed card, image-hero between, tall-statement on the story
// canvas), plus the catalog card.
const STARTER: Card[] = [
  {
    templateId: "hero-overlay",
    formatId: "portrait",
    label: "Hero",
    fields: (home, brandName) => ({ title: home?.name ?? brandName, cta: CTA }),
  },
  {
    templateId: "image-hero",
    formatId: "portrait",
    label: "Carousel",
    fields: (home, brandName) => ({
      title: home?.place ?? home?.name ?? brandName,
      subtitle: home?.facts ?? "",
    }),
  },
  {
    templateId: "tall-statement",
    formatId: "story",
    label: "Story",
    fields: (home, brandName) => ({ title: home?.name ?? brandName, cta: CTA }),
  },
  {
    templateId: "hero-overlay",
    formatId: "landscape",
    label: "Landscape",
    fields: (home, brandName) => ({ title: home?.name ?? brandName, cta: CTA }),
  },
  {
    templateId: "catalog-copy",
    formatId: "portrait",
    label: "Catalog",
    fields: (home, brandName) => ({
      title: home?.name ?? brandName,
      subtitle: home?.facts ?? "",
    }),
  },
];

const ALTERNATIVES: Card[] = [
  {
    templateId: "catalog-place",
    formatId: "portrait",
    label: "Place",
    fields: (home, brandName) => ({
      eyebrow: "Your stay in",
      title: home?.place ?? home?.name ?? brandName,
      subtitle: home?.facts ?? "",
      ...(home?.rating ? { rating: home.rating.toFixed(1) } : {}),
    }),
  },
  {
    templateId: "tall-welcome",
    formatId: "portrait",
    label: "Welcome",
    fields: (home, brandName) => ({
      title: `Welcome to ${brandName}`,
      subtitle: home?.place ?? "",
      cta: "Book direct",
    }),
  },
];

const ASPECTS = ["portrait", "square", "landscape", "story"] as const;
type Aspect = (typeof ASPECTS)[number];

/**
 * The brand's cards drawn live from one photo: how the fonts, mark and
 * blueprints look together before anything is saved or frozen. A draft font
 * rides along as `fontFamily`; nothing here writes to the library.
 */
export function BrandPreviewStrip({
  brandId,
  brandName,
  home,
  fontFamily,
  action,
}: {
  brandId: string;
  brandName: string;
  home: PreviewHome | null;
  /** Beside the home's name: the control that changes it. */
  action?: React.ReactNode;
  /** An unsaved heading font; null draws the brand's saved one. */
  fontFamily: string | null;
}) {
  const [aspect, setAspect] = useState<Aspect>("portrait");

  const src = (card: Card) => {
    const params = new URLSearchParams({
      brandId,
      templateId: card.templateId,
      formatId: card.formatId,
      mark: "white",
      ...card.fields(home, brandName),
    });
    if (home) params.set("sourceUrl", home.imageUrl);
    if (fontFamily) params.set("fontFamily", fontFamily);
    return `/api/compositions/preview?${params}`;
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground">
          {home
            ? `${home.name}${home.source === "library" ? " · library photo" : ""}`
            : "No hero yet"}
        </span>
        {action}
      </div>
      {home ? (
        <>
          <Band label="Starter ads" cards={STARTER} src={src} />
          {SHOW_ALTERNATIVES ? (
            <Band
              label="Alternatives"
              cards={ALTERNATIVES.map((card) => ({
                ...card,
                formatId: aspect,
              }))}
              src={src}
              action={
                <Pills options={ASPECTS} value={aspect} onChange={setAspect} />
              }
            />
          ) : null}
        </>
      ) : null}
      {home === null ? (
        <p className="text-muted-foreground">
          Choose a hero above to preview cards.
        </p>
      ) : null}
    </div>
  );
}

function Band({
  label,
  cards,
  src,
  action,
}: {
  label: string;
  cards: Card[];
  src: (card: Card) => string;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {action}
      </div>
      <ul className="flex flex-wrap items-end gap-2">
        {cards.map((card) => {
          const format = getCompositionFormat(card.formatId);
          return (
            <li
              key={`${card.templateId}-${card.formatId}`}
              className="space-y-1"
              // Same height across a band, so every aspect reads at a glance.
              style={{ width: `${(12 * format.width) / format.height}rem` }}
            >
              <div
                className="overflow-hidden rounded-md border bg-muted"
                style={{ aspectRatio: `${format.width} / ${format.height}` }}
              >
                {/* oxlint-disable-next-line nextjs/no-img-element */}
                <img
                  key={src(card)}
                  src={src(card)}
                  alt={`${card.label} card`}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </div>
              <span className="text-muted-foreground">{card.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full border px-2 py-0.5 capitalize",
            option === value
              ? "border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
