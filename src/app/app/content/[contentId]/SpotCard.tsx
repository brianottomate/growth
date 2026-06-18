"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, UploadCloud, X } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { SimpleSelect } from "@/components/ui/select";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { cn } from "@/components/ui/lib/utils";
import type { Member } from "@/components/assignment/assignee";
import type { MediaItem, PostStats } from "@/server/db/schema";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import { SpotOwnerControl } from "./OwnerControls";
import { STATUS_OPTIONS } from "./IdeaControls";

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
  provider: string | null;
  scheduledAtISO: string | null;
  publishedAtISO: string | null;
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
}: {
  spot: SpotCardData;
  brandId: string;
  members: Member[];
  currentUserId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const owned = spot.source === "owned";

  const refresh = { onSettled: () => router.refresh() };
  const setStatus = useMutation(trpc.content.setSpotStatus.mutationOptions(refresh));
  const setSchedule = useMutation(trpc.content.setSpotSchedule.mutationOptions(refresh));
  const setAssetLinks = useMutation(trpc.content.setAssetLinks.mutationOptions(refresh));
  const setMedia = useMutation(trpc.content.setMedia.mutationOptions(refresh));
  const removeSpot = useMutation(trpc.content.removeSpot.mutationOptions(refresh));

  const [links, setLinks] = useState<string[]>(spot.assetLinks ?? []);
  const [media, setMediaState] = useState<MediaItem[]>(spot.media ?? []);
  const [addingLink, setAddingLink] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadImages, uploading } = useMediaUpload(brandId);

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
    setMediaState(next);
    setMedia.mutate({ platformPostId: spot.id, media: next });
  };
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const items = await uploadImages(Array.from(files));
    if (items.length) persistMedia([...media, ...items]);
  };

  return (
    <div className="bg-card rounded-2xl border p-4 shadow-sm">
      {/* header */}
      <div className="flex items-start gap-3">
        <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
          <ChannelLogo platform={spot.platform} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{platformLabel(spot.platform)}</span>
            {spot.username && (
              <span className="text-muted-foreground text-xs">{spot.username}</span>
            )}
            {fmtLabel && (
              <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                {fmtLabel}
              </span>
            )}
            {owned ? (
              <SimpleSelect
                value={
                  STATUS_OPTIONS.some((o) => o.value === spot.status) ? spot.status : "draft"
                }
                onValueChange={(v) =>
                  setStatus.mutate({ platformPostId: spot.id, status: v as never })
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
              <input
                type="date"
                value={spot.scheduledAtISO ? spot.scheduledAtISO.slice(0, 10) : ""}
                onChange={(e) =>
                  setSchedule.mutate({
                    platformPostId: spot.id,
                    scheduledAt: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
                className="bg-background rounded-md border px-1.5 py-0.5 text-[11px]"
                aria-label="Scheduled date"
              />
            ) : (
              spot.scheduledAtISO && <span>{fmtWhen(spot.scheduledAtISO)}</span>
            )}
            {spot.publishedAtISO && <span>· posted {fmtWhen(spot.publishedAtISO)}</span>}
            {via && <span>· via {via}</span>}
            {spot.externalUrl && (
              <a
                href={spot.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                Open ↗
              </a>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
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

      {spot.text && <p className="text-muted-foreground mt-3 text-sm">{spot.text}</p>}

      {/* media thumbnails */}
      {(media.length > 0 || owned) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {media.map((m, i) => (
            <span
              key={i}
              className="bg-muted group relative size-14 overflow-hidden rounded-lg border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.thumbnail ?? m.url}
                alt=""
                className="size-full object-cover"
                loading="lazy"
              />
              {owned && (
                <button
                  onClick={() => persistMedia(media.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove asset"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
          {owned && (
            <button
              onClick={() => fileRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragActive(false);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                void onFiles(e.dataTransfer.files);
              }}
              className={cn(
                "text-muted-foreground hover:border-foreground/40 flex size-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed text-[9px] transition-colors",
                dragActive && "border-primary bg-primary/5",
              )}
            >
              {uploading > 0 ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UploadCloud className="size-4" />
              )}
              Drop
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => void onFiles(e.target.files)}
              />
            </button>
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
    </div>
  );
}
