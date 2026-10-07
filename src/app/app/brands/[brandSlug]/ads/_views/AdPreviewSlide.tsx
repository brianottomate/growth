"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { AdSlideCopy } from "./AdSlideCopy";

/** Shared image and platform copy for compact and expanded ad previews. */
export function AdPreviewSlide({
  url,
  index,
  headline,
  description,
  controls,
}: {
  url: string;
  index: number;
  headline: string;
  description: string;
  controls?: ReactNode;
}) {
  return (
    <div className="w-52 shrink-0">
      <div className="relative overflow-hidden rounded-t-lg">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open slide ${index + 1} at full size`}
        >
          <Image
            src={url}
            alt={`Slide ${index + 1}`}
            width={300}
            height={375}
            unoptimized
            className="h-auto w-full"
          />
        </a>
        {controls}
      </div>
      <AdSlideCopy headline={headline} description={description} />
    </div>
  );
}
