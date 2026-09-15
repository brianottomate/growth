"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Film, ImageOff, Loader2 } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";

function cacheBusted(src: string) {
  try {
    const url = new URL(src);
    if (!url.hostname.endsWith(".r2.dev")) return src;
    url.searchParams.set("_growth_retry", "1");
    return url.toString();
  } catch {
    return src;
  }
}

/**
 * Grid tile for content media.
 *
 * Two layers of downscaling, because originals are routinely multi-megabyte
 * 2000px+ PNGs: prefer the WebP tile written at upload time, and run whatever
 * we show through next/image so the bytes on the wire match the rendered size.
 *
 * Sources are tried in order — tile, then original, then one cache-busted retry
 * of the original — so an asset uploaded before tiles existed, or one whose
 * tile PUT failed, still renders instead of showing a broken-image glyph.
 */
export function MediaThumbnail({
  src,
  thumbnail,
  kind,
  alt = "",
  className,
  sizes = "(max-width: 640px) 33vw, 200px",
}: {
  src: string;
  /** Downscaled tile, when the asset has one. */
  thumbnail?: string | null;
  /** Video needs its poster or nothing; `src` is a .mov, not an image. */
  kind?: "image" | "video" | "carousel";
  alt?: string;
  className?: string;
  sizes?: string;
}) {
  const isVideo = kind === "video";
  const candidates = useMemo(() => {
    // Falling back to `src` for a video hands next/image a .mov: it fails
    // every candidate and lands on the broken-image glyph, having tried to
    // pull the whole file down on the way. A video has its poster or nothing.
    const ordered = isVideo ? [thumbnail] : [thumbnail, src, cacheBusted(src)];
    return [
      ...new Set(
        ordered.filter((candidate): candidate is string => Boolean(candidate)),
      ),
    ];
  }, [src, thumbnail, isVideo]);

  const [index, setIndex] = useState(0);
  const [state, setState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );

  useEffect(() => {
    setIndex(0);
    setState("loading");
  }, [candidates]);

  // A video with no poster is a known state, not a failure: say "video"
  // rather than showing the same broken glyph a dead image gets.
  if (!candidates.length) {
    return (
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted">
        {isVideo ? (
          <Film className="size-4 text-muted-foreground" />
        ) : (
          <ImageOff className="size-4 text-muted-foreground" />
        )}
        {isVideo && (
          <span className="text-[9px] text-muted-foreground">Video</span>
        )}
      </span>
    );
  }

  const current = candidates[Math.min(index, candidates.length - 1)] ?? src;
  const exhausted = index >= candidates.length - 1;

  return (
    <>
      {state !== "loaded" && (
        <span className="absolute inset-0 flex items-center justify-center bg-muted">
          {state === "failed" ? (
            isVideo ? (
              <Film className="size-4 text-muted-foreground" />
            ) : (
              <ImageOff className="size-4 text-muted-foreground" />
            )
          ) : (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </span>
      )}
      <Image
        key={current}
        src={current}
        alt={alt}
        fill
        sizes={sizes}
        className={cn(
          "transition-opacity",
          state === "loaded" ? "opacity-100" : "opacity-0",
          className,
        )}
        onLoad={() => setState("loaded")}
        onError={() => {
          if (exhausted) setState("failed");
          else setIndex((current) => current + 1);
        }}
      />
    </>
  );
}
