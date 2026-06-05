"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Plus, Settings, Trash2, X } from "lucide-react";

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

const KIND_LABEL: Record<string, string> = {
  social: "Social",
  ad: "Ads",
  newsletter: "Newsletters",
  blog: "Blog",
};

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
}: {
  brandId: string;
  channels: ChannelLite[];
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("details");
  const [newCount, setNewCount] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);

  const onDone = () => {
    setOpen(false);
    router.refresh();
  };

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

  return (
    <div className="mt-3 flex flex-col gap-3">
      {KINDS.map(({ value, label }) => {
        const group = channels.filter((c) => c.kind === value);
        if (group.length === 0) return null;
        return (
          <div key={value}>
            <div className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase tracking-wide">
              {KIND_LABEL[value]} · {group.length}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.map((c) => {
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
                        {(c.handle || c.followerCount != null) && (
                          <span className="text-muted-foreground text-[11px]">
                            {c.handle}
                            {c.handle && c.followerCount != null && " · "}
                            {c.followerCount != null &&
                              `${followerFmt.format(c.followerCount)} followers`}
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
            </div>
          </div>
        );
      })}

      <div>
        <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5" onClick={openAdd}>
          <Plus className="size-3.5" />
          Add channel
        </Button>
      </div>

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
