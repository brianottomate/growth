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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type {
  AudienceTargetPriority,
  AudienceTargetStatus,
  AudienceType,
  ChannelPlatform,
} from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";

export type TargetDraft = {
  id?: string;
  brandId: string;
  name: string;
  description?: string | null;
  type: AudienceType;
  status: AudienceTargetStatus;
  priority: AudienceTargetPriority;
  intendedChannels?: string[] | null;
  sizeGoalLabel?: string | null;
};

const TYPES = [
  ["segment", "Segment"],
  ["keyword", "Keyword"],
  ["intent", "Intent"],
  ["lookalike", "Lookalike"],
  ["custom", "Custom"],
] as const;

const STATUSES = [
  ["idea", "Idea"],
  ["planned", "Planned"],
  ["active", "Active"],
  ["retired", "Retired"],
] as const;

const PRIORITIES = [
  ["must_have", "Must have"],
  ["should_have", "Should have"],
  ["nice_to_have", "Nice to have"],
] as const;

// Audience targeting is a paid concept — offer the ad platforms.
const AD_PLATFORMS = [
  ["google_ads", "Google Ads"],
  ["meta_ads", "Meta Ads"],
  ["openai_ads", "OpenAI Ads"],
] as const;

export function TargetDialog({
  open,
  onOpenChange,
  brands,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: { id: string; name: string }[];
  initial?: TargetDraft;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial?.id);

  const [brandId, setBrandId] = useState(initial?.brandId ?? brands[0]?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<AudienceType>(initial?.type ?? "segment");
  const [status, setStatus] = useState<AudienceTargetStatus>(
    initial?.status ?? "planned",
  );
  const [priority, setPriority] = useState<AudienceTargetPriority>(
    initial?.priority ?? "should_have",
  );
  const [channels, setChannels] = useState<string[]>(
    initial?.intendedChannels ?? [],
  );
  const [sizeGoalLabel, setSizeGoalLabel] = useState(
    initial?.sizeGoalLabel ?? "",
  );

  useEffect(() => {
    if (!open) return;
    setBrandId(initial?.brandId ?? brands[0]?.id ?? "");
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setType(initial?.type ?? "segment");
    setStatus(initial?.status ?? "planned");
    setPriority(initial?.priority ?? "should_have");
    setChannels(initial?.intendedChannels ?? []);
    setSizeGoalLabel(initial?.sizeGoalLabel ?? "");
  }, [open, initial, brands]);

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.audience.overview.queryOptions());

  const create = useMutation(
    trpc.audience.createTarget.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to create target"),
    }),
  );
  const update = useMutation(
    trpc.audience.updateTarget.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to update target"),
    }),
  );
  const pending = create.isPending || update.isPending;

  function submit() {
    if (!name.trim()) return toast.error("Name is required");
    if (!isEdit && !brandId) return toast.error("Pick a brand");
    const shared = {
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      status,
      priority,
      intendedChannels: channels as ChannelPlatform[],
      sizeGoalLabel: sizeGoalLabel.trim() || null,
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
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit target" : "New audience target"}</DialogTitle>
          <DialogDescription>
            The canonical <em>who</em> you want to reach. Link the per-platform
            audiences that fulfil it to track which channels are covered.
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
            <Label htmlFor="tgt-name">Name</Label>
            <Input
              id="tgt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CA remote workers"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tgt-desc">Who they are</Label>
            <Textarea
              id="tgt-desc"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Remote-first professionals in California, 28–45…"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as AudienceType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setStatus(v as AudienceTargetStatus)
                }
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
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) =>
                  setPriority(v as AudienceTargetPriority)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tgt-size">Reach goal</Label>
            <Input
              id="tgt-size"
              value={sizeGoalLabel}
              onChange={(e) => setSizeGoalLabel(e.target.value)}
              placeholder="~500K"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Intended channels</Label>
            <div className="flex flex-wrap gap-1.5">
              {AD_PLATFORMS.map(([v, l]) => {
                const on = channels.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleChannel(v)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
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
            {isEdit ? "Save" : "Create target"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
