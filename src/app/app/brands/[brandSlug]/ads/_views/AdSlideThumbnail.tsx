"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/components/ui/lib/utils";
import { getCompositionFormat } from "@/lib/compositions";
import { ideaEditorPreviewUrl, IDEA_SHAPE_LABELS } from "@/lib/ad-idea-studio";
import type { IdeaImage, IdeaShape } from "@/lib/ad-idea-studio";

export function AdSlideThumbnail({
  brandId,
  card,
  shape,
  index,
  selected,
  onSelect,
}: {
  brandId: string;
  card: IdeaImage;
  shape: IdeaShape;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const nextUrl = ideaEditorPreviewUrl(brandId, card, shape);
  const [url, setUrl] = useState(nextUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setUrl(nextUrl);
      setFailed(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [nextUrl]);
  const format = getCompositionFormat(shape);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Select slide ${index + 1}, ${IDEA_SHAPE_LABELS[shape]}${nextUrl === null ? ", awaiting artwork" : ""}`}
      className={cn(
        "w-24 shrink-0 rounded-lg border p-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected
          ? "border-foreground bg-accent"
          : "border-border hover:bg-muted",
      )}
    >
      <span className="flex h-24 items-center justify-center rounded bg-muted">
        <span
          className="relative block"
          style={{
            width:
              format.width >= format.height
                ? "100%"
                : `${(format.width / format.height) * 96}px`,
            height:
              format.width >= format.height
                ? `${(84 * format.height) / format.width}px`
                : "100%",
          }}
        >
          {nextUrl === null || failed ? (
            <span className="absolute inset-0 flex items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
              {nextUrl === null ? "Awaiting artwork" : "Preview unavailable"}
            </span>
          ) : url ? (
            <Image
              unoptimized
              fill
              loading="lazy"
              src={url}
              alt={`Slide ${index + 1}`}
              className="rounded object-contain"
              onError={() => setFailed(true)}
            />
          ) : null}
        </span>
      </span>
      <span className="mt-1.5 block text-xs">
        Slide {index + 1}
        {selected ? " · Selected" : ""}
      </span>
    </button>
  );
}
