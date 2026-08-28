"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/trpc/react";

const GOALS = [
  "traffic",
  "engagement",
  "awareness",
  "video_views",
  "conversions",
] as const;

/**
 * Create the draft on Meta, PAUSED — one campaign, one ad set, all drafted
 * ads, through the allowlisted destination. Spend starts only when the
 * delivery switch is flipped afterwards, so this click creates structure,
 * not cost.
 */
export function PushToPlatform({
  campaignId,
  brandSlug,
  spotCount,
  defaultBudget,
  platform = "meta_ads",
  adSetCount = 0,
}: {
  campaignId: string;
  brandSlug: string;
  spotCount: number;
  defaultBudget: number | null;
  platform?: "meta_ads" | "google_ads";
  adSetCount?: number;
}) {
  const isMeta = platform === "meta_ads";
  const platformLabel = isMeta ? "Meta" : "Google";
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<(typeof GOALS)[number]>("traffic");
  const [budget, setBudget] = useState(
    defaultBudget != null ? String(defaultBudget) : "",
  );
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [destinationKey, setDestinationKey] = useState("");

  const destinations = useQuery(
    trpc.ads.destinations.queryOptions(
      { brandSlug, platform: isMeta ? "meta" : "google" },
      { enabled: open },
    ),
  );
  const options = (destinations.data?.destinations ?? []).map((row) => ({
    key: `${row.connectionAccountId}:${row.adAccountId}`,
    label: `${row.adAccountName ?? row.adAccountId}`,
    connectionAccountId: row.connectionAccountId,
    adAccountId: row.adAccountId,
  }));
  const chosen =
    options.find((option) => option.key === destinationKey) ??
    (options.length === 1 ? options[0] : undefined);

  const push = useMutation(
    trpc.ads.pushDraftToPlatform.mutationOptions({
      onSuccess: (result) => {
        // A dry run stays open to show its result; a real push lands on the
        // campaign the platform just created.
        if (!result.validateOnly) {
          setOpen(false);
          if (result.path) router.push(result.path);
          else router.refresh();
        }
      },
    }),
  );

  const budgetNumber = Number(budget);
  const canPush =
    Boolean(chosen) &&
    Number.isFinite(budgetNumber) &&
    budgetNumber > 0 &&
    !push.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UploadCloud className="size-3.5" />
          Push to {platformLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Push this draft to {platformLabel}?</DialogTitle>
          <DialogDescription>
            Creates the campaign,{" "}
            {adSetCount > 1 ? `${adSetCount} ad sets` : "one ad set"}, and{" "}
            {spotCount} ad{spotCount === 1 ? "" : "s"} on {platformLabel} — all
            PAUSED. Nothing spends until you hit Launch on the campaign
            afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="push-dest">Ad account</Label>
            <select
              id="push-dest"
              value={chosen?.key ?? ""}
              onChange={(event) => setDestinationKey(event.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="" disabled>
                {destinations.isPending
                  ? "Loading destinations…"
                  : options.length === 0
                    ? "No allowlisted destination — allow an ad account first"
                    : "Pick the destination"}
              </option>
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="push-goal">Goal</Label>
              <select
                id="push-goal"
                value={goal}
                onChange={(event) =>
                  setGoal(event.target.value as typeof goal)
                }
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {GOALS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="push-budget">Budget ($)</Label>
              <Input
                id="push-budget"
                type="number"
                min={1}
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                placeholder="2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="push-budget-type">Type</Label>
              <select
                id="push-budget-type"
                value={budgetType}
                onChange={(event) =>
                  setBudgetType(event.target.value as typeof budgetType)
                }
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="daily">daily</option>
                <option value="lifetime">lifetime</option>
              </select>
            </div>
          </div>
          {push.error && (
            <p className="text-xs text-red-300">{push.error.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            size="sm"
            variant="outline"
            title={
              adSetCount > 1
                ? "Meta has no dry run for the multi-ad-set shape"
                : undefined
            }
            disabled={!canPush || (isMeta && adSetCount > 1)}
            loading={push.isPending}
            onClick={() =>
              chosen &&
              push.mutate({
                campaignId,
                platform,
                connectionAccountId: chosen.connectionAccountId,
                adAccountId: chosen.adAccountId,
                goal,
                budgetAmount: budgetNumber,
                budgetType,
                validateOnly: true,
              })
            }
          >
            Dry run
          </Button>
          <Button
            size="sm"
            disabled={!canPush}
            loading={push.isPending}
            onClick={() =>
              chosen &&
              push.mutate({
                campaignId,
                platform,
                connectionAccountId: chosen.connectionAccountId,
                adAccountId: chosen.adAccountId,
                goal,
                budgetAmount: budgetNumber,
                budgetType,
              })
            }
          >
            Push paused
          </Button>
        </DialogFooter>
        {push.isSuccess && push.data.validateOnly && (
          <p className="text-xs text-emerald-400">
            Dry run passed — Meta validated the whole tree without creating it.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
