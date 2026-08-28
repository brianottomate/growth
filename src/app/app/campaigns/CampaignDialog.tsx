"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

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
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { platformLabel } from "@/components/channel-logos";
import type { ChannelPlatform, CampaignStatus } from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";

export type CampaignDraft = {
  id?: string;
  brandId: string;
  name: string;
  description?: string | null;
  goal?: string | null;
  status: CampaignStatus;
  landingUrl?: string | null;
  color?: string | null;
  targetChannels?: string[] | null;
  budget?: number | null;
  startAt?: Date | null;
  endAt?: Date | null;
};

const STATUSES = [
  ["planned", "Planned"],
  ["active", "Active"],
  ["paused", "Paused"],
  ["completed", "Completed"],
  ["archived", "Archived"],
] as const;

// Mirror of channelPlatformEnum — listed here (not imported) so the drizzle
// enum object stays out of the client bundle. `satisfies` keeps it honest.
const CHANNELS = [
  "instagram",
  "facebook",
  "linkedin",
  "x",
  "tiktok",
  "youtube",
  "threads",
  "pinterest",
  "reddit",
  "google_ads",
  "meta_ads",
  "openai_ads",
  "newsletter",
  "blog",
] as const satisfies readonly ChannelPlatform[];

// UI accent presets — used for feed bands and the campaigns list spine.
const COLORS = [
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#2dd4bf",
];

/** yyyy-mm-dd in LOCAL time (what <input type="date"> expects). */
function toDateInput(d: Date | null | undefined) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Noon local — keeps the calendar day stable across timezones. */
function fromDateInput(v: string) {
  return v ? new Date(`${v}T12:00:00`) : null;
}

export function CampaignDialog({
  open,
  onOpenChange,
  brands,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: { id: string; name: string }[];
  initial?: CampaignDraft;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial?.id);

  const [brandId, setBrandId] = useState(
    initial?.brandId ?? brands[0]?.id ?? "",
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [status, setStatus] = useState<CampaignStatus>(
    initial?.status ?? "planned",
  );
  const [landingUrl, setLandingUrl] = useState(initial?.landingUrl ?? "");
  const [color, setColor] = useState(initial?.color ?? "");
  const [channels, setChannels] = useState<string[]>(
    initial?.targetChannels ?? [],
  );
  const [budget, setBudget] = useState(
    initial?.budget != null ? String(initial.budget) : "",
  );
  const [start, setStart] = useState(toDateInput(initial?.startAt));
  const [end, setEnd] = useState(toDateInput(initial?.endAt));

  // Re-seed the form whenever a different campaign is opened for editing.
  useEffect(() => {
    if (!open) return;
    setBrandId(initial?.brandId ?? brands[0]?.id ?? "");
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setGoal(initial?.goal ?? "");
    setStatus(initial?.status ?? "planned");
    setLandingUrl(initial?.landingUrl ?? "");
    setColor(initial?.color ?? "");
    setChannels(initial?.targetChannels ?? []);
    setBudget(initial?.budget != null ? String(initial.budget) : "");
    setStart(toDateInput(initial?.startAt));
    setEnd(toDateInput(initial?.endAt));
  }, [open, initial, brands]);

  const invalidate = async () => {
    await queryClient.invalidateQueries(
      trpc.initiative.overview.queryOptions(),
    );
    if (initial?.id) {
      await queryClient.invalidateQueries(
        trpc.initiative.get.queryOptions({ id: initial.id }),
      );
    }
  };

  const create = useMutation(
    trpc.initiative.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to create campaign"),
    }),
  );
  const update = useMutation(
    trpc.initiative.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to update campaign"),
    }),
  );

  const pending = create.isPending || update.isPending;

  function submit() {
    if (!name.trim()) return toast.error("Name is required");
    if (!isEdit && !brandId) return toast.error("Pick a brand");
    const startAt = fromDateInput(start);
    const endAt = fromDateInput(end);
    if (startAt && endAt && endAt < startAt) {
      return toast.error("End date is before start date");
    }
    const shared = {
      name: name.trim(),
      description: description.trim() || null,
      goal: goal.trim() || null,
      status,
      landingUrl: landingUrl.trim() || null,
      color: color || null,
      targetChannels: channels as ChannelPlatform[],
      budget: budget ? Number(budget) : null,
      startAt,
      endAt,
    };
    if (isEdit && initial?.id) {
      update.mutate({ id: initial.id, ...shared });
    } else {
      create.mutate({ brandId, ...shared });
    }
  }

  function toggleChannel(c: string) {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit campaign" : "New campaign"}</DialogTitle>
          <DialogDescription>
            A seasonal moment, a major event, or a long-running push. Link
            content and ads to it to see the whole effort in one place.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && brands.length > 1 && (
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="camp-name">Name</Label>
            <Input
              id="camp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ski Season 2026"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="camp-desc">Description</Label>
            <Textarea
              id="camp-desc"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Winter push across social + paid, anchored on ski destinations…"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as CampaignStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-goal">Goal</Label>
              <Input
                id="camp-goal"
                value={goal ?? ""}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="brand | supply | saas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-start">Starts</Label>
              <DatePicker
                id="camp-start"
                value={fromDateInput(start) ?? undefined}
                onChange={(d) => setStart(d ? toDateInput(d) : "")}
                placeholder="Start date"
                className="w-full justify-start py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-end">Ends</Label>
              <DatePicker
                id="camp-end"
                value={fromDateInput(end) ?? undefined}
                onChange={(d) => setEnd(d ? toDateInput(d) : "")}
                placeholder="End date"
                className="w-full justify-start py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-budget">Budget ($)</Label>
              <Input
                id="camp-budget"
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="10000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-url">Landing URL</Label>
              <Input
                id="camp-url"
                value={landingUrl ?? ""}
                onChange={(e) => setLandingUrl(e.target.value)}
                placeholder="https://wander.com/ski"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Target channels</Label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => {
                const on = channels.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleChannel(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    {platformLabel(c)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Accent color</Label>
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(color === c ? "" : c)}
                  aria-label={`color ${c}`}
                  className={`size-6 rounded-full transition-transform ${
                    color === c
                      ? "ring-ring ring-offset-background scale-110 ring-2 ring-offset-2"
                      : "hover:scale-105"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Save" : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
