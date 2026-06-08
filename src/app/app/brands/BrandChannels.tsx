"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  ExternalLink,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

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
import { useTRPC } from "@/trpc/react";
import { ChannelLogo, PLATFORM_META, platformLabel } from "@/components/channel-logos";
import type { FollowerSnapshot } from "@/server/db/channel-schema";
import type { SuggestionLite } from "./SuggestedChannels";

export type ChannelLite = {
  id: string;
  kind: string;
  platform: string;
  handle: string | null;
  connectionStatus: string;
  profileUrl: string | null;
  manageUrl: string | null;
  followerCount: number | null;
  followerHistory: FollowerSnapshot[];
};

const KINDS = [
  { value: "social", label: "Social" },
  { value: "ad", label: "Ads" },
  { value: "newsletter", label: "Newsletter" },
  { value: "blog", label: "Blog" },
];

const PLATFORMS_BY_KIND: Record<string, string[]> = {
  social: ["instagram", "x", "linkedin", "facebook", "youtube", "tiktok", "threads", "reddit", "pinterest"],
  ad: ["meta_ads", "google_ads", "openai_ads"],
  newsletter: ["newsletter", "other"],
  blog: ["blog", "other"],
};

// Reverse lookup so an incoming suggestion's platform can be slotted into the
// right sub-group. Discovery surfaces social profiles, so default to social.
const KIND_BY_PLATFORM: Record<string, string> = Object.fromEntries(
  Object.entries(PLATFORMS_BY_KIND).flatMap(([kind, platforms]) =>
    platforms.map((p) => [p, kind]),
  ),
);

// Display sub-groups for the unified Channels zone. Newsletter + blog collapse
// into one "Owned" row since each brand usually has at most one of each.
const GROUPS: { label: string; kinds: string[] }[] = [
  { label: "Social", kinds: ["social"] },
  { label: "Ads", kinds: ["ad"] },
  { label: "Owned", kinds: ["newsletter", "blog"] },
];

type FormState = {
  id: string | null;
  kind: string;
  platform: string;
  handle: string;
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
  profileUrl: "",
  manageUrl: "",
  connectionStatus: "connected",
  followerHistory: [],
};

const followerFmt = new Intl.NumberFormat("en-US");

/** Latest snapshot's count (by capture date), or null if no history. */
function latestCount(history: FollowerSnapshot[]): number | null {
  if (history.length === 0) return null;
  return history.reduce((a, b) => (a.capturedAt >= b.capturedAt ? a : b)).count;
}

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
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("details");
  const [newCount, setNewCount] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const onDone = () => {
    setOpen(false);
    router.refresh();
  };
  const refresh = () => router.refresh();

  const createM = useMutation(
    trpc.channel.create.mutationOptions({ onSuccess: onDone }),
  );
  const updateM = useMutation(
    trpc.channel.update.mutationOptions({ onSuccess: onDone }),
  );
  const deleteM = useMutation(
    trpc.channel.delete.mutationOptions({ onSuccess: onDone }),
  );
  const busy = createM.isPending || updateM.isPending || deleteM.isPending;

  // Handle discovery + suggestion review live inline with the channels they
  // relate to (ghost chips), so there's no detached "suggested handles" block.
  const discoverM = useMutation(
    trpc.channelSuggestion.discover.mutationOptions({
      onSuccess: refresh,
      onError: (e) => setDiscoverError(e.message),
    }),
  );
  const acceptM = useMutation(
    trpc.channelSuggestion.accept.mutationOptions({ onSuccess: refresh }),
  );
  const rejectM = useMutation(
    trpc.channelSuggestion.reject.mutationOptions({ onSuccess: refresh }),
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
      profileUrl: c.profileUrl ?? "",
      manageUrl: c.manageUrl ?? "",
      connectionStatus: c.connectionStatus,
      followerHistory: c.followerHistory ?? [],
    });
    setNewCount("");
    setTab("details");
    setOpen(true);
  };

  // Append today's capture to the local list (persisted on Save).
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
      followerHistory: f.followerHistory.filter((s) => s.capturedAt !== capturedAt),
    }));

  const save = () => {
    const payload = {
      kind: form.kind as never,
      platform: form.platform as never,
      handle: form.handle,
      profileUrl: form.profileUrl,
      manageUrl: form.manageUrl,
      connectionStatus: form.connectionStatus as never,
      followerHistory: form.followerHistory,
    };
    if (form.id) updateM.mutate({ id: form.id, ...payload });
    else createM.mutate({ brandId, ...payload });
  };

  const setKind = (kind: string) =>
    setForm((f) => ({ ...f, kind, platform: PLATFORMS_BY_KIND[kind]?.[0] ?? "other" }));

  // Follower captures only make sense for social channels.
  const showFollowers = form.kind === "social";
  const todayISO = new Date().toISOString().slice(0, 10);

  const suggestionsForGroup = (kinds: readonly string[]) =>
    suggestions.filter((s) => kinds.includes(KIND_BY_PLATFORM[s.platform] ?? "social"));

  const hasAny = channels.length > 0 || suggestions.length > 0;

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
          Channels{channels.length > 0 && ` · ${channels.length}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5"
            onClick={openAdd}
          >
            <Plus className="size-3.5" />
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5"
            onClick={() => {
              setDiscoverError(null);
              discoverM.mutate({ brandId });
            }}
            loading={discoverM.isPending}
          >
            <Sparkles className="size-3.5" />
            {discoverM.isPending ? "Discovering…" : "Discover"}
          </Button>
        </div>
      </div>

      {discoverError && (
        <p className="text-destructive text-[11px]">{discoverError}</p>
      )}

      {GROUPS.map(({ label, kinds }) => {
        const group = channels.filter((c) => kinds.includes(c.kind));
        const groupSuggestions = suggestionsForGroup(kinds);
        if (group.length === 0 && groupSuggestions.length === 0) return null;
        return (
          <div key={label}>
            <div className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase tracking-wide">
              {label} · {group.length + groupSuggestions.length}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.map((c) => {
                const posts = postCountByPlatform[c.platform] ?? 0;
                return (
                <div
                  key={c.id}
                  className="hover:bg-accent flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors"
                >
                  <button
                    onClick={() => openEdit(c)}
                    className="flex items-center gap-2 text-left"
                  >
                    <ChannelLogo platform={c.platform} />
                    <span className="flex flex-col leading-tight">
                      <span className="text-xs font-medium">
                        {platformLabel(c.platform)}
                      </span>
                      {(c.handle || c.followerCount != null || posts > 0) && (
                        <span className="text-muted-foreground text-[11px]">
                          {c.handle}
                          {c.handle && c.followerCount != null && " · "}
                          {c.followerCount != null &&
                            `${followerFmt.format(c.followerCount)} followers`}
                          {posts > 0 &&
                            `${c.handle || c.followerCount != null ? " · " : ""}${posts} ${posts === 1 ? "post" : "posts"}`}
                        </span>
                      )}
                    </span>
                  </button>
                  {c.profileUrl && (
                    <a
                      href={c.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open page"
                      className="text-muted-foreground hover:text-foreground hover:bg-background ml-0.5 rounded p-1"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                  {c.manageUrl && (
                    <a
                      href={c.manageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open manage page"
                      className="text-muted-foreground hover:text-foreground hover:bg-background rounded p-1"
                    >
                      <Settings className="size-3.5" />
                    </a>
                  )}
                </div>
                );
              })}

              {/* Pending suggestions render as dashed ghost chips alongside the
                  real channels in their group — accept/reject inline. */}
              {groupSuggestions.map((s) => {
                const rowBusy = suggBusyId === s.id;
                return (
                  <div
                    key={s.id}
                    className="border-muted-foreground/30 bg-muted/30 flex items-center gap-2 rounded-lg border border-dashed px-2 py-1.5"
                  >
                    <ChannelLogo platform={s.platform} />
                    <span className="flex flex-col leading-tight">
                      <span className="text-xs font-medium">
                        {platformLabel(s.platform)}
                        {s.profileUrl ? (
                          <a
                            href={s.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground ml-1.5 font-normal"
                          >
                            @{s.handle}
                          </a>
                        ) : (
                          <span className="text-muted-foreground ml-1.5 font-normal">
                            @{s.handle}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        {s.confidence != null &&
                          `${Math.round(s.confidence * 100)}% match`}
                        {s.verified === true &&
                          s.followerCount != null &&
                          ` · ✓ ${followerFmt.format(s.followerCount)}`}
                        {s.verified === false && " · unverified"}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive size-6"
                      title="Reject"
                      disabled={rowBusy}
                      onClick={() => rejectM.mutate({ id: s.id })}
                    >
                      <X className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      className="size-6"
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
          </div>
        );
      })}

      {!hasAny && (
        <p className="text-muted-foreground text-[11px]">
          {discoverM.isPending
            ? "Searching the web + verifying profiles…"
            : "No channels yet. Add one, or run Discover to find this brand's profiles."}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit channel" : "Add channel"}</DialogTitle>
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
                    <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">
                      {followerFmt.format(latestCount(form.followerHistory) ?? 0)}
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
                    onValueChange={(platform) => setForm((f) => ({ ...f, platform }))}
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
                  onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))}
                  placeholder="@wander or account name"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Page link</Label>
                <Input
                  value={form.profileUrl}
                  onChange={(e) => setForm((f) => ({ ...f, profileUrl: e.target.value }))}
                  placeholder="Public page, e.g. https://instagram.com/wander"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Manage link</Label>
                <Input
                  value={form.manageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, manageUrl: e.target.value }))}
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
                  <p className="text-muted-foreground text-[11px]">
                    Adds a capture dated today · {todayISO}. Persists when you Save.
                  </p>
                </div>

                {form.followerHistory.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-xs">
                    No captures yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <Label className="text-muted-foreground">History</Label>
                    <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border p-1.5">
                      {[...form.followerHistory]
                        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
                        .map((snap) => (
                          <div
                            key={snap.capturedAt}
                            className="hover:bg-accent group flex items-baseline justify-between rounded px-2 py-1 text-xs"
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
                                className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
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
                className="text-destructive gap-1.5"
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
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
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
