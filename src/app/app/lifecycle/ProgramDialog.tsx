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
  LifecycleKind,
  LifecycleProgramPriority,
  LifecycleProgramStatus,
  LifecycleWorkspace,
  TouchpointChannel,
} from "@/server/db/schema";
import { orpc } from "@/orpc/client";

export type ProgramDraft = {
  id?: string;
  brandId: string;
  name: string;
  description?: string | null;
  kind: LifecycleKind;
  status: LifecycleProgramStatus;
  priority: LifecycleProgramPriority;
  workspace?: LifecycleWorkspace;
  intendedTrigger?: string | null;
  intendedChannels?: TouchpointChannel[] | null;
  targetTouchpoints?: number | null;
};

const KINDS = [
  ["onboarding", "Onboarding"],
  ["abandoned_cart", "Abandoned cart"],
  ["reactivation", "Reactivation"],
  ["revival", "Revival"],
  ["transactional", "Transactional"],
  ["behavioral", "Behavioral"],
  ["broadcast", "Broadcast"],
  ["outbound", "Outbound (cold prospecting)"],
  ["other", "Other"],
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

const WORKSPACES = [
  ["marketplace", "Marketplace"],
  ["os", "WanderOS"],
  ["shared", "Shared"],
] as const;

const CHANNELS: TouchpointChannel[] = [
  "email",
  "sms",
  "push",
  "in_app",
  "bdr_task",
  "slack",
  "webhook",
  "other",
];

export function ProgramDialog({
  open,
  onOpenChange,
  brands,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: { id: string; name: string }[];
  initial?: ProgramDraft;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial?.id);

  const [brandId, setBrandId] = useState(
    initial?.brandId ?? brands[0]?.id ?? "",
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<LifecycleKind>(initial?.kind ?? "other");
  const [status, setStatus] = useState<LifecycleProgramStatus>(
    initial?.status ?? "planned",
  );
  const [priority, setPriority] = useState<LifecycleProgramPriority>(
    initial?.priority ?? "should_have",
  );
  const [workspace, setWorkspace] = useState<LifecycleWorkspace>(
    initial?.workspace ?? "marketplace",
  );
  const [intendedTrigger, setIntendedTrigger] = useState(
    initial?.intendedTrigger ?? "",
  );
  const [channels, setChannels] = useState<TouchpointChannel[]>(
    initial?.intendedChannels ?? [],
  );
  const [targetTouchpoints, setTargetTouchpoints] = useState(
    initial?.targetTouchpoints != null ? String(initial.targetTouchpoints) : "",
  );

  // Re-seed the form whenever a different program is opened for editing.
  useEffect(() => {
    if (!open) return;
    setBrandId(initial?.brandId ?? brands[0]?.id ?? "");
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setKind(initial?.kind ?? "other");
    setStatus(initial?.status ?? "planned");
    setPriority(initial?.priority ?? "should_have");
    setWorkspace(initial?.workspace ?? "marketplace");
    setIntendedTrigger(initial?.intendedTrigger ?? "");
    setChannels(initial?.intendedChannels ?? []);
    setTargetTouchpoints(
      initial?.targetTouchpoints != null
        ? String(initial.targetTouchpoints)
        : "",
    );
  }, [open, initial, brands]);

  const invalidate = () =>
    queryClient.invalidateQueries(
      orpc.lifecycle.overview.queryOptions({ input: {} }),
    );

  const create = useMutation(
    orpc.lifecycle.createProgram.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to create program"),
    }),
  );
  const update = useMutation(
    orpc.lifecycle.updateProgram.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to update program"),
    }),
  );

  const pending = create.isPending || update.isPending;

  function submit() {
    if (!name.trim()) return toast.error("Name is required");
    if (!isEdit && !brandId) return toast.error("Pick a brand");
    const shared = {
      name: name.trim(),
      description: description.trim() || undefined,
      kind,
      status,
      priority,
      workspace,
      intendedTrigger: intendedTrigger.trim() || null,
      intendedChannels: channels,
      targetTouchpoints: targetTouchpoints ? Number(targetTouchpoints) : null,
    };
    if (isEdit && initial?.id) {
      update.mutate({ programId: initial.id, changes: shared });
    } else {
      create.mutate({ brandId, ...shared });
    }
  }

  function toggleChannel(c: TouchpointChannel) {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit program" : "New program"}</DialogTitle>
          <DialogDescription>
            Describe the journey you <em>want</em> to exist. Link it to the
            Customer.io campaigns that fulfil it to track coverage.
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
            <Label htmlFor="prog-name">Name</Label>
            <Input
              id="prog-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dormant host winback"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prog-desc">Why we want it</Label>
            <Textarea
              id="prog-desc"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Hosts inactive 30+ days should get a 3-step re-engagement…"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Workspace</Label>
              <Select
                value={workspace}
                onValueChange={(v) => setWorkspace(v as LifecycleWorkspace)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKSPACES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as LifecycleKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map(([v, l]) => (
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
                onValueChange={(v) => setStatus(v as LifecycleProgramStatus)}
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
                  setPriority(v as LifecycleProgramPriority)
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prog-trigger">Intended trigger</Label>
              <Input
                id="prog-trigger"
                value={intendedTrigger ?? ""}
                onChange={(e) => setIntendedTrigger(e.target.value)}
                placeholder="host_signed_up"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prog-steps">Target touchpoints</Label>
              <Input
                id="prog-steps"
                type="number"
                min={0}
                value={targetTouchpoints}
                onChange={(e) => setTargetTouchpoints(e.target.value)}
                placeholder="3"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Intended channels</Label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => {
                const on = channels.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleChannel(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-colors ${
                      on
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    {c.replace("_", " ")}
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
            {isEdit ? "Save" : "Create program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
