"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, ExternalLink, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import {
  ChannelLogo,
  PLATFORM_META,
  platformLabel,
} from "@/components/channel-logos";
import type { FollowerSnapshot } from "@/server/db/channel-schema";
import { AD_PLATFORM_VALUES } from "@/lib/ad-platforms";
import type { SuggestionLite } from "./SuggestedChannels";

export type ChannelLite = {
  id: string;
  kind: string;
  platform: string;
  handle: string | null;
  profileImageUrl: string | null;
  connectionStatus: string;
  profileUrl: string | null;
  manageUrl: string | null;
  followerCount: number | null;
  followerHistory: FollowerSnapshot[];
  defaultProvider: string | null;
};

const KINDS = [
  { value: "social", label: "Social" },
  { value: "ad", label: "Ads" },
  { value: "newsletter", label: "Newsletter" },
  { value: "blog", label: "Blog" },
];

const PLATFORMS_BY_KIND: Record<string, string[]> = {
  social: [
    "instagram",
    "x",
    "linkedin",
    "facebook",
    "youtube",
    "tiktok",
    "threads",
    "reddit",
    "pinterest",
  ],
  ad: [...AD_PLATFORM_VALUES],
  newsletter: ["newsletter", "other"],
  blog: ["blog", "other"],
};

const KIND_ORDER: Record<string, number> = {
  social: 0,
  ad: 1,
  newsletter: 2,
  blog: 2,
};

type FormState = {
  id: string | null;
  kind: string;
  platform: string;
  handle: string;
  profileImageUrl: string;
  profileUrl: string;
  manageUrl: string;
  connectionStatus: string;
  followerHistory: FollowerSnapshot[];
};

const EMPTY: FormState = {
  id: null,
  kind: "social",
  platform: "instagram",
  handle: "",
  profileImageUrl: "",
  profileUrl: "",
  manageUrl: "",
  connectionStatus: "connected",
  followerHistory: [],
};

const followerFmt = new Intl.NumberFormat("en-US");
const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Latest snapshot's count (by capture date), or null if no history. */
function latestCount(history: FollowerSnapshot[]): number | null {
  if (history.length === 0) return null;
  return history.reduce((a, b) => (a.capturedAt >= b.capturedAt ? a : b)).count;
}

/** A typed-in address as a full URL, or undefined when left blank. */
function asUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * A social profile we found on the web and a human accepted, but nothing has
 * confirmed yet — no provider connection and no scrape. Marked with a dot.
 */
const isDiscovered = (c: ChannelLite) =>
  c.kind === "social" &&
  c.defaultProvider !== "zernio" &&
  c.connectionStatus !== "connected";

/**
 * Channels as one grid, one tile per network. A blue dot marks a discovered,
 * unconfirmed profile; green text marks a connected ad account. Pending
 * discovery suggestions sit in the same grid as dashed tiles with accept /
 * reject, so the human confirmation step happens where the channels live.
 */
export function BrandChannels({
  brandId,
  channels,
  suggestions = [],
  postCountByPlatform = {},
}: {
  brandId: string;
  channels: ChannelLite[];
  suggestions?: SuggestionLite[];
  postCountByPlatform?: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("details");
  const [newCount, setNewCount] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);

  const onDone = () => {
    setOpen(false);
    router.refresh();
  };
  const refresh = () => router.refresh();

  const createM = useMutation(
    orpc.channel.create.mutationOptions({
      onSuccess: (result) => {
        if (result.ok) onDone();
        else toast.error(result.reason);
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const updateM = useMutation(
    orpc.channel.update.mutationOptions({ onSuccess: onDone }),
  );
  const deleteM = useMutation(
    orpc.channel.delete.mutationOptions({ onSuccess: onDone }),
  );
  const busy = createM.isPending || updateM.isPending || deleteM.isPending;

  const acceptM = useMutation(
    orpc.channelSuggestion.accept.mutationOptions({
      onSuccess: refresh,
      onError: (e) => toast.error(e.message),
    }),
  );
  const rejectM = useMutation(
    orpc.channelSuggestion.reject.mutationOptions({
      onSuccess: refresh,
      onError: (e) => toast.error(e.message),
    }),
  );
  const suggBusyId = acceptM.isPending
    ? acceptM.variables?.id
    : rejectM.isPending
      ? rejectM.variables?.id
      : null;

  const openAdd = () => {
    setForm(EMPTY);
    setNewCount("");
    setTab("details");
    setOpen(true);
  };
  const openEdit = (c: ChannelLite) => {
    setForm({
      id: c.id,
      kind: c.kind,
      platform: c.platform,
      handle: c.handle ?? "",
      profileImageUrl: c.profileImageUrl ?? "",
      profileUrl: c.profileUrl ?? "",
      manageUrl: c.manageUrl ?? "",
      connectionStatus: c.connectionStatus,
      followerHistory: c.followerHistory ?? [],
    });
    setNewCount("");
    setTab("details");
    setOpen(true);
  };

  const addCapture = () => {
    const n = Math.round(Number(newCount.trim()));
    if (newCount.trim() === "" || !Number.isFinite(n) || n < 0) return;
    setForm((f) => ({
      ...f,
      followerHistory: [
        ...f.followerHistory,
        { count: n, capturedAt: new Date().toISOString() },
      ],
    }));
    setNewCount("");
  };

  const removeCapture = (capturedAt: string) =>
    setForm((f) => ({
      ...f,
      followerHistory: f.followerHistory.filter(
        (s) => s.capturedAt !== capturedAt,
      ),
    }));

  const save = () => {
    const payload = {
      kind: form.kind as never,
      platform: form.platform as never,
      handle: form.handle,
      profileImageUrl: form.profileImageUrl,
      profileUrl: form.profileUrl,
      manageUrl: form.manageUrl,
      connectionStatus: form.connectionStatus as never,
      followerHistory: form.followerHistory,
    };
    if (form.id) {
      updateM.mutate({ id: form.id, ...payload });
      return;
    }
    createM.mutate({
      brandId,
      kind: payload.kind,
      platform: payload.platform,
      handle: form.handle.trim() || undefined,
      profileImageUrl: asUrl(form.profileImageUrl),
      profileUrl: asUrl(form.profileUrl),
      manageUrl: asUrl(form.manageUrl),
      connectionStatus: payload.connectionStatus,
      followerCount: latestCount(form.followerHistory) ?? undefined,
    });
  };

  const setKind = (kind: string) =>
    setForm((f) => ({
      ...f,
      kind,
      platform: PLATFORMS_BY_KIND[kind]?.[0] ?? "other",
    }));

  const showFollowers = form.kind === "social";
  const todayISO = new Date().toISOString().slice(0, 10);

  const sorted = [...channels].sort((a, b) => {
    const k = (KIND_ORDER[a.kind] ?? 3) - (KIND_ORDER[b.kind] ?? 3);
    if (k) return k;
    return (b.followerCount ?? -1) - (a.followerCount ?? -1);
  });
  const reach = channels
    .filter((c) => c.kind === "social")
    .reduce((sum, c) => sum + (c.followerCount ?? 0), 0);
  const discoveredCount = channels.filter(isDiscovered).length;
  const total = channels.length + suggestions.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-[11px]">
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Channels{total > 0 && ` · ${total}`}
          </span>
          {reach > 0 && (
            <span className="text-muted-foreground tabular-nums">
              {compactFmt.format(reach)} reach
            </span>
          )}
          {(discoveredCount > 0 || suggestions.length > 0) && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 rounded-full bg-sky-400" />
              discovered, unconfirmed
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
        >
          + Add
        </button>
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted-foreground">
          No channels yet. Find public profiles or connect Zernio from the menu,
          or add one by hand.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @5xl:grid-cols-4">
          {sorted.map((c) => {
            const posts = postCountByPlatform[c.platform] ?? 0;
            const discovered = isDiscovered(c);
            const connected = c.connectionStatus === "connected";
            const label = platformLabel(c.platform);
            const handle = c.handle && c.handle !== label ? c.handle : null;
            return (
              <div
                key={c.id}
                className="group flex items-center gap-2.5 rounded-xl border bg-background/40 px-3 py-2.5 transition-colors hover:border-foreground/20"
              >
                <ChannelLogo platform={c.platform} className="size-5" />
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  className="min-w-0 flex-1 text-left"
                  title="Edit channel"
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    {label}
                    {discovered && (
                      <span
                        className="size-1.5 rounded-full bg-sky-400"
                        title="Discovered on the web; not yet confirmed by a connection or a pull"
                      />
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {c.kind === "ad" ? (
                      <>
                        <span
                          className={
                            connected
                              ? "text-emerald-600 dark:text-emerald-400"
                              : undefined
                          }
                        >
                          {connected ? "connected" : "not connected"}
                        </span>
                        {handle && ` · ${handle}`}
                      </>
                    ) : (
                      [
                        handle,
                        c.followerCount != null &&
                          compactFmt.format(c.followerCount),
                        posts > 0 &&
                          `${posts} ${posts === 1 ? "post" : "posts"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") ||
                      (connected ? "connected" : "no details yet")
                    )}
                  </span>
                </button>
                {(c.profileUrl ?? c.manageUrl) && (
                  <a
                    href={(c.profileUrl ?? c.manageUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={c.profileUrl ? "Open page" : "Open manage page"}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            );
          })}

          {suggestions.map((s) => {
            const rowBusy = suggBusyId === s.id;
            return (
              <div
                key={s.id}
                className="flex items-center gap-2.5 rounded-xl border border-dashed border-sky-400/40 bg-sky-400/5 px-3 py-2.5"
              >
                <ChannelLogo platform={s.platform} className="size-5" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    {platformLabel(s.platform)}
                    <span className="size-1.5 rounded-full bg-sky-400" />
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {s.profileUrl ? (
                      <a
                        href={s.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground"
                        title="Open to confirm"
                      >
                        @{s.handle}
                      </a>
                    ) : (
                      `@${s.handle}`
                    )}
                    {s.confidence != null &&
                      ` · ${Math.round(s.confidence * 100)}%`}
                    {s.verified === true &&
                      s.followerCount != null &&
                      ` · ${compactFmt.format(s.followerCount)}`}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  tone="muted-danger"
                  className="size-6 shrink-0"
                  title="Reject"
                  disabled={rowBusy}
                  onClick={() => rejectM.mutate({ id: s.id })}
                >
                  <X className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  className="size-6 shrink-0"
                  title="Accept — create channel"
                  loading={rowBusy && acceptM.isPending}
                  disabled={rowBusy}
                  onClick={() => acceptM.mutate({ id: s.id })}
                >
                  <Check className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Edit channel" : "Add channel"}
            </DialogTitle>
          </DialogHeader>

          <Tabs
            value={showFollowers ? tab : "details"}
            onValueChange={setTab}
            className="py-2"
          >
            {showFollowers && (
              <TabsList className="mb-2">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="followers">
                  Followers
                  {form.followerHistory.length > 0 && (
                    <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">
                      {followerFmt.format(
                        latestCount(form.followerHistory) ?? 0,
                      )}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="details" className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Type</Label>
                  <Select value={form.kind} onValueChange={setKind}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Platform</Label>
                  <Select
                    value={form.platform}
                    onValueChange={(platform) =>
                      setForm((f) => ({ ...f, platform }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(PLATFORMS_BY_KIND[form.kind] ?? []).map((p) => (
                        <SelectItem key={p} value={p}>
                          {PLATFORM_META[p]?.name ?? p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Handle</Label>
                <Input
                  value={form.handle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, handle: e.target.value }))
                  }
                  placeholder="@wander or account name"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Profile image</Label>
                <Input
                  value={form.profileImageUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, profileImageUrl: e.target.value }))
                  }
                  placeholder="https://…/profile.jpg"
                />
                <p className="text-[11px] text-muted-foreground">
                  Imported from the provider when available; paste a current
                  image URL to override it.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Page link</Label>
                <Input
                  value={form.profileUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, profileUrl: e.target.value }))
                  }
                  placeholder="Public page, e.g. https://instagram.com/wander"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Manage link</Label>
                <Input
                  value={form.manageUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, manageUrl: e.target.value }))
                  }
                  placeholder="Where you manage it, e.g. ads manager / studio"
                />
              </div>
            </TabsContent>

            {showFollowers && (
              <TabsContent value="followers" className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>New count</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={newCount}
                      onChange={(e) => setNewCount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCapture();
                        }
                      }}
                      placeholder="e.g. 293000"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={addCapture}
                      disabled={newCount.trim() === ""}
                    >
                      Add
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Adds a capture dated today · {todayISO}. Persists when you
                    Save.
                  </p>
                </div>

                {form.followerHistory.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No captures yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <Label tone="muted">History</Label>
                    <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border p-1.5">
                      {[...form.followerHistory]
                        .sort((a, b) =>
                          b.capturedAt.localeCompare(a.capturedAt),
                        )
                        .map((snap) => (
                          <div
                            key={snap.capturedAt}
                            className="group flex items-baseline justify-between rounded px-2 py-1 text-xs hover:bg-accent"
                          >
                            <span className="font-medium tabular-nums">
                              {followerFmt.format(snap.count)}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-muted-foreground">
                                {snap.capturedAt.slice(0, 10)}
                              </span>
                              <button
                                type="button"
                                title="Remove capture"
                                onClick={() => removeCapture(snap.capturedAt)}
                                className="text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive pointer-coarse:opacity-100"
                              >
                                <X className="size-3.5" />
                              </button>
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>

          <DialogFooter className="sm:justify-between">
            {form.id ? (
              <Button
                variant="ghost"
                size="sm"
                tone="danger"
                disabled={busy}
                onClick={() => deleteM.mutate({ id: form.id! })}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={save} loading={busy}>
                {form.id ? "Save" : "Add channel"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
