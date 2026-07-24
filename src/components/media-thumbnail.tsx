"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ImageOff, Loader2 } from "lucide-react";

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
  alt = "",
  className,
  sizes = "(max-width: 640px) 33vw, 200px",
}: {
  src: string;
  /** Downscaled tile, when the asset has one. */
  thumbnail?: string | null;
  alt?: string;
  className?: string;
  sizes?: string;
}) {
  const candidates = useMemo(() => {
    const ordered = [thumbnail, src, cacheBusted(src)].filter(
      (candidate): candidate is string => Boolean(candidate),
    );
    return [...new Set(ordered)];
  }, [src, thumbnail]);

  const [index, setIndex] = useState(0);
  const [state, setState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );

  useEffect(() => {
    setIndex(0);
    setState("loading");
  }, [candidates]);

  const current = candidates[Math.min(index, candidates.length - 1)] ?? src;
  const exhausted = index >= candidates.length - 1;

  return (
    <>
      {state !== "loaded" && (
        <span className="bg-muted absolute inset-0 flex items-center justify-center">
          {state === "failed" ? (
            <ImageOff className="text-muted-foreground size-4" />
          ) : (
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
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
