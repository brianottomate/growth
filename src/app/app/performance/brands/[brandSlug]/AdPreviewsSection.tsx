"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Megaphone, MessageSquare, X } from "lucide-react";

import {
  AD_MOCK_SURFACES,
  AdMock,
  type AdMockSurface,
} from "@/components/ad-mock";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import type { HomeCatalogCopy, PreviewSpec } from "@/lib/home-ad-previews";
import { sendAssistantIntent } from "@/lib/assistant-events";
import type { AdPreviewCard } from "@/server/services/brand-ad-previews.service";
import { useTRPC } from "@/trpc/react";

import { OnDemandTile } from "./OnDemandTile";
import { type PickerHome, type PickerImage, PreviewSourcePicker } from "./PreviewSourcePicker";

/**
 * One home drawn on the two ad families straight from the listing feed, in a
 * canvas per placement so each mock shows the whole card.
 */
export type OnDemandPreview = {
  homeId: string;
  homeName: string;
  homeUrl: string;
  imageUrl: string;
  /** The photo the cards draw on: the home's hero, or a chosen library image. */
  sourceUrl: string;
  headline: string;
  cta: string;
  /** An operator chose this home; false means the first on their feed stood in. */
  picked: boolean;
  catalog: HomeCatalogCopy;
};

/** The canvas each placement's on-demand card is drawn on. */
const SURFACE_FORMAT: Record<AdMockSurface, "landscape" | "square" | "story"> = {
  facebook: "landscape",
  instagram: "square",
  story: "story",
};




// The section's label and panel match `_components.tsx`, which cannot be
// imported here: it reads the desk service, and this is a client component.
const panel = "bg-card overflow-hidden rounded-2xl border";
const pill = "rounded-full";
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase">
      {children}
    </p>
  );
}

/**
 * What the brand's ads will look like, before there is a campaign: the cards
 * kept on the brand, each drawn inside a feed mock with the brand's name,
 * Sponsored, their domain and the button. One surface at a time; the toggle
 * re-crops every card together, which is how the same creative is compared
 * across placements.
 */
export function AdPreviewsSection({
  brandId,
  brandSlug,
  brandName,
  brandLogo,
  website,
  cards,
  onDemand,
  picker,
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  website: string | null;
  cards: AdPreviewCard[];
  /** Shown while nothing is frozen: one of their homes, rendered on demand. */
  onDemand?: OnDemandPreview | null;
  /** The photo picker for the on-demand cards. */
  picker?: {
    homes: PickerHome[];
    images: PickerImage[];
    current: { sourceUrl: string | null; label: string; thumbUrl: string | null };
  };
}) {
  const [surface, setSurface] = useState<AdMockSurface>("facebook");
  const trpc = useTRPC();
  const router = useRouter();
  // The Studio works from a library copy of the photo, so opening an
  // on-demand card imports its hero first (or finds the earlier import).
  const drawn = onDemand ?? null;
  const specFor = (row: "awareness" | "listing", surface: AdMockSurface): PreviewSpec | null => {
    if (!drawn) return null;
    const base = {
      brandId,
      formatId: SURFACE_FORMAT[surface],
      source: { url: drawn.sourceUrl },
    };
    return row === "awareness"
      ? { ...base, templateId: "hero-overlay", title: drawn.headline, cta: drawn.cta }
      : {
          ...base,
          templateId: "catalog-place",
          eyebrow: drawn.catalog.eyebrow,
          title: drawn.catalog.title,
          subtitle: drawn.catalog.subtitle,
          rating: drawn.catalog.rating,
        };
  };
  const remove = useMutation(
    trpc.brand.removeAdPreview.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Removed from the previews; the card stays in the library",
        );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const back = `/app/performance/brands/${brandSlug}`;
  const designInChat = (
    <Button
      size="sm"
      variant="outline"
      className="h-7 rounded-full px-3 text-[11.5px]"
      onClick={() =>
        sendAssistantIntent({
          type: "design_ad_preview",
          brandId,
          brandName,
          visibleText: `Design an ad preview for ${brandName}: one of their homes on the house card, copy in their voice, judged, and kept on the brand.`,
        })
      }
    >
      <MessageSquare className="size-3" />
      Design in chat
    </Button>
  );

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>
          Ad previews{cards.length ? ` · ${cards.length}` : ""}
        </SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          {drawn && picker ? (
            <PreviewSourcePicker
              brandId={brandId}
              homes={picker.homes}
              images={picker.images}
              current={picker.current}
            />
          ) : null}
          {cards.length > 0 ? (
            <div className="flex items-center gap-0.5 rounded-full border p-0.5">
              {AD_MOCK_SURFACES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSurface(option.id)}
                  aria-pressed={surface === option.id}
                  className={cn(
                    pill,
                    "px-2.5 py-0.5 text-[11px] transition-colors",
                    surface === option.id
                      ? "bg-foreground text-background font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {cards.length > 0 ? (
        <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
          {cards.map((card) => (
            <li key={card.assetId} className="flex flex-col items-center gap-2">
              <AdMock
                surface={surface}
                brandName={brandName}
                brandLogo={brandLogo}
                body={card.body}
                headline={card.headline || brandName}
                link={card.homeUrl ?? website}
                callToAction={card.callToAction}
                media={[
                  {
                    url: card.url,
                    thumbnail: card.thumbnailUrl,
                    type: "image",
                  },
                ]}
                className={
                  surface === "story" ? "w-full max-w-60" : "w-full max-w-80"
                }
              />
              <div className="text-muted-foreground flex w-full max-w-80 items-center justify-between gap-2 text-[11px]">
                <span className="truncate">
                  {card.templateLabel} · {card.formatLabel}
                  {card.judged ? " · judged" : ""}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/app/compositions?brandId=${encodeURIComponent(brandId)}&asset=${encodeURIComponent(card.assetId)}&adPreview=1&back=${encodeURIComponent(back)}`}
                    className="text-sky-300 hover:underline"
                  >
                    Studio
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      remove.mutate({ id: brandId, assetId: card.assetId })
                    }
                    disabled={remove.isPending}
                    className="hover:text-foreground inline-flex items-center gap-0.5 disabled:opacity-50"
                    aria-label="Remove from the previews"
                    title="Remove from the previews. The card stays in the library."
                  >
                    <X className="size-3" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {drawn ? (
        <div className="space-y-4">
          {cards.length > 0 ? (
            <p className="text-muted-foreground text-[11px]">Drawn from {drawn.homeName}, not kept</p>
          ) : null}
          {(
            [
              { row: "awareness", label: "Awareness · Hero overlay" },
              { row: "listing", label: "Listing card · Catalog place" },
            ] as const
          ).map((group) => (
            <div key={group.row} className="space-y-2">
              <p className="text-muted-foreground text-[11px]">{group.label}</p>
              <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
                {AD_MOCK_SURFACES.map((option) => {
                  const spec = specFor(group.row, option.id);
                  return spec ? (
                    <OnDemandTile
                      key={`${group.row}:${option.id}`}
                      brandId={brandId}
                      brandSlug={brandSlug}
                      brandName={brandName}
                      brandLogo={brandLogo}
                      surface={option.id}
                      spec={spec}
                      home={{ name: drawn.homeName, url: drawn.homeUrl, imageUrl: drawn.imageUrl }}
                    />
                  ) : null;
                })}
              </ul>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-[11px]">
              {drawn.picked
                ? `${drawn.homeName}, the featured home, drawn as it would run in each placement.`
                : `${drawn.homeName}, the first home on their site. Feature a home below to draw that one instead.`}{" "}
              Direct asks the art director to judge and adjust a card; Keep freezes it into the previews.
            </p>
            {cards.length === 0 ? designInChat : null}
          </div>
        </div>
      ) : null}

      {!drawn && cards.length === 0 ? (
        <div className={panel}>
          <EmptyState
            compact
            icon={Megaphone}
            title="No ad previews yet"
            description="What their ads will look like before there is a campaign. Open a photo in the library or one of their homes above and choose “Design an ad from this photo”; the card you freeze lands here."
            actions={designInChat}
          />
        </div>
      ) : null}
    </section>
  );
}
