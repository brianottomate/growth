"use client";

import { Check, CircleAlert, ImageIcon, Play } from "lucide-react";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { MediaThumbnail } from "@/components/media-thumbnail";
import { cn } from "@/components/ui/lib/utils";
import type { MediaItem } from "@/server/db/schema";

export type CompactPreviewLinkCard = {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  image: string | null;
  predicted?: boolean;
};

function cropClass(format: string | null, platform: string) {
  if (
    format?.includes(".story") ||
    format?.includes(".reel") ||
    format === "tiktok.video" ||
    format === "tiktok.photo" ||
    format === "youtube.short"
  ) {
    return "aspect-[9/12]";
  }
  if (
    format === "instagram.image" ||
    format === "instagram.carousel" ||
    platform === "instagram"
  ) {
    return "aspect-square";
  }
  if (platform === "pinterest") return "aspect-[4/5]";
  return "aspect-[16/9]";
}

function ReadyDot({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px]",
        ready ? "text-emerald-300" : "text-amber-300",
      )}
    >
      {ready ? (
        <Check className="size-3" />
      ) : (
        <CircleAlert className="size-3" />
      )}
      {label}
    </span>
  );
}

export function CompactPlatformPreview({
  className,
  platform,
  format,
  channelName,
  username,
  brandName,
  contentTitle,
  text,
  media,
  linkCard,
  scheduled,
}: {
  className?: string;
  platform: string;
  format: string | null;
  channelName: string | null;
  username: string | null;
  brandName: string;
  contentTitle: string;
  text: string;
  media: MediaItem[];
  linkCard?: CompactPreviewLinkCard | null;
  scheduled: boolean;
}) {
  const firstMedia = media[0];
  const identity = channelName ?? username ?? brandName;
  const hasVisual = Boolean(firstMedia || linkCard?.image);

  return (
    <aside
      className={cn(
        "bg-background/50 mx-auto w-full max-w-64 self-start rounded-xl border p-2.5 lg:mx-0",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <ChannelLogo
          platform={format === "newsletter.blast" ? "blast" : platform}
          className="size-3.5"
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {platformLabel(platform)} preview
        </span>
        <span className="text-muted-foreground text-[9px]">Representative</span>
      </div>

      <div className="bg-background overflow-hidden rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 px-2.5 py-2">
          <span className="bg-muted flex size-6 items-center justify-center rounded-full text-[9px] font-semibold">
            {identity.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate text-[11px] font-medium">{identity}</span>
        </div>

        <div
          className={cn(
            "bg-muted relative w-full overflow-hidden",
            cropClass(format, platform),
          )}
        >
          {firstMedia?.type === "video" && !firstMedia.thumbnail ? (
            <div className="from-muted via-background to-muted flex size-full items-center justify-center bg-gradient-to-br">
              <span className="bg-foreground/90 text-background flex size-9 items-center justify-center rounded-full">
                <Play className="ml-0.5 size-4 fill-current" />
              </span>
            </div>
          ) : firstMedia ? (
            <MediaThumbnail
              src={firstMedia.url}
              thumbnail={firstMedia.thumbnail}
              alt={`${platformLabel(platform)} preview for ${contentTitle}`}
              className="object-cover"
              sizes="256px"
            />
          ) : linkCard?.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external OG hosts
            <img
              src={linkCard.image}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <div className="from-muted via-background to-muted flex size-full min-h-32 flex-col items-center justify-center bg-gradient-to-br px-4 text-center">
              <ImageIcon className="text-muted-foreground size-5" />
              <p className="mt-2 line-clamp-2 text-[11px] font-medium">
                {contentTitle}
              </p>
              <p className="text-muted-foreground mt-1 text-[9px]">
                Visual not attached
              </p>
            </div>
          )}
          {media.length > 1 && (
            <span className="absolute top-1.5 right-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
              1/{media.length}
            </span>
          )}
        </div>

        <div className="px-2.5 py-2">
          {text.trim() ? (
            <p className="line-clamp-4 text-[10px] leading-relaxed whitespace-pre-wrap">
              {text}
            </p>
          ) : (
            <p className="text-muted-foreground text-[10px] italic">
              No channel copy yet.
            </p>
          )}
        </div>

        {linkCard && (
          <div className="border-t px-2.5 py-2">
            <div className="text-muted-foreground truncate text-[8px] tracking-wide uppercase">
              {linkCard.domain}
              {linkCard.predicted ? " · predicted" : ""}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[10px] font-medium">
              {linkCard.title ?? linkCard.url}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
        <ReadyDot ready={hasVisual} label="Visual" />
        <ReadyDot ready={Boolean(text.trim())} label="Copy" />
        <ReadyDot ready={scheduled} label="Schedule" />
      </div>
    </aside>
  );
}
