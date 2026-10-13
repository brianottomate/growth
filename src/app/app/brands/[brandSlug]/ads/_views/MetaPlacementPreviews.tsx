"use client";

import { useState } from "react";
import type { AdCreativeContent } from "@/server/db/ads-schema";
import { metaPreviewMedia } from "@/lib/meta-preview";
import { CompactAdMock } from "@/components/ad-mock";
import { META_PLACEMENTS, type MetaPlacement } from "@/lib/meta-placement-plan";
import type { IdeaShape } from "@/lib/ad-idea-studio";

type PreviewCopy = Pick<
  AdCreativeContent,
  "body" | "headline" | "description" | "linkUrl" | "callToAction"
>;

/** Facebook feed, Instagram feed and Stories/Reels, each with the media the push sends there. */
export function MetaPlacementPreviews({
  content,
  copy,
  brandId,
  brandName,
  brandLogo,
  feedShape,
}: {
  content?: AdCreativeContent;
  copy: PreviewCopy;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  feedShape: IdeaShape;
}) {
  const [cards, setCards] = useState<Partial<Record<MetaPlacement, number>>>(
    {},
  );
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] items-start gap-4">
      {META_PLACEMENTS.filter((surface) =>
        ["facebook-feed", "instagram-feed", "facebook-story"].includes(
          surface.id,
        ),
      ).map((surface) => {
        const label =
          surface.kind === "feed" ? surface.label : "Stories / Reels";
        const size = surface.kind !== "feed" ? "story" : feedShape;
        const resolved = content
          ? metaPreviewMedia(content, surface.id, brandId)
          : {
              media: [],
              issue: "Approve and save this idea before previewing.",
            };
        const surfaceMedia = resolved.media;
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
                crop={("crop" in resolved ? resolved.crop : undefined) ?? size}
                brandName={brandName}
                brandLogo={brandLogo}
                body={copy.body}
                headline={copy.headline}
                description={copy.description ?? null}
                link={copy.linkUrl ?? null}
                callToAction={copy.callToAction ?? null}
                media={surfaceMedia}
                card={Math.min(
                  cards[surface.id] ?? 0,
                  Math.max(0, surfaceMedia.length - 1),
                )}
                onCard={(next) =>
                  setCards((current) => ({ ...current, [surface.id]: next }))
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
  );
}
