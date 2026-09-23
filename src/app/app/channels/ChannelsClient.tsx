"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Pencil, Sparkles } from "lucide-react";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import { orpc } from "@/orpc/client";
import { SuggestTargetsDialog } from "./SuggestTargetsDialog";
import { PhotoPickerField, usePhotoPicker } from "../people/PhotoPicker";

const ARCHETYPE_LABEL: Record<string, string> = {
  image: "Image",
  carousel: "Carousel",
  video_short: "Short",
  video_long: "Video",
  text: "Text",
  thread: "Thread",
  story: "Story",
  link: "Link",
  article: "Longform",
  other: "Other",
};

export type BrandChannels = {
  id: string;
  name: string;
  mixTotal: number;
  mixRows: {
    pillar: string;
    count: number;
    pct: number;
    targetPct: number | null;
  }[];
  channels: {
    id: string;
    platform: string;
    handle: string | null;
    profileImageUrl: string | null;
    bannerImageUrl: string | null;
    profileUrl: string | null;
    manageUrl: string | null;
    connectionStatus: string;
    followerCount: number | null;
    fingerprint: string | null;
    // Per-channel mix OVERRIDE (mix_target rows with channelId) — what the
    // slot generator allocates pillars from on this channel.
    mixTargets: { pillar: string; targetPct: number }[];
    postsInWindow: number;
    archetypes: { archetype: string; perWeek: number; target: number | null }[];
  }[];
};

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;
const pillarName = (slug: string) =>
  slug === "__unsorted" ? "Unsorted" : (PILLAR_BY_SLUG[slug]?.name ?? slug);
const pillarColor = (slug: string) =>
  slug === "__unsorted"
    ? "var(--color-muted-foreground)"
    : (PILLAR_BY_SLUG[slug]?.color ?? "var(--color-muted-foreground)");

function inferredProfileUrl(channel: BrandChannels["channels"][number]) {
  if (channel.profileUrl) return channel.profileUrl;
  const handle = channel.handle?.replace(/^@/, "");
  if (!handle) return null;

  switch (channel.platform) {
    case "instagram":
      return `https://www.instagram.com/${handle}/`;
    case "x":
    case "twitter":
      return `https://x.com/${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "youtube":
      return `https://www.youtube.com/@${handle}`;
    default:
      return null;
  }
}

export function ChannelsClient({
  brands,
  windowDays,
}: {
  brands: BrandChannels[];
  windowDays: number;
}) {
  const [suggestFor, setSuggestFor] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editChannel, setEditChannel] = useState<
    (BrandChannels["channels"][number] & { brandName: string }) | null
  >(null);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Each brand&apos;s channels — voice, cadence, and content mix.{" "}
        <span className="text-muted-foreground/70">
          Observed = last {windowDays} days; targets from cadence &amp; mix when
          set.
        </span>
      </p>

      <div className="mt-6 flex flex-col gap-5">
        {brands.length === 0 && (
          <p className="text-sm text-muted-foreground">No brands yet.</p>
        )}
        {brands.map((b) => (
          <section key={b.id} className="overflow-hidden rounded-xl border">
            <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2.5">
              <h2 className="text-sm font-semibold">{b.name}</h2>
              <button
                onClick={() => setSuggestFor({ id: b.id, name: b.name })}
                className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Sparkles className="size-3" /> Suggest updates
              </button>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {b.mixTotal} posts · {b.channels.length} channels
              </span>
            </div>

            {/* Pillar content mix (observed vs target) */}
            <div className="border-b px-4 py-3">
              <div className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Content mix
              </div>
              {b.mixTotal === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No posts in window.
                </p>
              ) : (
                <>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-muted/40">
                    {b.mixRows.map((m) =>
                      m.pct > 0 ? (
                        <span
                          key={m.pillar}
                          title={`${pillarName(m.pillar)} · ${m.pct}%`}
                          style={{
                            width: `${m.pct}%`,
                            background: pillarColor(m.pillar),
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {b.mixRows.map((m) => {
                      const under = m.targetPct != null && m.pct < m.targetPct;
                      return (
                        <span
                          key={m.pillar}
                          className="flex items-center gap-1 text-[11px]"
                        >
                          <span
                            className="size-2 rounded-full"
                            style={{ background: pillarColor(m.pillar) }}
                          />
                          <span className="text-foreground/90">
                            {pillarName(m.pillar)}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {m.pct}%
                          </span>
                          {m.targetPct != null && (
                            <span
                              className={cn(
                                "tabular-nums",
                                under
                                  ? "text-amber-400"
                                  : "text-muted-foreground/60",
                              )}
                            >
                              (target {m.targetPct}%)
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Channels */}
            <div className="grid gap-3 p-3 md:grid-cols-2">
              {b.channels.length === 0 && (
                <p className="text-xs text-muted-foreground md:col-span-2">
                  No connected channels.
                </p>
              )}
              {b.channels.map((c) => {
                const publicUrl = inferredProfileUrl(c);

                return (
                  <article
                    key={c.id}
                    className="overflow-hidden rounded-lg border bg-background/50"
                  >
                    <div className="relative h-16 bg-muted">
                      {c.bannerImageUrl ? (
                        // oxlint-disable-next-line nextjs/no-img-element
                        <img
                          src={c.bannerImageUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted to-muted/30">
                          <ChannelLogo
                            platform={c.platform}
                            className="size-7 opacity-15"
                          />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
                      <Avatar
                        frame="surface"
                        className="absolute -bottom-5 left-3 size-11"
                      >
                        {c.profileImageUrl && (
                          <AvatarImage
                            src={c.profileImageUrl}
                            alt={`${c.handle ?? platformLabel(c.platform)} profile`}
                          />
                        )}
                        <AvatarFallback>
                          <ChannelLogo
                            platform={c.platform}
                            className="size-4"
                          />
                        </AvatarFallback>
                      </Avatar>
                      <Button
                        variant="secondary"
                        size="icon"
                        tone="media-subtle"
                        className="absolute top-2 right-2 size-7"
                        title={`Edit ${platformLabel(c.platform)} channel`}
                        onClick={() =>
                          setEditChannel({ ...c, brandName: b.name })
                        }
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </div>

                    <div className="px-3 pt-7 pb-3">
                      <div className="min-w-0">
                        {publicUrl ? (
                          <a
                            href={publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium transition-colors outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                            title={`Open ${platformLabel(c.platform)} profile`}
                          >
                            <ChannelLogo
                              platform={c.platform}
                              className="size-3.5 shrink-0"
                            />
                            {platformLabel(c.platform)}
                            <ExternalLink className="size-3 opacity-60" />
                          </a>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-sm font-medium">
                            <ChannelLogo
                              platform={c.platform}
                              className="size-3.5 shrink-0"
                            />
                            {platformLabel(c.platform)}
                          </div>
                        )}
                        <div className="truncate text-[11px] text-muted-foreground">
                          {c.handle ?? "—"}
                          {c.followerCount
                            ? ` · ${fmt(c.followerCount)} followers`
                            : ""}
                        </div>
                      </div>

                      {/* cadence chips */}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {(c.postsInWindow / (windowDays / 7)).toFixed(1)}/wk
                        </span>
                        {c.archetypes.length === 0 && (
                          <span className="text-[11px] text-muted-foreground/60">
                            nothing in window
                          </span>
                        )}
                        {c.archetypes.map((a) => {
                          const under =
                            a.target != null && a.perWeek < a.target;
                          return (
                            <span
                              key={a.archetype}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] tabular-nums",
                                under
                                  ? "border-amber-500/40 text-amber-300"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              {ARCHETYPE_LABEL[a.archetype] ?? a.archetype}{" "}
                              {a.perWeek.toFixed(1)}/wk
                              {a.target != null && (
                                <span className="opacity-60">
                                  {" "}
                                  · t{a.target.toFixed(0)}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                      {/* per-channel mix override (what the slot generator uses) */}
                      {c.mixTargets.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase">
                            Mix target
                          </span>
                          {c.mixTargets.map((m) => (
                            <span
                              key={m.pillar}
                              className="flex items-center gap-1 text-[11px]"
                            >
                              <span
                                className="size-2 rounded-full"
                                style={{ background: pillarColor(m.pillar) }}
                              />
                              <span className="text-muted-foreground">
                                {pillarName(m.pillar)}
                              </span>
                              <span className="text-muted-foreground/70 tabular-nums">
                                {m.targetPct}%
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                      {/* voice fingerprint */}
                      {c.fingerprint && (
                        <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground italic">
                          {c.fingerprint}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {suggestFor && (
        <SuggestTargetsDialog
          brandId={suggestFor.id}
          brandName={suggestFor.name}
          open={!!suggestFor}
          onOpenChange={(o) => {
            if (!o) setSuggestFor(null);
          }}
        />
      )}
      {editChannel && (
        <EditChannelDialog
          channel={editChannel}
          open={!!editChannel}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditChannel(null);
          }}
        />
      )}
    </div>
  );
}

type EditableChannel = BrandChannels["channels"][number] & {
  brandName: string;
};

function EditChannelDialog({
  channel,
  open,
  onOpenChange,
}: {
  channel: EditableChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const photoPicker = usePhotoPicker(channel.profileImageUrl);
  const bannerPicker = usePhotoPicker(channel.bannerImageUrl);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [form, setForm] = useState({
    handle: channel.handle ?? "",
    profileUrl: channel.profileUrl ?? "",
    manageUrl: channel.manageUrl ?? "",
    connectionStatus: channel.connectionStatus,
  });
  const [error, setError] = useState<string | null>(null);
  const bannerPayload =
    "photo" in bannerPicker.payload
      ? { bannerPhoto: bannerPicker.payload.photo }
      : "photoUrl" in bannerPicker.payload
        ? { bannerPhotoUrl: bannerPicker.payload.photoUrl }
        : {};

  const updateM = useMutation(
    orpc.channel.update.mutationOptions({
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
      onError: (mutationError) => setError(mutationError.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onPaste={photoPicker.handlePaste}>
        <DialogHeader>
          <DialogTitle>Edit {platformLabel(channel.platform)}</DialogTitle>
          <DialogDescription>
            {channel.brandName} · update this channel&apos;s public identity and
            connection state.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <PhotoPickerField picker={photoPicker} idPrefix="channel-profile" />
          <div className="grid gap-2 border-t pt-4">
            <PhotoPickerField
              picker={bannerPicker}
              variant="banner"
              label="Optional banner image"
              help="click to upload · ≤4.5MB"
              idPrefix="channel-banner"
            />
            {channel.bannerImageUrl && !bannerPicker.changed && (
              <Button
                variant="ghost"
                size="sm"
                tone="muted"
                className="justify-self-start"
                onClick={() => setRemoveBanner((current) => !current)}
              >
                {removeBanner ? "Keep current banner" : "Remove banner"}
              </Button>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>Handle</Label>
            <Input
              value={form.handle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  handle: event.target.value,
                }))
              }
              placeholder="@handle"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Public profile</Label>
            <Input
              value={form.profileUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  profileUrl: event.target.value,
                }))
              }
              placeholder="https://x.com/handle"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Manage link</Label>
            <Input
              value={form.manageUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  manageUrl: event.target.value,
                }))
              }
              placeholder="Provider dashboard URL"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Connection status</Label>
            <Select
              value={form.connectionStatus}
              onValueChange={(connectionStatus) =>
                setForm((current) => ({ ...current, connectionStatus }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="connected">Connected</SelectItem>
                <SelectItem value="disconnected">Disconnected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            loading={updateM.isPending}
            onClick={() =>
              updateM.mutate({
                id: channel.id,
                handle: form.handle,
                profileUrl: form.profileUrl,
                manageUrl: form.manageUrl,
                ...photoPicker.payload,
                ...bannerPayload,
                ...(removeBanner ? { bannerImageUrl: "" } : {}),
                connectionStatus: form.connectionStatus as
                  | "connected"
                  | "disconnected"
                  | "expired"
                  | "error",
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
