"use client";

import { useRef } from "react";

import { cn } from "@/components/ui/lib/utils";

/**
 * A muted clip that plays while the pointer is over it and shows its poster
 * otherwise, for tiles too small for controls. Nothing downloads until hover.
 */
export function HoverVideo({
  src,
  poster,
  className,
}: {
  src: string;
  poster?: string | null;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      muted
      loop
      playsInline
      preload="none"
      onMouseEnter={() => void ref.current?.play().catch(() => undefined)}
      onMouseLeave={() => {
        const video = ref.current;
        if (!video) return;
        video.pause();
        video.currentTime = 0;
      }}
      className={cn("bg-black", className)}
    />
  );
}
