"use client";
import { AdSlideCopy } from "./AdSlideCopy";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  IDEA_SHAPES,
  ideaEditorPreviewUrl,
  ideaSource,
  type IdeaImage,
  type IdeaShape,
  type IdeaStudio,
} from "@/lib/ad-idea-studio";

export function AdIdeaPreview({
  studio,
  brandId,
  brandName,
  brandLogo,
  platform = false,
  showMetaPreview = true,
  content,
  home,
  onExpand,
  resolvePreview,
}: {
  studio: IdeaStudio;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  platform?: boolean;
  showMetaPreview?: boolean;
  content?: AdCreativeContent;
  home?: { name: string; url: string };
  /** Shown beside the size switcher; opens the ad's full editor. */
  onExpand?: () => void;
  /** A read-only renderer adapter for local fixtures. */
  resolvePreview?: (card: IdeaImage, shape: IdeaShape) => string;
}) {
  const [cards, setCards] = useState<Partial<Record<MetaPlacement, number>>>(
    {},
  );
  // The sizes that ship: what the checkboxes in the expanded ad select.
  const includedSizes = studio.document.exportShapes?.length
    ? studio.document.exportShapes
    : studio.document.shapes;
  const sizes = IDEA_SHAPES.filter((size) => includedSizes.includes(size));
  const defaultShape = sizes.includes("square") ? "square" : sizes[0]!;
  const [picked, setPicked] = useState<IdeaShape | null>(null);
  const shape = picked && sizes.includes(picked) ? picked : defaultShape;
  const mediaFor = (size: IdeaShape) =>
    studio.document.cards.flatMap((slide, index) => {
      const url =
        studio.approval?.renders[size]?.[index]?.url ??
        (resolvePreview
          ? resolvePreview(slide, size)
          : slide.mode === "supplied"
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
  const [platformOpen, setPlatformOpen] = useState(false);
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
  const platformPreview = () => (
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
                  crop={
                    ("crop" in resolved ? resolved.crop : undefined) ?? size
                  }
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
  );
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
                <Button
                  key={size}
                  size="sm"
                  variant={shape === size ? "secondary" : "ghost"}
                  aria-pressed={shape === size}
                  onClick={() => setPicked(size)}
                >
                  {IDEA_SHAPE_LABELS[size]}
                </Button>
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
        platformPreview()
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
                  <AdSlideCopy headline={headline} description={description} />
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
          {showMetaPreview && (
            <div className="border-t pt-2">
              <Collapsible open={platformOpen} onOpenChange={setPlatformOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronRight
                      aria-hidden="true"
                      className={`size-3.5 transition-transform ${platformOpen ? "rotate-90" : ""}`}
                    />
                    Meta preview
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pt-3">{platformPreview()}</div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </>
      )}
    </div>
  );
}
