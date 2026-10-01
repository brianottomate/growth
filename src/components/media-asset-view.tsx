"use client";

import { useState } from "react";
import { Play, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import type { MediaItem } from "@/server/db/schema";

/** A media asset viewer, with its original proportions and explicit playback. */
export function MediaAssetView({
  item,
  label = "Media",
  className,
}: {
  item: MediaItem;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const poster =
    item.thumbnail && item.thumbnail !== item.url ? item.thumbnail : undefined;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${label}`}
        className={cn(
          "group relative block size-full overflow-hidden rounded-lg bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {item.type === "video" ? (
          <>
            <video
              src={item.url}
              poster={poster}
              muted
              playsInline
              preload={poster ? "none" : "metadata"}
              className="size-full object-contain"
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/65 p-2 text-white">
                <Play className="size-5" fill="currentColor" />
              </span>
            </span>
          </>
        ) : (
          // oxlint-disable-next-line nextjs/no-img-element
          <img
            src={item.thumbnail || item.url}
            alt={label}
            loading="lazy"
            className="size-full object-contain"
          />
        )}
        <Maximize2 className="pointer-events-none absolute top-2 right-2 size-4 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[90dvh] w-[94vw] max-w-[94vw] flex-col overflow-hidden sm:max-w-[94vw]">
          <DialogTitle className="pr-8">{label}</DialogTitle>
          <DialogDescription>
            {item.type === "video"
              ? "Play the original video."
              : "View the original image."}
          </DialogDescription>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            {open &&
              (item.type === "video" ? (
                <video
                  key={item.url}
                  src={item.url}
                  poster={poster}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                // oxlint-disable-next-line nextjs/no-img-element
                <img
                  src={item.url}
                  alt={label}
                  className="max-h-full max-w-full object-contain"
                />
              ))}
          </div>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="self-end"
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
