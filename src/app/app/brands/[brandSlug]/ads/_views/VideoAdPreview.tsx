"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { AdCreativeContent } from "@/server/db/ads-schema";
import { AdDestinationPreview, PrimaryTextPreview } from "./AdCopyPreview";
import { AdSlideCopy } from "./AdSlideCopy";
import { MetaPlacementPreviews } from "./MetaPlacementPreviews";

type Size = "feed" | "story";

function sizeLabel(size: Size, file?: { width?: number; height?: number }) {
  if (size === "story") return "Story · 9:16";
  if (!file?.width || !file.height) return "Feed";
  const ratio = file.width / file.height;
  if (Math.abs(ratio - 4 / 5) < 0.02) return "Feed · 4:5";
  if (Math.abs(ratio - 1) < 0.02) return "Feed · 1:1";
  if (Math.abs(ratio - 16 / 9) < 0.02) return "Feed · 16:9";
  return "Feed";
}

/** The compact video ad: its copy, the clip per placement size, and the Meta mocks. */
export function VideoAdPreview({
  content,
  brandId,
  brandName,
  brandLogo,
  showMetaPreview = true,
}: {
  content: AdCreativeContent;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  /** The studio card leaves the placement mocks to the platform plan. */
  showMetaPreview?: boolean;
}) {
  const base = content.media[0];
  const story = base?.story;
  const sizes: Size[] = story ? ["feed", "story"] : ["feed"];
  const [size, setSize] = useState<Size>("feed");
  const [metaOpen, setMetaOpen] = useState(false);
  const file = size === "story" && story ? story : base;
  return (
    <div className="space-y-4">
      {sizes.length > 1 && (
        <div
          role="group"
          aria-label="Preview size"
          className="flex w-fit flex-wrap rounded-lg border p-0.5"
        >
          {sizes.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={size === option ? "secondary" : "ghost"}
              aria-pressed={size === option}
              onClick={() => setSize(option)}
            >
              {sizeLabel(option, option === "story" ? story : base)}
            </Button>
          ))}
        </div>
      )}
      <PrimaryTextPreview body={content.body} />
      {file ? (
        <div className={size === "story" ? "w-52" : "w-64"}>
          <video
            key={file.url}
            src={file.url}
            poster={file.thumbnail}
            controls
            playsInline
            preload="metadata"
            aria-label={size === "story" ? "Story / Reels cut" : "Feed video"}
            className="block w-full rounded-t-lg bg-black"
          />
          <AdSlideCopy
            headline={content.headline}
            description={content.description}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Start with a video
        </div>
      )}
      <AdDestinationPreview
        linkUrl={content.linkUrl}
        callToAction={content.callToAction}
      />
      {showMetaPreview && base && (
        <div className="border-t pt-2">
          <Collapsible open={metaOpen} onOpenChange={setMetaOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <ChevronRight
                  aria-hidden="true"
                  className={`size-3.5 transition-transform ${metaOpen ? "rotate-90" : ""}`}
                />
                Meta preview
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pt-3">
                <MetaPlacementPreviews
                  content={content}
                  copy={content}
                  brandId={brandId}
                  brandName={brandName}
                  brandLogo={brandLogo}
                  feedShape="portrait"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
