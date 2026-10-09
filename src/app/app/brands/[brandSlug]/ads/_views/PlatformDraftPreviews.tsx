"use client";

import type { Ad } from "@/server/db/ads-schema";
import { AdIdeaPreview } from "./AdIdeaPreview";
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
          return (
            <details
              key={ad.id}
              className="group min-w-0 rounded-lg border p-3"
            >
              <summary className="cursor-pointer text-sm font-medium">
                {content.media[0]?.url && (
                  <img
                    src={content.media[0].url}
                    alt=""
                    className="mb-3 aspect-square w-full rounded-md object-cover group-open:hidden"
                  />
                )}
                {ad.name}
                <span className="block text-xs font-normal text-muted-foreground">
                  Studio draft · {content.format ?? "static"}
                </span>
              </summary>
              <div className="mt-3 space-y-3">
                <AdIdeaPreview
                  studio={
                    content.ideaStudio ?? {
                      document: ideaDocumentFromAd({ name: ad.name, content }),
                    }
                  }
                  brandId={brandId}
                  brandName={brandName}
                  brandLogo={brandLogo}
                  content={content}
                />
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
