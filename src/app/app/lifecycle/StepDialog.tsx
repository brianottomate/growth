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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type {
  LifecycleStepStatus,
  LifecycleStepSystem,
  TouchpointChannel,
} from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";

export type StepDraft = {
  id?: string;
  programId: string;
  name: string;
  channel: TouchpointChannel;
  status: LifecycleStepStatus;
  system?: LifecycleStepSystem | null;
  delayMinutes?: number | null;
  subject?: string | null;
  body?: string | null;
  url?: string | null;
  campaignId?: string | null;
  parentStepId?: string | null;
  branchLabel?: string | null;
};

type DelayUnit = "minutes" | "hours" | "days";
const UNIT_MIN: Record<DelayUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

/** Pick the cleanest amount+unit to represent a minute count for editing. */
function decomposeDelay(min: number | null | undefined): {
  amount: string;
  unit: DelayUnit;
} {
  if (min == null) return { amount: "", unit: "days" };
  if (min !== 0 && min % 1440 === 0)
    return { amount: String(min / 1440), unit: "days" };
  if (min !== 0 && min % 60 === 0)
    return { amount: String(min / 60), unit: "hours" };
  if (min === 0) return { amount: "0", unit: "days" };
  return { amount: String(min), unit: "minutes" };
}

const STATUSES: [LifecycleStepStatus, string][] = [
  ["planned", "Planned"],
  ["active", "Active"],
  ["missing", "Missing"],
];

const SYSTEMS: [LifecycleStepSystem, string][] = [
  ["customerio", "Customer.io"],
  ["resend", "Resend (in-app email)"],
  ["postmark", "Postmark (product email)"],
  ["outreach", "Outreach"],
  ["instantly", "Instantly (cold email)"],
  ["amplitude", "Amplitude"],
  ["system", "Product / backend"],
  ["human", "Human (BDR / concierge)"],
  ["other", "Other"],
];

const CHANNELS: [TouchpointChannel, string][] = [
  ["email", "Email"],
  ["bdr_task", "BDR task"],
  ["slack", "Slack"],
  ["sms", "SMS"],
  ["push", "Push"],
  ["in_app", "In app"],
  ["webhook", "Webhook"],
  ["other", "Other"],
];

const NONE = "__none__";

export function StepDialog({
  open,
  onOpenChange,
  programId,
  campaigns,
  steps,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  campaigns: { id: string; name: string }[];
  /** Sibling steps of the program — candidates for "branches from". */
  steps: { id: string; name: string }[];
  initial?: StepDraft;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial?.id);

  const [name, setName] = useState(initial?.name ?? "");
  const [channel, setChannel] = useState<TouchpointChannel>(
    initial?.channel ?? "email",
  );
  const [status, setStatus] = useState<LifecycleStepStatus>(
    initial?.status ?? "planned",
  );
  const initialDelay = decomposeDelay(initial?.delayMinutes);
  const [delayAmount, setDelayAmount] = useState(initialDelay.amount);
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(initialDelay.unit);
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [campaignId, setCampaignId] = useState(initial?.campaignId ?? NONE);
  const [system, setSystem] = useState(initial?.system ?? NONE);
  const [parentStepId, setParentStepId] = useState(
    initial?.parentStepId ?? NONE,
  );
  const [branchLabel, setBranchLabel] = useState(initial?.branchLabel ?? "");

  useEffect(() => {
    if (!open) return;
    const d = decomposeDelay(initial?.delayMinutes);
    setName(initial?.name ?? "");
    setChannel(initial?.channel ?? "email");
    setStatus(initial?.status ?? "planned");
    setDelayAmount(d.amount);
    setDelayUnit(d.unit);
    setSubject(initial?.subject ?? "");
    setBody(initial?.body ?? "");
    setUrl(initial?.url ?? "");
    setCampaignId(initial?.campaignId ?? NONE);
    setSystem(initial?.system ?? NONE);
    setParentStepId(initial?.parentStepId ?? NONE);
    setBranchLabel(initial?.branchLabel ?? "");
  }, [open, initial]);

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.lifecycle.overview.queryOptions());

  const add = useMutation(
    trpc.lifecycle.addStep.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to add step"),
    }),
  );
  const update = useMutation(
    trpc.lifecycle.updateStep.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to update step"),
    }),
  );
  const pending = add.isPending || update.isPending;

  function submit() {
    if (!name.trim()) return toast.error("Name is required");
    const delayMinutes =
      delayAmount.trim() === ""
        ? null
        : Math.round(Number(delayAmount) * UNIT_MIN[delayUnit]);
    const shared = {
      name: name.trim(),
      channel,
      status,
      system: system === NONE ? null : (system as LifecycleStepSystem),
      delayMinutes,
      subject: subject.trim() || null,
      body: body.trim() || null,
      url: url.trim() || null,
      campaignId: campaignId === NONE ? null : campaignId,
      parentStepId: parentStepId === NONE ? null : parentStepId,
      branchLabel: parentStepId === NONE ? null : branchLabel.trim() || null,
    };
    if (isEdit && initial?.id) {
      update.mutate({ id: initial.id, ...shared });
    } else {
      add.mutate({ programId, ...shared });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit step" : "Add step"}</DialogTitle>
          <DialogDescription>
            A touchpoint in the journey — an email, BDR task, or Slack nudge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="step-name">Name</Label>
            <Input
              id="step-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Welcome email"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as TouchpointChannel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map(([v, l]) => (
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
                onValueChange={(v) => setStatus(v as LifecycleStepStatus)}
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="step-delay">Send after (from start)</Label>
              <div className="flex gap-2">
                <Input
                  id="step-delay"
                  type="number"
                  min={0}
                  value={delayAmount}
                  onChange={(e) => setDelayAmount(e.target.value)}
                  placeholder="0"
                  className="w-20"
                />
                <Select
                  value={delayUnit}
                  onValueChange={(v) => setDelayUnit(v as DelayUnit)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="minutes">Minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="step-subject">Subject / gist</Label>
              <Input
                id="step-subject"
                value={subject ?? ""}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Welcome to Wander"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="step-body">Copy</Label>
            <Textarea
              id="step-body"
              value={body ?? ""}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                "The actual email copy. Merge tags like {{firstName}} / {{companyName}} render in Instantly."
              }
              rows={6}
              textSize="xs"
              monospace
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>System</Label>
              <Select value={system} onValueChange={setSystem}>
                <SelectTrigger>
                  <SelectValue placeholder="Untagged" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Untagged</SelectItem>
                  {SYSTEMS.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="step-url">Resource URL</Label>
              <Input
                id="step-url"
                value={url ?? ""}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… (CIO action, sequence)"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Branches from</Label>
              <Select value={parentStepId} onValueChange={setParentStepId}>
                <SelectTrigger>
                  <SelectValue placeholder="Main path" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Main path</SelectItem>
                  {steps
                    .filter((s) => s.id !== initial?.id)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="step-branch">Branch condition</Label>
              <Input
                id="step-branch"
                value={branchLabel}
                onChange={(e) => setBranchLabel(e.target.value)}
                placeholder="no reply after 3d"
                disabled={parentStepId === NONE}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Delivered by (Customer.io)</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder="Not linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not linked</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Optional — just a signal this step exists in Customer.io.
            </p>
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
            {isEdit ? "Save" : "Add step"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
