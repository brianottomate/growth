"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { CompactAdMock } from "@/components/ad-mock";
import { META_PLACEMENTS, type MetaPlacement } from "@/lib/meta-placement-plan";
import {
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
}: {
  studio: IdeaStudio;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  platform?: boolean;
}) {
  const [cards, setCards] = useState<Partial<Record<MetaPlacement, number>>>(
    {},
  );
  const shape = studio.document.shapes.includes("portrait")
    ? "portrait"
    : studio.document.shapes[0]!;
  const mediaFor = (size: IdeaShape) =>
    studio.document.cards.flatMap((slide, index) => {
      const url =
        studio.approval?.renders[size]?.[index]?.url ??
        (studio.approval
          ? null
          : slide.mode === "supplied"
            ? ideaSource(slide, size)?.url
            : ideaEditorPreviewUrl(brandId, slide, size));
      return url ? [{ url, type: "image" }] : [];
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
  const ctaLabel = copy.callToAction
    ?.toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <div className="space-y-4">
      {platform ? (
        <>
          <p className="text-xs text-muted-foreground">
            Placement approximation ·{" "}
            {studio.approval ? "Approved creative" : "Draft creative"}.{" "}
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] items-start gap-5">
            {!studio.document.intendedPlacements?.length && (
              <p className="text-sm text-muted-foreground">
                Choose intended placements in Details to preview them here.
              </p>
            )}
            {META_PLACEMENTS.filter((p) =>
              studio.document.intendedPlacements?.includes(p.id),
            ).map((surface) => {
              const size = surface.kind !== "feed" ? "story" : shape;
              const included =
                !studio.approval ||
                Boolean(studio.approval.renders[size]?.length);
              const surfaceMedia = mediaFor(size);
              const surfaceCopy =
                studio.document.copyOverrides[size] ?? studio.document.copy;
              return (
                <section
                  key={surface.id}
                  aria-label={surface.label}
                  className="min-w-0 space-y-3"
                >
                  <h4 className="text-sm font-medium">{surface.label}</h4>
                  {surface.kind !== "feed" &&
                    studio.document.cards.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        Creative preview only. Vertical carousel delivery is not
                        supported by our current publisher.
                      </p>
                    )}
                  {included && surfaceMedia.length ? (
                    <CompactAdMock
                      surface={surface.surface}
                      publisher={surface.publisher}
                      verticalKind={surface.kind === "reel" ? "reel" : "story"}
                      crop={size}
                      brandName={brandName}
                      brandLogo={brandLogo}
                      body={surfaceCopy.body}
                      headline={surfaceCopy.headline}
                      link={surfaceCopy.linkUrl}
                      callToAction={surfaceCopy.callToAction}
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
                      No approved export for this placement. Reopen the idea and
                      include this size when approving.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {media.map((item, index) => (
              <div key={index} className="w-52 shrink-0 space-y-2">
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
                    className="h-auto w-full rounded-lg"
                  />
                </a>
              </div>
            ))}
          </div>
          <div className="max-w-2xl space-y-2 text-sm">
            <p className="font-medium">{copy.headline || "Headline not set"}</p>
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
            <div className="flex min-w-0 items-center gap-3 border-t pt-3 text-xs">
              {ctaLabel && <Badge variant="secondary">{ctaLabel}</Badge>}
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
