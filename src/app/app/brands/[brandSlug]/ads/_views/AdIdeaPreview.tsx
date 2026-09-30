"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import type { AdCreativeContent } from "@/server/db/ads-schema";
import { metaPreviewMedia } from "@/lib/meta-preview";
import { CompactAdMock } from "@/components/ad-mock";
import { ctaLabel } from "@/components/social-mock";
import { META_PLACEMENTS, type MetaPlacement } from "@/lib/meta-placement-plan";
import {
  IDEA_SHAPE_LABELS,
  ideaEditorPreviewUrl,
  ideaSource,
  type IdeaShape,
  type IdeaStudio,
} from "@/lib/ad-idea-studio";

export function AdIdeaPreview({
  studio,
  brandId,
  brandName,
  brandLogo,
  platform = false,
  content,
  home,
  onExpand,
}: {
  studio: IdeaStudio;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  platform?: boolean;
  content?: AdCreativeContent;
  home?: { name: string; url: string };
  /** Shown beside the size switcher; opens the ad's full editor. */
  onExpand?: () => void;
}) {
  const [cards, setCards] = useState<Partial<Record<MetaPlacement, number>>>(
    {},
  );
  // The sizes that ship: what the checkboxes in the expanded ad select.
  const sizes = studio.document.exportShapes?.length
    ? studio.document.exportShapes
    : studio.document.shapes;
  const defaultShape = sizes.includes("portrait") ? "portrait" : sizes[0]!;
  const [picked, setPicked] = useState<IdeaShape | null>(null);
  const shape = picked && sizes.includes(picked) ? picked : defaultShape;
  const mediaFor = (size: IdeaShape) =>
    studio.document.cards.flatMap((slide, index) => {
      const url =
        studio.approval?.renders[size]?.[index]?.url ??
        (slide.mode === "supplied"
          ? ideaSource(slide, size)?.url
          : ideaEditorPreviewUrl(brandId, slide, size));
      return url
        ? [
            {
              url,
              type: "image",
              headline: slide.copy?.headline?.trim() || null,
              description: slide.copy?.description?.trim() || null,
            },
          ]
        : [];
    });
  const media = mediaFor(shape);
  const copy = studio.document.copyOverrides[shape] ?? studio.document.copy;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const descriptionId = useId();
  useEffect(() => {
    const element = descriptionRef.current;
    if (!element || descriptionExpanded) return;
    const measure = () =>
      setDescriptionOverflows(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [copy.body, descriptionExpanded, platform]);
  const destination = (() => {
    try {
      const url = new URL(copy.linkUrl);
      return ["https:", "http:"].includes(url.protocol) ? url : null;
    } catch {
      return null;
    }
  })();
  const cta = copy.callToAction ? ctaLabel(copy.callToAction) : null;
  return (
    <div className="space-y-4">
      {home && (
        <a
          href={home.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {home.name}
          <ExternalLink aria-hidden="true" className="size-3" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
      {!platform && (sizes.length > 1 || onExpand) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {sizes.length > 1 ? (
            <div
              role="group"
              aria-label="Preview size"
              className="flex w-fit flex-wrap rounded-lg border p-0.5"
            >
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={shape === size}
                  onClick={() => setPicked(size)}
                  className="rounded-md px-2.5 py-1 text-xs text-muted-foreground aria-pressed:bg-secondary aria-pressed:text-foreground"
                >
                  {IDEA_SHAPE_LABELS[size]}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          {onExpand ? (
            <Button size="sm" variant="ghost" onClick={onExpand}>
              Expand
            </Button>
          ) : null}
        </div>
      ) : null}
      {platform ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] items-start gap-4">
            {META_PLACEMENTS.filter((surface) =>
              ["facebook-feed", "instagram-feed", "facebook-story"].includes(
                surface.id,
              ),
            ).map((surface) => {
              const label =
                surface.kind === "feed" ? surface.label : "Stories / Reels";
              const size = surface.kind !== "feed" ? "story" : shape;
              const resolved = content
                ? metaPreviewMedia(content, surface.id, brandId)
                : {
                    media: [],
                    issue: "Approve and save this idea before previewing.",
                  };
              const surfaceMedia = resolved.media;
              const surfaceCopy = content ?? studio.document.copy;
              return (
                <section
                  key={surface.id}
                  aria-label={label}
                  className="min-w-0 space-y-3"
                >
                  <h4 className="text-sm font-medium">{label}</h4>
                  {surfaceMedia.length ? (
                    <CompactAdMock
                      preserveArtwork
                      surface={surface.surface}
                      publisher={surface.publisher}
                      verticalKind="story"
                      crop={size}
                      brandName={brandName}
                      brandLogo={brandLogo}
                      body={surfaceCopy.body}
                      headline={surfaceCopy.headline}
                      description={surfaceCopy.description ?? null}
                      link={surfaceCopy.linkUrl ?? null}
                      callToAction={surfaceCopy.callToAction ?? null}
                      media={surfaceMedia}
                      card={Math.min(
                        cards[surface.id] ?? 0,
                        Math.max(0, surfaceMedia.length - 1),
                      )}
                      onCard={(next) =>
                        setCards((current) => ({
                          ...current,
                          [surface.id]: next,
                        }))
                      }
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                      {resolved.issue}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="max-w-2xl text-sm">
            <div className="space-y-1">
              <p
                ref={descriptionRef}
                id={descriptionId}
                className={`whitespace-pre-wrap text-muted-foreground ${descriptionExpanded ? "" : "line-clamp-3"}`}
              >
                {copy.body || "Primary text not set"}
              </p>
              {(descriptionOverflows || descriptionExpanded) && (
                <button
                  type="button"
                  aria-expanded={descriptionExpanded}
                  aria-controls={descriptionId}
                  className="text-xs underline underline-offset-4 hover:text-muted-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setDescriptionExpanded((current) => !current)}
                >
                  {descriptionExpanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          </div>
          {/* Each card as Meta draws it: the image, then its headline and
              description with the button beside them. A blank card shows the
              ad's own words, as Meta does. */}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {media.map((item, index) => {
              const headline = item.headline || copy.headline;
              const description =
                item.description || copy.description?.trim() || "";
              return (
                <div key={index} className="w-52 shrink-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open slide ${index + 1} at full size`}
                  >
                    <Image
                      src={item.url}
                      alt={`Slide ${index + 1}`}
                      width={300}
                      height={375}
                      unoptimized
                      className="h-auto w-full rounded-t-lg"
                    />
                  </a>
                  <div className="rounded-b-lg border border-t-0 bg-card px-2.5 py-2 text-xs">
                    <p
                      className={`truncate font-medium ${headline ? "" : "text-muted-foreground"}`}
                      title={headline}
                    >
                      {headline || "Headline not set"}
                    </p>
                    <p className="line-clamp-2 text-muted-foreground">
                      {description || "Description not set"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="max-w-2xl text-sm">
            <div className="flex min-w-0 items-center gap-3 text-xs">
              {cta && <Badge variant="secondary">{cta}</Badge>}
              {destination ? (
                <a
                  href={destination.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={destination.href}
                  className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <span className="truncate">
                    {destination.hostname.replace(/^www\./, "")}
                    {destination.pathname === "/" ? "" : destination.pathname}
                  </span>
                  <ExternalLink
                    aria-hidden="true"
                    className="size-3 shrink-0"
                  />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <span className="text-muted-foreground">
                  Destination not set
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
