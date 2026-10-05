"use client";
import Link from "next/link";
import { ImageIcon, CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaAssetView } from "@/components/media-asset-view";
import { ChannelLogo } from "@/components/channel-logos";
import type { ChannelPlatform } from "@/server/db/schema";
type PreviewMedia = {
  url: string;
  type: "image" | "video" | "carousel";
  thumbnail: string | null;
};
export function previewDate(start: string | null, end?: string | null) {
  const format = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(date));
  if (!start && !end) return null;
  return start && end && start !== end
    ? `${format(start)} to ${format(end)}`
    : format(start ?? end!);
}
export function WorkPreview({
  title,
  href,
  brand,
  status,
  description,
  media = [],
  platforms = [],
  detail,
  date,
  inherited,
  onUnlink,
  unlinking,
  compact = false,
  creativeLines = [],
  board = false,
  execution,
  delivery,
  textOnly = false,
}: {
  title: string;
  href: string;
  brand: string;
  status: string;
  description?: string | null;
  media?: PreviewMedia[];
  platforms?: ChannelPlatform[];
  detail?: string;
  date?: string | null;
  inherited?: boolean;
  onUnlink?: () => void;
  unlinking?: boolean;
  compact?: boolean;
  creativeLines?: string[];
  board?: boolean;
  execution?: string;
  delivery?: string;
  textOnly?: boolean;
}) {
  const channels = [...new Set(platforms)];
  return (
    <article className="group overflow-hidden rounded-xl border bg-card transition-colors hover:border-muted-foreground/40">
      {board && (
        <div className="flex justify-end px-3 pt-3">
          <span className="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground capitalize">
            {delivery ?? status.replaceAll("_", " ")}
          </span>
        </div>
      )}
      {compact && media.length > 0 && (
        <div className="grid grid-cols-3 gap-1 border-b bg-muted/30 p-2">
          {media.map((m, idx) => (
            <div key={`${m.url}:${idx}`} className="h-20 min-w-0">
              <MediaAssetView
                item={{ ...m, thumbnail: m.thumbnail ?? undefined }}
                label={`${title} artwork ${idx + 1}`}
              />
            </div>
          ))}
        </div>
      )}
      <div className={board ? "flex flex-col gap-2 p-3" : "flex gap-4 p-4"}>
        {!compact && (
          <div
            className={
              board ? "h-48 w-full shrink-0" : "h-32 w-24 shrink-0 @xl:w-28"
            }
          >
            {media[0] ? (
              <MediaAssetView
                item={{
                  ...media[0],
                  thumbnail: media[0].thumbnail ?? undefined,
                }}
                label={`${title} artwork`}
              />
            ) : (
              <div className="flex size-full items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 p-2 text-center text-xs text-muted-foreground">
                <ImageIcon className={board ? "size-3" : "size-5"} />
                <span>{textOnly ? "Text creative" : "No artwork yet"}</span>
              </div>
            )}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={href}
              className="line-clamp-2 text-sm leading-snug font-semibold hover:underline"
            >
              {title}
            </Link>
            {onUnlink && (
              <div className="shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={unlinking}
                  onClick={onUnlink}
                  aria-label={`Unlink ${title}`}
                  title="Unlink from initiative"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
          {!board && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{brand}</span>
              <span className="rounded-md border px-1.5 py-0.5 capitalize">
                {status.replaceAll("_", " ")}
              </span>
              {delivery && (
                <span className="rounded-md border px-1.5 py-0.5">
                  {delivery}
                </span>
              )}
            </div>
          )}
          {description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
          {creativeLines.length > 0 && (
            <div className="space-y-1.5 border-l-2 pl-3 text-xs">
              {creativeLines.map((line, index) => (
                <p key={`${index}:${line}`} className="line-clamp-2">
                  {line}
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            {channels.length > 0 && (
              <div className="flex gap-1.5">
                {channels.map((channel) => (
                  <span key={channel} title={channel}>
                    <ChannelLogo platform={channel} className="size-4" />
                  </span>
                ))}
              </div>
            )}
            {detail && <span>{detail}</span>}
            {date && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" />
                {date}
              </span>
            )}
          </div>
          {execution && (
            <p className="text-[11px] text-muted-foreground">{execution}</p>
          )}
          {inherited && (
            <p className="text-[11px] text-muted-foreground">
              Included through series
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
