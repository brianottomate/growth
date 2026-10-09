"use client";

import { Check, CircleAlert, ImageIcon, Play } from "lucide-react";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { MediaThumbnail } from "@/components/media-thumbnail";
import { cn } from "@/components/ui/lib/utils";
import type { MediaItem } from "@/server/db/schema";
import { isStoryFormat, sequenceNoun } from "@/lib/platform-sequence";
import { SocialPostMock } from "@/components/social-mock";

export type CompactPreviewLinkCard = {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  image: string | null;
  predicted?: boolean;
};

export type CompactPreviewItem = {
  id: string;
  text: string;
  media: MediaItem[];
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

function PreviewMedia({
  item,
  platform,
  format,
  contentTitle,
  fallbackImage,
  play,
}: {
  item: CompactPreviewItem;
  platform: string;
  format: string | null;
  contentTitle: string;
  fallbackImage?: string | null;
  play: boolean;
}) {
  const firstMedia = item.media[0];
  if (!firstMedia && !fallbackImage) return null;
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-muted",
        cropClass(format, platform),
      )}
    >
      {firstMedia?.type === "video" && play ? (
        <video
          src={firstMedia.url}
          poster={
            firstMedia.thumbnail && firstMedia.thumbnail !== firstMedia.url
              ? firstMedia.thumbnail
              : undefined
          }
          aria-label={`${platformLabel(platform)} preview for ${contentTitle}`}
          className="size-full bg-black object-cover"
          controls
          playsInline
          preload="metadata"
        />
      ) : firstMedia?.type === "video" && !firstMedia.thumbnail ? (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted">
          <span className="flex size-9 items-center justify-center rounded-full bg-foreground/90 text-background">
            <Play className="ml-0.5 size-4 fill-current" />
          </span>
        </div>
      ) : firstMedia ? (
        <MediaThumbnail
          src={firstMedia.url}
          thumbnail={firstMedia.thumbnail}
          kind={firstMedia.type}
          alt={`${platformLabel(platform)} preview for ${contentTitle}`}
          className="object-cover"
          sizes="256px"
        />
      ) : (
        // oxlint-disable-next-line nextjs/no-img-element -- arbitrary external OG hosts
        <img
          src={fallbackImage ?? ""}
          alt=""
          className="size-full object-cover"
        />
      )}
      {item.media.length > 1 && (
        <span className="absolute top-1.5 right-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
          1/{item.media.length}
        </span>
      )}
    </div>
  );
}

export function CompactPlatformPreview({
  className,
  platform,
  format,
  channelName,
  channelProfileImageUrl,
  channelBannerImageUrl,
  username,
  brandName,
  contentTitle,
  text,
  media,
  threadItems,
  linkCard,
  firstComment,
  scheduled,
  caption,
  readiness,
  play = true,
}: {
  className?: string;
  platform: string;
  format: string | null;
  channelName: string | null;
  channelProfileImageUrl?: string | null;
  channelBannerImageUrl?: string | null;
  username: string | null;
  brandName: string;
  contentTitle: string;
  text: string;
  media: MediaItem[];
  threadItems?: CompactPreviewItem[];
  linkCard?: CompactPreviewLinkCard | null;
  firstComment?: string | null;
  scheduled: boolean;
  /** Header note; defaults to the plan-mode "Representative" / item count. */
  caption?: string;
  /**
   * Show the Visual / Copy / Schedule readiness dots. On for planned posts;
   * off when the preview shows an already-published post pulled from a
   * platform (the brand page's backfill samples).
   */
  readiness?: boolean;
  /**
   * Play video in place (default), where an operator reviews the post. The
   * brand page's backfill samples pass false: their provider URLs expire,
   * and the rehosted poster is what still loads.
   */
  play?: boolean;
}) {
  const identity = channelName ?? username ?? brandName;
  const items =
    threadItems?.length && threadItems.length > 0
      ? threadItems
      : [{ id: "root", text, media }];
  const isThread = items.length > 1;
  const story = isStoryFormat(format);
  const hasVisual =
    items.some((item) => item.media.length > 0) || !!linkCard?.image;
  const hasCopy = story || items.every((item) => item.text.trim());

  return (
    <aside
      className={cn(
        "mx-auto w-full max-w-64 self-start rounded-xl border bg-background/50 p-2.5 @4xl:mx-0",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <ChannelLogo
          platform={
            ["newsletter.broadcast", "newsletter.blast"].includes(format ?? "")
              ? "blast"
              : platform
          }
          className="size-3.5"
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {platformLabel(platform)}{" "}
          {story ? "Story" : isThread ? "thread" : "preview"}
        </span>
        <span className="truncate text-[9px] text-muted-foreground">
          {caption ??
            (story || isThread
              ? `${items.length} ${sequenceNoun(format, items.length)}`
              : "Representative")}
        </span>
      </div>

      {/* Facebook and Instagram feed posts draw the same mock as the brand
          previews and the ad previews, so the workbench shows what ships. */}
      {!story &&
      !isThread &&
      !linkCard &&
      (platform === "facebook" || platform === "instagram") ? (
        <SocialPostMock
          post={{
            platform,
            format,
            name: channelName ?? brandName,
            handle: username,
            avatars: [{ url: channelProfileImageUrl }],
            text,
            media,
            meta: scheduled ? "Scheduled" : "Draft",
          }}
          play={play}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
          {channelBannerImageUrl && (
            <div className="relative h-10 overflow-hidden border-b">
              {/* oxlint-disable-next-line nextjs/no-img-element -- channel images may use arbitrary provider hosts */}
              <img
                src={channelBannerImageUrl}
                alt=""
                className="size-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
          )}
          {items.map((item, index) => (
            <div
              key={item.id}
              className={cn(index > 0 && "border-t border-border")}
            >
              <div className="flex items-center gap-2 px-2.5 py-2">
                {channelProfileImageUrl ? (
                  // oxlint-disable-next-line nextjs/no-img-element -- channel images may use arbitrary provider hosts
                  <img
                    src={channelProfileImageUrl}
                    alt=""
                    className="size-6 rounded-full border bg-muted object-cover"
                  />
                ) : (
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
                    {identity.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                  {identity}
                </span>
                {(story || isThread) && (
                  <span className="text-[9px] text-muted-foreground">
                    {index + 1}/{items.length}
                  </span>
                )}
              </div>

              <PreviewMedia
                item={item}
                platform={platform}
                format={format}
                contentTitle={contentTitle}
                play={play}
                fallbackImage={
                  index === 0 && item.media.length === 0
                    ? linkCard?.image
                    : null
                }
              />

              <div className="px-2.5 py-2">
                {story ? (
                  item.text.trim() ? (
                    <p className="line-clamp-2 text-[9px] leading-relaxed whitespace-pre-wrap text-muted-foreground italic">
                      Internal note: {item.text}
                    </p>
                  ) : null
                ) : item.text.trim() ? (
                  <p className="line-clamp-4 text-[10px] leading-relaxed whitespace-pre-wrap">
                    {item.text}
                  </p>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground italic">
                    <ImageIcon className="size-3" />
                    No post copy yet.
                  </div>
                )}
              </div>
            </div>
          ))}

          {linkCard && (
            <div className="border-t px-2.5 py-2">
              <div className="truncate text-[8px] tracking-wide text-muted-foreground uppercase">
                {linkCard.domain}
                {linkCard.predicted ? " · predicted" : ""}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[10px] font-medium">
                {linkCard.title ?? linkCard.url}
              </div>
            </div>
          )}
        </div>
      )}
      {firstComment?.trim() && (
        <div className="mt-2 rounded-lg border p-3">
          <p className="text-[9px] font-medium text-muted-foreground">
            First comment
          </p>
          <p className="mt-1 text-[10px] whitespace-pre-wrap">{firstComment}</p>
        </div>
      )}

      {readiness !== false && (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
          <ReadyDot ready={hasVisual} label="Visual" />
          {!story && <ReadyDot ready={hasCopy} label="Copy" />}
          <ReadyDot ready={scheduled} label="Schedule" />
        </div>
      )}
    </aside>
  );
}
