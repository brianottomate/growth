"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { MessageSquare, X } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { SimpleSelect } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { MediaThumbnail } from "@/components/media-thumbnail";
import { cn } from "@/components/ui/lib/utils";
import type { Member } from "@/components/assignment/assignee";
import type { MediaItem, PostStats } from "@/server/db/schema";
import { SpotOwnerControl } from "./OwnerControls";
import { STATUS_OPTIONS } from "./IdeaControls";
import { MarkScheduledButton } from "../MarkScheduledButton";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { SocialDeliveryControl } from "./SocialDeliveryControl";
import { StoryDeliveryControl } from "./StoryDeliveryControl";
import { getPlatformFormat } from "@/server/content/formats";
import { isStoryFormat, sequenceNoun } from "@/lib/platform-sequence";
import {
  CompactPlatformPreview,
  type CompactPreviewLinkCard,
} from "./CompactPlatformPreview";
import {
  PlatformPostEditDialog,
  type PlatformThreadItemData,
} from "./PlatformPostEditDialog";

const STATUS_PILL: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-300",
  scheduled: "bg-sky-500/15 text-sky-300",
  approved: "bg-amber-500/15 text-amber-300",
  draft: "bg-muted text-muted-foreground",
};

const VIA: Record<string, string> = {
  zernio: "Zernio",
  customerio: "Customer.io",
  native: "Static publish",
  manual: "Manual",
};

const titleCase = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

function formatLabel(
  format: string | null,
  archetype: string | null,
  template: string | null,
): string | null {
  if (template) return titleCase(template);
  if (format) {
    const registered = getPlatformFormat(format);
    if (registered) return registered.label;
  }
  if (format?.includes(".")) return titleCase(format.split(".")[1]!);
  if (archetype) return titleCase(archetype);
  return null;
}

const formatMetric = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`
    : `${value}`;

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const toLocalDateTimeInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export type SpotCardData = {
  id: string;
  updatedAtISO: string;
  channelId?: string | null;
  channelName?: string | null;
  channelProfileImageUrl?: string | null;
  channelBannerImageUrl?: string | null;
  platform: string;
  format: string | null;
  archetype: string | null;
  template: string | null;
  status: string;
  source: string;
  username: string | null;
  text: string | null;
  externalUrl: string | null;
  /** CMS editor deep link (Dato) for the source article. */
  editorUrl: string | null;
  /** In-app rendered preview for CMS-linked drafts. */
  previewPath: string | null;
  provider: string | null;
  scheduledAtISO: string | null;
  publishedAtISO: string | null;
  deliveryExternalId: string | null;
  deliveryStatus: string | null;
  deliveryError: string | null;
  publishingConnected: boolean;
  assetLinks: string[] | null;
  media: MediaItem[] | null;
  stats: PostStats | null;
  owner: Member | null;
  linkCard?: CompactPreviewLinkCard | null;
  threadItems?: PlatformThreadItemData[];
};

/**
 * A server-truth platform preview with operational controls around it. Chat is
 * the primary refinement path; manual copy, media, and link changes live in one
 * explicit editor so local form state can never mask a refreshed server value.
 */
export function SpotCard({
  spot,
  brandId,
  members,
  currentUserId,
  contentPostId,
  contentTitle,
  brandName,
}: {
  spot: SpotCardData;
  brandId: string;
  members: Member[];
  currentUserId: string;
  contentPostId: string;
  contentTitle: string;
  brandName: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const owned = spot.source === "owned";
  const story = isStoryFormat(spot.format);
  const providerPublishingPlatform =
    spot.platform === "instagram" ||
    spot.platform === "linkedin" ||
    spot.platform === "x" ||
    spot.platform === "facebook"
      ? spot.platform
      : null;
  const providerPublishing = providerPublishingPlatform !== null;
  const isEmail =
    spot.platform === "newsletter" &&
    (spot.format === "newsletter.broadcast" ||
      spot.format === "newsletter.blast");
  const refresh = { onSettled: () => router.refresh() };
  const setStatus = useMutation(
    trpc.content.setSpotStatus.mutationOptions(refresh),
  );
  const setSchedule = useMutation(
    trpc.content.setSpotSchedule.mutationOptions(refresh),
  );
  const removeSpot = useMutation(
    trpc.content.removeSpot.mutationOptions(refresh),
  );

  const label = formatLabel(spot.format, spot.archetype, spot.template);
  const via = spot.provider ? (VIA[spot.provider] ?? spot.provider) : null;
  const stats = spot.stats ?? {};
  const metrics = [
    stats.reach != null ? `${formatMetric(stats.reach)} reach` : null,
    stats.views != null ? `${formatMetric(stats.views)} views` : null,
    stats.likes != null ? `${formatMetric(stats.likes)} likes` : null,
    stats.comments != null ? `${formatMetric(stats.comments)} comments` : null,
  ].filter((metric): metric is string => metric !== null);
  const threadItems =
    spot.threadItems?.length && spot.threadItems.length > 0
      ? [...spot.threadItems].sort(
          (a, b) =>
            (a.sequence ?? Number.MAX_SAFE_INTEGER) -
            (b.sequence ?? Number.MAX_SAFE_INTEGER),
        )
      : [
          {
            id: spot.id,
            updatedAtISO: spot.updatedAtISO,
            text: spot.text,
            media: spot.media,
            assetLinks: spot.assetLinks,
            sequence: 0,
          },
        ];
  const isThread = threadItems.length > 1;
  const isSequence = story || isThread;
  const deliveredCount = threadItems.filter(
    (item) => item.deliveryExternalId,
  ).length;
  const media = threadItems.flatMap((item) => item.media ?? []);
  const assetLinks = [
    ...new Set(threadItems.flatMap((item) => item.assetLinks ?? [])),
  ];
  const scheduled =
    Boolean(spot.scheduledAtISO) ||
    spot.status === "scheduled" ||
    spot.status === "published";

  return (
    <div
      id={`platform-post-${spot.id}`}
      className="scroll-mt-6 rounded-2xl border bg-card p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <ChannelLogo
            platform={
              spot.format === "newsletter.blast" ? "blast" : spot.platform
            }
            className="size-6"
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">
              {spot.format === "newsletter.blast"
                ? "Email"
                : platformLabel(spot.platform)}
            </span>
            {spot.channelName && (
              <span className="text-xs text-muted-foreground">
                {spot.channelName}
              </span>
            )}
            {spot.username && (
              <span className="text-xs text-muted-foreground">
                {spot.username}
              </span>
            )}
            {label && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {label}
              </span>
            )}
            {isSequence && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {threadItems.length}{" "}
                {sequenceNoun(spot.format, threadItems.length)}
              </span>
            )}
            {owned ? (
              <SimpleSelect
                value={
                  STATUS_OPTIONS.some((option) => option.value === spot.status)
                    ? spot.status
                    : "draft"
                }
                onValueChange={(status) =>
                  setStatus.mutate({
                    platformPostId: spot.id,
                    status: status as never,
                  })
                }
                options={STATUS_OPTIONS}
                size="sm"
                aria-label="Spot status"
              />
            ) : (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                  STATUS_PILL[spot.status] ?? STATUS_PILL.draft,
                )}
              >
                {spot.status.replace("_", " ")}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {owned ? (
              <>
                {providerPublishing ? (
                  <input
                    type="datetime-local"
                    value={toLocalDateTimeInput(spot.scheduledAtISO)}
                    min={toLocalDateTimeInput(new Date().toISOString())}
                    onChange={(event) =>
                      setSchedule.mutate({
                        platformPostId: spot.id,
                        scheduledAt: event.target.value
                          ? new Date(event.target.value).toISOString()
                          : null,
                      })
                    }
                    disabled={deliveredCount > 0}
                    aria-label="Scheduled date and time"
                    className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground disabled:opacity-50"
                  />
                ) : (
                  <DatePicker
                    value={
                      spot.scheduledAtISO
                        ? new Date(spot.scheduledAtISO)
                        : undefined
                    }
                    onChange={(date) =>
                      setSchedule.mutate({
                        platformPostId: spot.id,
                        scheduledAt: date ? date.toISOString() : null,
                      })
                    }
                    placeholder="Schedule"
                    density="compact"
                    aria-label="Scheduled date"
                  />
                )}
                {spot.status !== "published" && !providerPublishing && (
                  <MarkScheduledButton
                    spotId={spot.id}
                    at={spot.scheduledAtISO}
                    scheduled={spot.status === "scheduled"}
                    onChanged={() => router.refresh()}
                  />
                )}
                {providerPublishingPlatform && !story && (
                  <SocialDeliveryControl
                    spotId={spot.id}
                    platform={providerPublishingPlatform}
                    status={spot.status}
                    scheduledAt={spot.scheduledAtISO}
                    connected={spot.publishingConnected}
                    deliveryExternalId={spot.deliveryExternalId}
                    deliveryStatus={spot.deliveryStatus}
                    deliveryError={spot.deliveryError}
                  />
                )}
                {story && (
                  <StoryDeliveryControl
                    spotId={spot.id}
                    platform={spot.platform}
                    status={spot.status}
                    scheduledAt={spot.scheduledAtISO}
                    connected={spot.publishingConnected}
                    items={threadItems}
                  />
                )}
              </>
            ) : (
              spot.scheduledAtISO && (
                <span>{formatWhen(spot.scheduledAtISO)}</span>
              )
            )}
            {spot.publishedAtISO && (
              <span>· posted {formatWhen(spot.publishedAtISO)}</span>
            )}
            {via && <span>· via {via}</span>}
            {spot.previewPath && (
              <a
                href={spot.previewPath}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Preview ↗
              </a>
            )}
            {spot.editorUrl && (
              <a
                href={spot.editorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Edit in Dato ↗
              </a>
            )}
            {spot.externalUrl && (
              <a
                href={spot.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
                title={
                  spot.editorUrl && spot.status !== "published"
                    ? "Public URL. Live after the draft is published in Dato."
                    : undefined
                }
              >
                Open ↗
              </a>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {owned && !isEmail && (
            <>
              <button
                type="button"
                onClick={() =>
                  sendAssistantIntent({
                    type: "work_content_post",
                    brandId,
                    brandName,
                    contentPostId,
                    contentTitle,
                    platformPostId: spot.id,
                    platform: spot.platform,
                    visibleText: `Help me refine the ${platformLabel(spot.platform)} version of “${contentTitle}”`,
                  })
                }
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <MessageSquare className="size-3.5" />
                Refine in chat
              </button>
              <PlatformPostEditDialog
                platformPostId={spot.id}
                updatedAtISO={spot.updatedAtISO}
                brandId={brandId}
                platform={spot.platform}
                format={spot.format}
                channelName={spot.channelName ?? null}
                channelProfileImageUrl={spot.channelProfileImageUrl}
                channelBannerImageUrl={spot.channelBannerImageUrl}
                username={spot.username}
                brandName={brandName}
                contentTitle={contentTitle}
                text={spot.text}
                media={spot.media ?? []}
                assetLinks={spot.assetLinks ?? []}
                threadItems={threadItems}
                linkCard={spot.linkCard}
                scheduled={scheduled}
              />
            </>
          )}
          <SpotOwnerControl
            platformPostId={spot.id}
            initialOwner={spot.owner}
            members={members}
            currentUserId={currentUserId}
          />
          {owned && (
            <button
              type="button"
              onClick={() => removeSpot.mutate({ platformPostId: spot.id })}
              disabled={removeSpot.isPending}
              aria-label="Remove channel"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {owned && isEmail ? (
        <div className="mt-4 rounded-lg border bg-muted/25 p-3">
          <p className="text-sm font-medium">
            This email has a subject, Markdown body, CTA, preview, and revision
            history in its issue workspace.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The content card holds the premise and calendar placement. The
            newsletter workspace holds the actual email artifact.
          </p>
          <Link
            href={`/app/newsletters/${spot.id}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Open email workspace
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-3">
            <section className="rounded-xl border bg-background p-4">
              <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Copy
              </h3>
              {threadItems.some((item) => item.text?.trim()) ? (
                <div className="mt-3 space-y-0">
                  {threadItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="relative flex gap-3 pb-4 last:pb-0"
                    >
                      {isThread && index < threadItems.length - 1 && (
                        <span className="absolute top-6 bottom-0 left-3 w-px bg-border" />
                      )}
                      {isThread && (
                        <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                          {index + 1}
                        </span>
                      )}
                      <p className="min-w-0 flex-1 text-sm leading-6 whitespace-pre-wrap">
                        {item.text?.trim() || (
                          <span className="text-muted-foreground italic">
                            No copy yet.
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No channel copy yet. Refine it in chat or open the manual
                  editor.
                </p>
              )}
            </section>

            {media.length > 0 && (
              <section className="rounded-xl border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Media
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    {media.length === 1
                      ? "1 asset"
                      : `${media.length} carousel slides`}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {threadItems.map((threadItem, threadIndex) => {
                    const itemMedia = threadItem.media ?? [];
                    if (!itemMedia.length) return null;
                    return (
                      <div key={threadItem.id}>
                        {isThread && (
                          <div className="mb-1.5 text-[10px] text-muted-foreground">
                            Post {threadIndex + 1}
                          </div>
                        )}
                        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                          {itemMedia.map((item, mediaIndex) => (
                            <li
                              key={`${item.assetId ?? item.url}-${mediaIndex}`}
                              className="min-w-0"
                            >
                              <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                                <MediaThumbnail
                                  src={item.url}
                                  thumbnail={item.thumbnail}
                                  kind={item.type}
                                  alt={`${platformLabel(spot.platform)} post ${threadIndex + 1} media ${mediaIndex + 1}`}
                                  className="object-contain"
                                  sizes="180px"
                                />
                                <span className="absolute top-1.5 left-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-white">
                                  {mediaIndex + 1}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {assetLinks.length > 0 && (
              <section className="rounded-xl border bg-background p-4">
                <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Production links
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {assetLinks.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="max-w-full truncate rounded-md border border-border px-2 py-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {url.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>

          <CompactPlatformPreview
            className="mx-0 max-w-72"
            platform={spot.platform}
            format={spot.format}
            channelName={spot.channelName ?? null}
            channelProfileImageUrl={spot.channelProfileImageUrl}
            channelBannerImageUrl={spot.channelBannerImageUrl}
            username={spot.username}
            brandName={brandName}
            contentTitle={contentTitle}
            text={spot.text ?? ""}
            media={spot.media ?? []}
            threadItems={threadItems.map((item) => ({
              id: item.id,
              text: item.text ?? "",
              media: item.media ?? [],
            }))}
            linkCard={spot.linkCard}
            scheduled={scheduled}
          />
        </div>
      )}

      {metrics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground tabular-nums">
          {metrics.map((metric) => (
            <span key={metric}>{metric}</span>
          ))}
        </div>
      )}
    </div>
  );
}
