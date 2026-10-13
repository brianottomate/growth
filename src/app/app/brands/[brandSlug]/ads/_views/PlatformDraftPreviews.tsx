"use client";

import type { Ad } from "@/server/db/ads-schema";
import { AdIdeaPreview } from "./AdIdeaPreview";
import { VideoAdPreview } from "./VideoAdPreview";
import { adFormatOf } from "@/lib/performance-ads";
import { posterForMedia } from "@/lib/media-url";
import { ideaDocumentFromAd } from "@/lib/ad-idea-studio";

export function PlatformDraftPreviews({
  ads,
  brandId,
  brandName,
  brandLogo,
}: {
  ads: Ad[];
  brandId: string;
  brandName: string;
  brandLogo: string | null;
}) {
  if (!ads.length) return null;
  return (
    <section
      className="space-y-3 border-t pt-4"
      aria-label="Studio creative previews"
    >
      <h4 className="text-sm font-medium">Creative previews · {ads.length}</h4>
      <p className="text-xs text-muted-foreground">
        Live Studio ideas for this plan. Approve and assign them before they can
        publish.
      </p>
      <div className="grid grid-cols-1 gap-3">
        {ads.map((ad) => {
          if (!("media" in ad.content)) return null;
          const content = ad.content;
          const video = adFormatOf(content) === "video";
          const cover = content.media[0] && posterForMedia(content.media[0]);
          return (
            <details
              key={ad.id}
              className="group min-w-0 rounded-lg border p-3"
            >
              <summary className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                {cover && (
                  <img
                    src={cover}
                    alt=""
                    className="size-16 shrink-0 rounded-md object-cover"
                  />
                )}
                <span>
                  {ad.name}
                  <span className="block text-xs font-normal text-muted-foreground">
                    Studio draft · {adFormatOf(content)}
                  </span>
                </span>
              </summary>
              <div className="mt-3 max-w-xl space-y-3">
                {video ? (
                  <VideoAdPreview
                    content={content}
                    brandId={brandId}
                    brandName={brandName}
                    brandLogo={brandLogo}
                  />
                ) : (
                  <AdIdeaPreview
                    studio={
                      content.ideaStudio ?? {
                        document: ideaDocumentFromAd({
                          name: ad.name,
                          content,
                        }),
                      }
                    }
                    brandId={brandId}
                    brandName={brandName}
                    brandLogo={brandLogo}
                    content={content}
                  />
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
