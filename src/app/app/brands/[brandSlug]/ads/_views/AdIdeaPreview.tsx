"use client";
import { AdPreviewSlide } from "./AdPreviewSlide";
import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { AdCreativeContent } from "@/server/db/ads-schema";
import { AdDestinationPreview, PrimaryTextPreview } from "./AdCopyPreview";
import { MetaPlacementPreviews } from "./MetaPlacementPreviews";
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
  const [platformOpen, setPlatformOpen] = useState(false);
  const platformPreview = () => (
    <MetaPlacementPreviews
      content={content}
      copy={content ?? studio.document.copy}
      brandId={brandId}
      brandName={brandName}
      brandLogo={brandLogo}
      feedShape={shape}
    />
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
          <PrimaryTextPreview body={copy.body} />
          {/* Each card as Meta draws it: the image, then its headline and
              description with the button beside them. A blank card shows the
              ad's own words, as Meta does. */}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {media.map((item, index) => {
              const headline = item.headline || copy.headline;
              const description =
                item.description || copy.description?.trim() || "";
              return (
                <AdPreviewSlide
                  key={index}
                  url={item.url}
                  index={index}
                  headline={headline}
                  description={description}
                />
              );
            })}
          </div>
          <AdDestinationPreview
            linkUrl={copy.linkUrl}
            callToAction={copy.callToAction}
          />
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
