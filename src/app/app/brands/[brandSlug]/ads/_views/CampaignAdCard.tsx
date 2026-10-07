"use client";

import { ReturnToStudioButton } from "@/components/review/ReturnToStudioButton";

import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Images,
  Play,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AD_FORMATS, adFormat } from "@/lib/ad-format";
import type { AdReview } from "@/lib/ad-review";
import {
  ideaDocumentFromAd,
  ideaEditorPreviewUrl,
  ideaSource,
} from "@/lib/ad-idea-studio";
import type { AdContent, ChannelPlatform } from "@/server/db/schema";

import { AdIdeaPreview } from "./AdIdeaPreview";
import { AdPlatformRouting } from "./AdPlatformRouting";

/** Campaigns inspect delivery creatives; Studio owns their authoring and review. */
export function CampaignAdCard({
  ad,
  brandId,
  brandName,
  brandLogo,
  home,
  deliveryState,
  plannedPlatforms,
  studioHref,
}: {
  ad: {
    id: string;
    updatedAt: Date;
    name: string;
    content: AdContent;
    review: AdReview;
    platforms?: ChannelPlatform[] | null;
  };
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  home?: { name: string; url: string };
  deliveryState?: string;
  plannedPlatforms: ChannelPlatform[];
  studioHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const format = adFormat(ad.content);
  const creative = "media" in ad.content ? ad.content : null;
  const document = creative
    ? ideaDocumentFromAd({ name: ad.name, content: creative })
    : null;
  const studio = creative?.ideaStudio;
  const slideCount = Math.max(
    document?.cards.length ?? 0,
    creative?.media.length ?? 0,
    1,
  );
  const currentSlide = Math.min(slide, slideCount - 1);
  const firstCard = document?.cards[currentSlide];
  const first = creative?.media[currentSlide];
  const thumbnail =
    studio?.approval?.renders.square?.[currentSlide]?.url ??
    (first?.type === "image" ? first.url : first?.thumbnail) ??
    (firstCard
      ? firstCard.mode === "supplied"
        ? ideaSource(firstCard, "square")?.url
        : ideaEditorPreviewUrl(brandId, firstCard, "square")
      : undefined);
  const Icon = format === "video" ? Play : format === "text" ? Type : Images;
  const copy =
    creative?.body ||
    ("descriptions" in ad.content ? ad.content.descriptions[0] : "");
  return (
    <article
      id={`ad-${ad.id}`}
      className="overflow-hidden rounded-xl border bg-background"
    >
      <div className="flex flex-wrap items-start gap-4 p-4">
        <div className="relative flex size-36 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <Icon className="size-5 text-muted-foreground" />
          )}
          {format === "carousel" && slideCount > 1 && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/70 px-1 py-1 text-xs text-white">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Previous slide for ${ad.name}`}
                onClick={() =>
                  setSlide((currentSlide + slideCount - 1) % slideCount)
                }
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span aria-live="polite">
                {currentSlide + 1} / {slideCount}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Next slide for ${ad.name}`}
                onClick={() => setSlide((currentSlide + 1) % slideCount)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="min-w-40 flex-1 space-y-1.5">
          <h3 className="text-sm font-semibold">{ad.name}</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{AD_FORMATS.find((item) => item.id === format)?.label}</span>
            <span>
              {deliveryState === "live"
                ? "Linked to live campaign"
                : deliveryState
                  ? "Pushed to platform"
                  : "Not pushed"}
            </span>
          </div>
          {copy && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{copy}</p>
          )}
          {home && (
            <a
              href={home.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline underline-offset-4"
            >
              {home.name}
            </a>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={open}
              aria-controls={`preview-${ad.id}`}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Hide preview" : "Preview"}
              <ChevronDown
                className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </Button>
            <ReturnToStudioButton
              adId={ad.id}
              updatedAt={ad.updatedAt.toISOString()}
              studioHref={studioHref}
              pushed={Boolean(deliveryState)}
            />
          </div>
        </div>
      </div>
      {open && (
        <div id={`preview-${ad.id}`} className="space-y-4 border-t p-4">
          <AdPlatformRouting
            adId={ad.id}
            platforms={ad.platforms ?? null}
            planned={plannedPlatforms}
            locked={Boolean(deliveryState)}
          />
          {creative && format !== "video" ? (
            <AdIdeaPreview
              studio={
                creative.ideaStudio ?? {
                  document: ideaDocumentFromAd({
                    name: ad.name,
                    content: creative,
                  }),
                }
              }
              brandId={brandId}
              brandName={brandName}
              brandLogo={brandLogo}
              content={creative}
              home={home}
            />
          ) : creative ? (
            <div className="space-y-3">
              <p className="text-sm">{creative.headline}</p>
              <p className="text-sm text-muted-foreground">{creative.body}</p>
              {creative.media.map((media, index) =>
                media.type === "video" ? (
                  <video
                    key={index}
                    controls
                    preload="none"
                    src={media.url}
                    poster={media.thumbnail}
                    className="max-h-96 rounded-lg"
                  />
                ) : (
                  <img
                    key={index}
                    src={media.url}
                    alt=""
                    loading="lazy"
                    className="max-h-96 rounded-lg"
                  />
                ),
              )}
            </div>
          ) : "headlines" in ad.content ? (
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="mb-2 font-medium">Headlines</h4>
                {ad.content.headlines.map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
              <div>
                <h4 className="mb-2 font-medium">Descriptions</h4>
                {ad.content.descriptions.map((line, index) => (
                  <p key={index} className="text-muted-foreground">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
