"use client";

import { useState } from "react";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/ui/dropzone";
import { toast } from "@/components/ui/toast";
import type { WallCard } from "@/lib/ad-wall";
import { MEDIA_ACCEPT } from "@/lib/media-accept";

const VIDEO_ACCEPT = Object.fromEntries(
  Object.entries(MEDIA_ACCEPT).filter(([mime]) => mime.startsWith("video/")),
);

function aspectLabel(file: { width?: number; height?: number }) {
  if (!file.width || !file.height) return "Aspect unknown";
  const ratio = file.width / file.height;
  const shape = [
    [1, "1:1"],
    [4 / 5, "4:5"],
    [9 / 16, "9:16"],
    [16 / 9, "16:9"],
  ] as const;
  return (
    shape.find(([value]) => Math.abs(ratio - value) < 0.02)?.[1] ??
    `${file.width} × ${file.height}`
  );
}

export function VideoPlacementVariants({
  card,
  brandId,
  locked,
  busy,
  onChooseFeed,
  onUploadFeed,
  onSetStory,
  onUploadStory,
  onClearStory,
  onUseRendition,
}: {
  card?: WallCard;
  brandId: string;
  locked: boolean;
  busy: boolean;
  onChooseFeed: () => void;
  onUploadFeed: (files: File[]) => Promise<void>;
  onSetStory: (assetId: string) => void;
  onUploadStory: (files: File[]) => Promise<void>;
  onClearStory: () => void;
  onUseRendition: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const story = card?.story;
  const upload = async (files: File[], vertical: boolean) => {
    try {
      await (vertical ? onUploadStory(files) : onUploadFeed(files));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  };
  return (
    <div className="@container space-y-2">
      <p className="text-xs font-medium">Video sizes and placements</p>
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        {(["feed", "story"] as const).map((slot) => {
          const vertical = slot === "story";
          const file = vertical ? story : card;
          return (
            <div key={slot} className="min-w-0 space-y-2 rounded-xl border p-3">
              <p className="text-xs font-medium">
                {vertical ? "Meta Stories / Reels · 9:16" : "Meta Feed"}
              </p>
              <p className="text-[11px] text-muted-foreground" role="status">
                {file
                  ? `Ready · ${aspectLabel(file)}`
                  : vertical
                    ? "Missing · add a 9:16 video cut"
                    : "Missing · add a feed clip"}
              </p>
              {file && (
                <video
                  key={file.url}
                  src={file.url}
                  poster={file.thumbnail ?? undefined}
                  controls
                  playsInline
                  preload="none"
                  aria-label={
                    vertical ? "Stories and Reels video" : "Feed video"
                  }
                  className="h-40 w-full rounded-lg bg-black object-contain"
                />
              )}
              {!locked && (
                <>
                  <Dropzone
                    compact
                    accept={VIDEO_ACCEPT}
                    multiple={false}
                    disabled={busy || (vertical && !card)}
                    title={
                      vertical ? "Upload a 9:16 cut" : "Upload a feed clip"
                    }
                    onFiles={(files) => void upload(files, vertical)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || (vertical && !card)}
                      onClick={vertical ? () => setPicking(true) : onChooseFeed}
                    >
                      {file ? "Replace from library" : "Choose from library"}
                    </Button>
                    {vertical && card && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={onUseRendition}
                      >
                        Use prepared 9:16
                      </Button>
                    )}
                    {vertical && story && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={onClearStory}
                      >
                        Remove variant
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Meta uses the feed clip as the default and the 9:16 cut for Stories and
        Reels.
      </p>
      {picking && (
        <MediaPickerDialog
          brandId={brandId}
          open
          kind="video"
          onOpenChange={setPicking}
          existingAssetIds={story?.assetId ? [story.assetId] : []}
          onPick={(item) => {
            if (item.assetId) onSetStory(item.assetId);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
