"use client";

import { useState } from "react";
import { ArrowUpRight, Globe2 } from "lucide-react";
import { publicPreviewUrl, type WebPagePreview } from "@/lib/web-page-preview";

/** Compact social-style preview; source text remains available for inspection. */
export function WebPageUnfurl({
  url,
  title,
  preview,
  text,
}: {
  url: string;
  title?: string;
  preview?: WebPagePreview;
  text?: string;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const href = publicPreviewUrl(url);
  const imageUrl = href ? publicPreviewUrl(preview?.imageUrl, href) : undefined;
  const domain = href
    ? new URL(href).hostname.replace(/^www\./, "")
    : "Web page";
  const label = preview?.title || title || domain;
  const card = (
    <>
      {imageUrl && failedImage !== imageUrl && (
        <div className="aspect-[1.91/1] overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(imageUrl)}
          />
        </div>
      )}
      <div className="space-y-1.5 p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Globe2 className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {preview?.siteName ? `${preview.siteName} · ${domain}` : domain}
          </span>
          {href && <ArrowUpRight className="ml-auto h-3 w-3 shrink-0" />}
        </div>
        <p className="line-clamp-2 text-sm leading-snug font-semibold">
          {label}
        </p>
        {preview?.description && (
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {preview.description}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div className="min-w-0">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-lg border bg-background transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {card}
        </a>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background">
          {card}
        </div>
      )}
      {text && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            Read content
          </summary>
          <p className="mt-2 max-h-60 overflow-auto leading-relaxed break-words whitespace-pre-wrap">
            {text}
          </p>
        </details>
      )}
    </div>
  );
}
