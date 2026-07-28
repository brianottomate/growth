"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Images,
  Loader2,
  MessageSquare,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { SimpleSelect } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropzone } from "@/components/ui/dropzone";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { MediaThumbnail } from "@/components/media-thumbnail";
import { cn } from "@/components/ui/lib/utils";
import type { Member } from "@/components/assignment/assignee";
import type { MediaItem, PostStats } from "@/server/db/schema";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import { SpotOwnerControl } from "./OwnerControls";
import { STATUS_OPTIONS } from "./IdeaControls";
import { MediaPickerDialog } from "./MediaPickerDialog";
import { MarkScheduledButton } from "../MarkScheduledButton";
import { SPOT_PILLS, type SpotPill } from "@/lib/spot-pills";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { LinkedInDeliveryControl } from "./LinkedInDeliveryControl";
import { getPlatformFormat } from "@/server/content/formats";

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

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export type SpotCardData = {
  id: string;
  platform: string;
  format: string | null;
  archetype: string | null;
  template: string | null;
  status: string;
  source: string;
  username: string | null;
  text: string | null;
  externalUrl: string | null;
  /** CMS editor deep link (Dato) — the preview surface while the item is a draft. */
  editorUrl: string | null;
  /** In-app rendered preview (/app/dato-preview-react/…) for CMS-linked drafts. */
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
};

/** A rich, /brands-style platform-post card: the manual layer (status, ship
 *  date, mark-done), the asset links (Drive), inline image upload, and stats. */
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
  const setAssetLinks = useMutation(
    trpc.content.setAssetLinks.mutationOptions(refresh),
  );
  const setMedia = useMutation(trpc.content.setMedia.mutationOptions(refresh));
  const removeSpot = useMutation(
    trpc.content.removeSpot.mutationOptions(refresh),
  );

  const [links, setLinks] = useState<string[]>(spot.assetLinks ?? []);
  const [media, setMediaState] = useState<MediaItem[]>(spot.media ?? []);
  const [addingLink, setAddingLink] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const { uploadImages, uploading } = useMediaUpload(brandId);
  const platformFormat = spot.format
    ? getPlatformFormat(spot.format)
    : undefined;
  const isCarousel =
    spot.archetype === "carousel" || platformFormat?.archetype === "carousel";

  // Caption = the concrete per-platform copy (platform_post.text), plus the AI
  // generate steer (pills + free-text nudge) that drafts it from the brief.
  const [caption, setCaption] = useState(spot.text ?? "");
  const [genOpen, setGenOpen] = useState(false);
  const [pills, setPills] = useState<Set<SpotPill>>(new Set());
  const [steer, setSteer] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const setText = useMutation(
    trpc.content.setSpotText.mutationOptions(refresh),
  );
  const generate = useMutation(
    trpc.content.generateSpotCaption.mutationOptions({
      onSuccess: (res) => {
        // Drop the draft into the editor and persist it; still fully editable.
        setCaption(res.caption);
        setText.mutate({ platformPostId: spot.id, text: res.caption });
        setGenOpen(false);
      },
    }),
  );
  const togglePill = (id: SpotPill) =>
    setPills((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const runGenerate = () =>
    generate.mutate({
      platformPostId: spot.id,
      pills: [...pills],
      steer: steer.trim() || undefined,
    });
  const saveCaption = () => {
    const next = caption.trim() ? caption : "";
    if (next !== (spot.text ?? "")) {
      setText.mutate({ platformPostId: spot.id, text: next || null });
    }
  };

  const fmtLabel = formatLabel(spot.format, spot.archetype, spot.template);
  const via = spot.provider ? (VIA[spot.provider] ?? spot.provider) : null;
  const s = spot.stats ?? {};
  const metrics = [
    s.views != null ? `${fmt(s.views)} views` : null,
    s.likes != null ? `${fmt(s.likes)} likes` : null,
    s.comments != null ? `${fmt(s.comments)} comments` : null,
  ].filter((m): m is string => m !== null);

  const persistLinks = (next: string[]) => {
    setLinks(next);
    setAssetLinks.mutate({ platformPostId: spot.id, assetLinks: next });
  };
  const persistMedia = (next: MediaItem[]) => {
    // Dedupe by assetId so dropping or picking the same library asset twice
    // doesn't double-attach. Items without an assetId (scraped/legacy) are kept.
    const seen = new Set<string>();
    const deduped = next.filter((m) => {
      if (!m.assetId) return true;
      if (seen.has(m.assetId)) return false;
      seen.add(m.assetId);
      return true;
    });
    setMediaState(deduped);
    setMedia.mutate({ platformPostId: spot.id, media: deduped });
  };
  const handleUpload = async (files: File[]) => {
    const items = await uploadImages(files);
    if (items.length) persistMedia([...media, ...items]);
  };
  const moveMedia = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    [next[index], next[target]] = [next[target]!, next[index]!];
    persistMedia(next);
  };

  return (
    <div className="bg-card rounded-2xl border p-4 shadow-sm">
      {/* header */}
      <div className="flex items-start gap-3">
        <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
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
            {spot.username && (
              <span className="text-muted-foreground text-xs">
                {spot.username}
              </span>
            )}
            {fmtLabel && (
              <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                {fmtLabel}
              </span>
            )}
            {owned ? (
              <SimpleSelect
                value={
                  STATUS_OPTIONS.some((o) => o.value === spot.status)
                    ? spot.status
                    : "draft"
                }
                onValueChange={(v) =>
                  setStatus.mutate({
                    platformPostId: spot.id,
                    status: v as never,
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

          {/* meta: ship date + posted + via + open */}
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {owned ? (
              <>
                <DatePicker
                  value={
                    spot.scheduledAtISO
                      ? new Date(spot.scheduledAtISO)
                      : undefined
                  }
                  onChange={(d) =>
                    setSchedule.mutate({
                      platformPostId: spot.id,
                      scheduledAt: d ? d.toISOString() : null,
                    })
                  }
                  placeholder="Schedule"
                  className="px-1.5 py-0.5 text-[11px]"
                  aria-label="Scheduled date"
                />
                {spot.status !== "published" &&
                  spot.platform !== "linkedin" && (
                    <MarkScheduledButton
                      spotId={spot.id}
                      at={spot.scheduledAtISO}
                      scheduled={spot.status === "scheduled"}
                      onChanged={() => router.refresh()}
                    />
                  )}
                {spot.platform === "linkedin" && (
                  <LinkedInDeliveryControl
                    spotId={spot.id}
                    status={spot.status}
                    scheduledAt={spot.scheduledAtISO}
                    connected={spot.publishingConnected}
                    deliveryExternalId={spot.deliveryExternalId}
                    deliveryStatus={spot.deliveryStatus}
                    deliveryError={spot.deliveryError}
                  />
                )}
              </>
            ) : (
              spot.scheduledAtISO && <span>{fmtWhen(spot.scheduledAtISO)}</span>
            )}
            {spot.publishedAtISO && (
              <span>· posted {fmtWhen(spot.publishedAtISO)}</span>
            )}
            {via && <span>· via {via}</span>}
            {spot.previewPath && (
              <a
                href={spot.previewPath}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                Preview ↗
              </a>
            )}
            {spot.editorUrl && (
              <a
                href={spot.editorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                Edit in Dato ↗
              </a>
            )}
            {spot.externalUrl && (
              <a
                href={spot.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
                title={
                  spot.editorUrl && spot.status !== "published"
                    ? "Public URL — live after the draft is published in Dato"
                    : undefined
                }
              >
                Open ↗
              </a>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {owned && (
            <button
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
              className="border-border text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors"
            >
              <MessageSquare className="size-3.5" /> Refine in chat
            </button>
          )}
          <SpotOwnerControl
            platformPostId={spot.id}
            initialOwner={spot.owner}
            members={members}
            currentUserId={currentUserId}
          />
          {owned && (
            <button
              onClick={() => removeSpot.mutate({ platformPostId: spot.id })}
              disabled={removeSpot.isPending}
              aria-label="Remove channel"
              className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1 transition-colors disabled:opacity-50"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Caption — the concrete platform copy. Editable for owned spots, with an
          AI generate/regenerate that remixes the idea brief in the brand+channel
          voice. Scraped posts show their captured text read-only. */}
      {owned && isEmail ? (
        <div className="bg-muted/25 mt-3 rounded-lg border p-3">
          <p className="text-sm font-medium">
            This email has a subject, Markdown body, CTA, preview, and revision
            history in its issue workspace.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            The content card holds the premise and calendar placement; the
            newsletter workspace holds the actual email artifact.
          </p>
          <Link
            href={`/app/newsletters/${spot.id}`}
            className="border-border hover:bg-accent bg-background mt-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
          >
            Open email workspace
          </Link>
        </div>
      ) : owned ? (
        <div className="mt-3">
          <div className="bg-background min-h-16 rounded-lg border px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
            {caption.trim() || (
              <span className="text-muted-foreground">
                No channel copy yet. Refine it with the assistant.
              </span>
            )}
          </div>
          <details className="mt-2">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
              Manual edit
            </summary>
            <div className="mt-2">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={saveCaption}
                placeholder="Platform caption…"
                className="bg-background focus:ring-ring/40 min-h-24 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGenOpen((open) => !open)}
                  className="border-border text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                >
                  {generate.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {caption.trim() ? "Regenerate" : "Generate"}
                </button>
                {setText.isPending && (
                  <span className="text-muted-foreground text-[11px]">
                    Saving…
                  </span>
                )}
              </div>
            </div>
          </details>
          {genOpen && (
            <div className="bg-muted/30 mt-2 rounded-lg border p-2.5">
              <div className="flex flex-wrap gap-1.5">
                {SPOT_PILLS.map((p) => {
                  const on = pills.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePill(p.id)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                        on
                          ? "bg-foreground text-background border-foreground"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={steer}
                  onChange={(e) => setSteer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runGenerate();
                  }}
                  placeholder="Optional nudge — e.g. lead with the pool"
                  className="bg-background flex-1 rounded-md border px-2 py-1 text-xs outline-none"
                />
                <button
                  onClick={runGenerate}
                  disabled={generate.isPending}
                  className="bg-foreground text-background rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                >
                  {generate.isPending ? "Generating…" : "Generate"}
                </button>
              </div>
              {generate.isError && (
                <p className="text-destructive mt-1.5 text-[11px]">
                  {generate.error.message}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        spot.text && (
          <p className="text-muted-foreground mt-3 text-sm">{spot.text}</p>
        )
      )}

      {/* media — thumbnails + a proper drop zone (saved to the library) */}
      {(media.length > 0 || owned) && (
        <div className="mt-3 space-y-2">
          {media.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {media.map((m, i) => (
                <span
                  key={i}
                  className="bg-muted group relative size-16 overflow-hidden rounded-lg border"
                >
                  <MediaThumbnail
                    src={m.url}
                    thumbnail={m.thumbnail}
                    className="size-full object-cover"
                  />
                  {owned && (
                    <>
                      {isCarousel && (
                        <span className="absolute top-0.5 left-0.5 rounded bg-black/65 px-1 text-[9px] font-semibold text-white">
                          {i + 1}
                        </span>
                      )}
                      <button
                        onClick={() =>
                          persistMedia(media.filter((_, j) => j !== i))
                        }
                        className="absolute top-0.5 right-0.5 rounded bg-black/65 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Remove asset"
                      >
                        <X className="size-3" />
                      </button>
                      {isCarousel && (
                        <span className="absolute inset-x-0.5 bottom-0.5 flex justify-between">
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => moveMedia(i, -1)}
                            aria-label={`Move slide ${i + 1} left`}
                            className="rounded bg-black/65 p-0.5 text-white disabled:opacity-30"
                          >
                            <ChevronLeft className="size-3" />
                          </button>
                          <button
                            type="button"
                            disabled={i === media.length - 1}
                            onClick={() => moveMedia(i, 1)}
                            aria-label={`Move slide ${i + 1} right`}
                            className="rounded bg-black/65 p-0.5 text-white disabled:opacity-30"
                          >
                            <ChevronRight className="size-3" />
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </span>
              ))}
            </div>
          )}
          {owned && (
            <details>
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
                Channel media
              </summary>
              <div className="mt-2 flex items-stretch gap-2">
                <Dropzone
                  compact
                  multiple
                  onFiles={handleUpload}
                  uploading={uploading}
                  className="flex-1"
                />
                <button
                  onClick={() => setPickerOpen(true)}
                  className="border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs transition-colors"
                >
                  <Images className="size-5" />
                  Library
                </button>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Drive / external asset links */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {links.map((url, i) => (
          <span
            key={i}
            className="border-border text-muted-foreground flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
          >
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground max-w-[180px] truncate"
            >
              ↗ {url.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
            {owned && (
              <button
                onClick={() => persistLinks(links.filter((_, j) => j !== i))}
                aria-label="Remove link"
                className="hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {owned &&
          (addingLink ? (
            <input
              autoFocus
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = linkValue.trim();
                  if (v) persistLinks([...links, v]);
                  setLinkValue("");
                  setAddingLink(false);
                }
                if (e.key === "Escape") {
                  setLinkValue("");
                  setAddingLink(false);
                }
              }}
              onBlur={() => {
                const v = linkValue.trim();
                if (v) persistLinks([...links, v]);
                setLinkValue("");
                setAddingLink(false);
              }}
              placeholder="Paste a Drive link…"
              className="bg-background w-56 rounded-md border px-1.5 py-0.5 text-[11px] outline-none"
            />
          ) : (
            <button
              onClick={() => setAddingLink(true)}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[11px]"
            >
              <Plus className="size-3" /> Link
            </button>
          ))}
      </div>

      {metrics.length > 0 && (
        <div className="text-muted-foreground mt-3 flex flex-wrap gap-3 text-[11px] tabular-nums">
          {metrics.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      )}

      <MediaPickerDialog
        brandId={brandId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        existingAssetIds={media
          .map((m) => m.assetId)
          .filter((id): id is string => !!id)}
        onPick={(item) => persistMedia([...media, item])}
      />
    </div>
  );
}
