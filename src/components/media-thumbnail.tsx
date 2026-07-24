"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";

function retryableSource(src: string, attempt: number) {
  if (!attempt) return src;
  try {
    const url = new URL(src);
    if (!url.hostname.endsWith(".r2.dev")) return src;
    url.searchParams.set("_growth_retry", String(attempt));
    return url.toString();
  } catch {
    return src;
  }
}

/**
 * Content media can be several megabytes. Keep the tile intentional while the
 * full original loads and retry one transient R2 miss instead of leaving a
 * browser broken-image glyph behind.
 */
export function MediaThumbnail({
  src,
  alt = "",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  const resolvedSrc = useMemo(
    () => retryableSource(src, attempt),
    [attempt, src],
  );

  useEffect(() => {
    setState("loading");
    const image = new window.Image();
    image.onload = () => setState("loaded");
    image.onerror = () => setState("failed");
    image.src = resolvedSrc;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [resolvedSrc]);

  useEffect(() => setAttempt(0), [src]);

  useEffect(() => {
    if (state !== "failed" || attempt > 0) return;
    const retry = window.setTimeout(() => {
      setAttempt(1);
      setState("loading");
    }, 1_000);
    return () => window.clearTimeout(retry);
  }, [attempt, state]);

  return (
    <>
      {state !== "loaded" && (
        <span className="bg-muted absolute inset-0 flex items-center justify-center">
          {state === "failed" && attempt > 0 ? (
            <ImageOff className="text-muted-foreground size-4" />
          ) : (
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          )}
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={resolvedSrc}
        src={resolvedSrc}
        alt={alt}
        className={cn(
          "transition-opacity",
          state === "loaded" ? "opacity-100" : "opacity-0",
          className,
        )}
        loading="lazy"
        decoding="async"
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
      />
    </>
  );
}
