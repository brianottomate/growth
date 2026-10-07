"use client";

import { ReturnToStudioButton } from "@/components/review/ReturnToStudioButton";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Images,
  Play,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdPreviewSlide } from "./AdPreviewSlide";
import { destinationLabel, safeHomeUrl } from "@/lib/ad-preview-links";
import { AD_FORMATS, adFormat } from "@/lib/ad-format";
import type { AdReview } from "@/lib/ad-review";
import { ideaDocumentFromAd } from "@/lib/ad-idea-studio";
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
  const images = useMemo(
    () =>
      creative?.media.map((media, index) => {
        const render = studio?.approval?.renders.square?.[index];
        return {
          url: render?.url ?? media.url,
        };
      }) ?? [],
    [creative?.media, studio?.approval?.renders.square],
  );
  const image = images[currentSlide];
  const thumbnail = image?.url;
  useEffect(() => {
    if (format !== "carousel" || images.length < 2) return;
    for (const index of [
      (currentSlide + 1) % images.length,
      (currentSlide + images.length - 1) % images.length,
    ]) {
      const preload = new window.Image();
      preload.src = images[index]!.url;
    }
  }, [currentSlide, format, images]);
  const Icon = format === "video" ? Play : format === "text" ? Type : Images;
  const copy =
    creative?.body ||
    ("descriptions" in ad.content ? ad.content.descriptions[0] : "");
  const destination = safeHomeUrl(ad.content.linkUrl);
  const cardDestinations =
    creative?.media.flatMap((item, index) => {
      const url = safeHomeUrl(item.landingUrl);
      return url && url !== destination ? [{ index, url }] : [];
    }) ?? [];
  return (
    <article
      id={`ad-${ad.id}`}
      className="overflow-hidden rounded-xl border bg-background"
    >
      <div className="flex flex-wrap items-start gap-4 p-4">
        {thumbnail && format !== "video" ? (
          <AdPreviewSlide
            url={thumbnail}
            index={currentSlide}
            headline={
              firstCard?.copy?.headline?.trim() || creative?.headline || ""
            }
            description={
              firstCard?.copy?.description?.trim() ||
              creative?.description ||
              ""
            }
            controls={
              format === "carousel" && slideCount > 1 ? (
                <>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="absolute top-1/2 left-2 -translate-y-1/2"
                    aria-label={`Previous slide for ${ad.name}`}
                    onClick={() =>
                      setSlide((currentSlide + slideCount - 1) % slideCount)
                    }
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="absolute top-1/2 right-2 -translate-y-1/2"
                    aria-label={`Next slide for ${ad.name}`}
                    onClick={() => setSlide((currentSlide + 1) % slideCount)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </>
              ) : null
            }
          />
        ) : (
          <div className="flex size-36 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
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
          </div>
        )}
        <div className="min-w-40 flex-1 space-y-1.5">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{ad.name}</h3>
              <Badge variant="secondary">
                {AD_FORMATS.find((item) => item.id === format)?.label}
              </Badge>
            </div>
            <ReturnToStudioButton
              menu
              adId={ad.id}
              updatedAt={ad.updatedAt.toISOString()}
              studioHref={studioHref}
              pushed={Boolean(deliveryState)}
            />
          </div>
          {deliveryState && (
            <p className="text-xs text-muted-foreground">
              {deliveryState === "live"
                ? "Linked to live campaign"
                : "Pushed to platform"}
            </p>
          )}
          {copy && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{copy}</p>
          )}
          {destination && (
            <a
              href={destination}
              title={destination}
              target="_blank"
              rel="noreferrer"
              className="block w-fit max-w-full truncate text-xs text-muted-foreground underline underline-offset-4"
            >
              {destinationLabel(destination)} ↗
            </a>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              variant={open ? "secondary" : "ghost"}
              aria-expanded={open}
              aria-controls={`preview-${ad.id}`}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Hide preview" : "Preview"}
              <ChevronDown
                className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </Button>
            {format === "carousel" && slideCount > 1 && (
              <span
                aria-live="polite"
                className="text-xs text-muted-foreground tabular-nums"
              >
                {currentSlide + 1} / {slideCount}
              </span>
            )}
          </div>
        </div>
      </div>
      {open && (
        <div id={`preview-${ad.id}`} className="space-y-4 border-t p-4">
          {cardDestinations.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {cardDestinations.map(({ index, url }) => (
                <a
                  key={index}
                  href={url}
                  title={url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  Slide {index + 1} · {destinationLabel(url)} ↗
                </a>
              ))}
            </div>
          )}
          <AdPlatformRouting
            adId={ad.id}
            platforms={ad.platforms ?? null}
            planned={plannedPlatforms}
            locked={Boolean(deliveryState)}
          />
          {creative && format !== "video" ? (
            <AdIdeaPreview
              showMetaPreview={false}
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
