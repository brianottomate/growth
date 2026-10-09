"use client";

import { ctaLabel } from "@/components/ad-mock";
import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlatformAd } from "@/server/db/ads-schema";
import { money } from "./format";

/** Creative media and copy, without inventing a placement or provider CTA. */
export function MetaCreativePreview({
  name,
  headline,
  body,
  linkUrl,
  media,
  thumbnailUrl,
  planHref,
  manageUrl,
  status,
  stats,
  description,
  callToAction,
  actions,
}: {
  name: string | null;
  headline?: string | null;
  body?: string | null;
  linkUrl?: string | null;
  media?: PlatformAd["media"];
  thumbnailUrl?: string | null;
  planHref?: string;
  manageUrl?: string | null;
  status?: string | null;
  stats?: PlatformAd["stats"];
  description?: string | null;
  callToAction?: string | null;
  actions?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const cards = media ?? [];
  const selectedIndex = Math.min(index, Math.max(0, cards.length - 1));
  const current = cards[selectedIndex];
  return (
    <article className="overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h6 className="min-w-0 flex-1 text-sm font-medium">
          {name ?? "Meta ad"}
        </h6>
        {status && (
          <span className="text-xs text-muted-foreground capitalize">
            {status}
          </span>
        )}
        {planHref && (
          <a
            href={planHref}
            aria-label={`View ${name ?? "ad"} in campaign ads`}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <Hash className="size-4" />
          </a>
        )}
        {actions}
        {manageUrl && (
          <a
            href={manageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:underline"
          >
            Open in Meta ↗
          </a>
        )}
      </div>
      <div className="grid grid-cols-1 @xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="min-w-0 bg-muted/30">
          {current?.type === "video" ? (
            <video
              controls
              src={current.url}
              poster={current.thumbnail ?? undefined}
              className="max-h-96 w-full object-contain"
            />
          ) : current?.url || thumbnailUrl ? (
            // oxlint-disable-next-line nextjs/no-img-element
            <img
              src={current?.url ?? thumbnailUrl!}
              alt={headline ?? name ?? "Ad artwork"}
              className="max-h-96 w-full object-contain"
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              Artwork unavailable
            </p>
          )}
          {cards.length > 1 && (
            <div className="flex items-center justify-center gap-3 p-2">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Previous carousel card"
                disabled={selectedIndex === 0}
                onClick={() => setIndex(selectedIndex - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {selectedIndex + 1} / {cards.length}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Next carousel card"
                disabled={selectedIndex >= cards.length - 1}
                onClick={() => setIndex(selectedIndex + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-3 p-4">
          {body && <p className="text-sm whitespace-pre-wrap">{body}</p>}
          {headline && <p className="font-semibold">{headline}</p>}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          {callToAction && (
            <p className="text-xs font-medium">{ctaLabel(callToAction)}</p>
          )}
          {linkUrl && (
            <a
              href={linkUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-xs break-all text-muted-foreground hover:underline"
            >
              {linkUrl} ↗
            </a>
          )}
          {stats?.spend != null && (
            <p className="text-xs text-muted-foreground">
              {money(stats.spend)} spent
              {stats.ctr != null ? ` · ${stats.ctr}% CTR` : ""}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
