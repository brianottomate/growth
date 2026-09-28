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
import { Label } from "@/components/ui/label";
import {
  requireAdPlatformSpec,
  zernioAdPlatformKey,
  type AdPushGoal,
  type PushableAdPlatform,
} from "@/lib/ad-platforms";
import { orpc } from "@/orpc/client";

import { money } from "./format";

/**
 * Compile the plan onto one platform, PAUSED. Budget, dates and settings come
 * from the platform draft, so this dialog asks only for the destination and
 * the goal — the click is the approval, and spend starts only when the
 * delivery switch is flipped afterwards.
 */
export function PushToPlatform({
  campaignId,
  brandSlug,
  platform,
  draftAdCount,
  audienceCount,
  budget,
  budgetType,
  configuration,
}: {
  campaignId: string;
  brandSlug: string;
  platform: PushableAdPlatform;
  draftAdCount: number;
  audienceCount: number;
  budget: number | null;
  budgetType: string | null;
  configuration?: {
    connectionAccountId: string;
    adAccountId: string;
    goal: AdPushGoal;
    label: string;
  };
}) {
  const spec = requireAdPlatformSpec(platform);
  const platformName = spec.shortLabel;
  const goals = spec.features.goals;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedGoal, setGoal] = useState<AdPushGoal>(goals[0] ?? "traffic");
  const goal = configuration?.goal ?? selectedGoal;
  const [destinationKey, setDestinationKey] = useState("");

  const destinations = useQuery(
    orpc.ads.destinations.queryOptions({
      input: { brandSlug, platform: zernioAdPlatformKey(platform) },
      enabled: open,
    }),
  );
  // A Meta destination names the Page it runs as, because that is the
  // identity the client's ads will carry; one bound to the wrong Page is
  // listed so the mismatch is visible, and the push refuses it.
  const options = (destinations.data?.destinations ?? []).map((row) => ({
    key: `${row.connectionAccountId}:${row.adAccountId}`,
    label: `${row.adAccountName ?? row.adAccountId}${
      row.pageId
        ? ` · as Page ${row.pageId}${row.runsAsBrandPage ? "" : " (not this brand's Page)"}`
        : ""
    }`,
    connectionAccountId: row.connectionAccountId,
    adAccountId: row.adAccountId,
  }));
  const chosen = configuration
    ? {
        ...configuration,
        key: `${configuration.connectionAccountId}:${configuration.adAccountId}`,
      }
    : (options.find((option) => option.key === destinationKey) ??
      (options.length === 1 ? options[0] : undefined));

  const push = useMutation(
    orpc.ads.pushDraftToPlatform.mutationOptions({
      onSuccess: (result) => {
        // The push lands on the platform campaign it just made real.
        setOpen(false);
        if (configuration) router.refresh();
        else if ("path" in result && result.path) router.push(result.path);
        else router.refresh();
      },
    }),
  );

  const canPush = Boolean(chosen) && budget != null && !push.isPending;
  const setSummary =
    audienceCount === 0
      ? "1 broad ad set"
      : `${audienceCount} ad set${audienceCount === 1 ? "" : "s"}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UploadCloud className="size-3.5" />
          Push to {platformName}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Push this plan to {platformName}?</DialogTitle>
          <DialogDescription>
            Compiles {setSummary} × {draftAdCount} ad
            {draftAdCount === 1 ? "" : "s"} at{" "}
            {budget != null
              ? `${money(budget)}${budgetType === "lifetime" ? " lifetime" : "/day"}`
              : "no budget"}
            , all paused. Nothing spends until you launch.
          </DialogDescription>
        </DialogHeader>
        {configuration && (
          <p className="text-sm">
            {configuration.label} · {goal}
          </p>
        )}
        <div className="space-y-3">
          {!configuration && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="push-destination">Ad account</Label>
                <select
                  id="push-destination"
                  value={chosen?.key ?? ""}
                  onChange={(event) => setDestinationKey(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="" disabled>
                    {destinations.isPending
                      ? "Loading destinations…"
                      : options.length === 0
                        ? "No allowlisted destination"
                        : "Pick the ad account"}
                  </option>
                  {options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="push-goal">Goal</Label>
                <select
                  id="push-goal"
                  value={goal}
                  onChange={(event) =>
                    setGoal(event.target.value as typeof goal)
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {goals.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          {destinations.error && (
            <p role="alert">{destinations.error.message}</p>
          )}
          {budget == null && (
            <p className="text-xs text-amber-400">
              Set the budget on the {platformName} draft first — the push sends
              that number.
            </p>
          )}
          {push.error && (
            <p className="text-xs text-red-300">{push.error.message}</p>
          )}
        </div>
        <DialogFooter>
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
              })
            }
          >
            Push paused
          </Button>
        </DialogFooter>
        {push.isSuccess &&
          "warnings" in push.data &&
          (push.data.warnings ?? []).map((warning) => (
            <p key={warning} className="text-xs text-amber-400">
              {warning}
            </p>
          ))}
      </DialogContent>
    </Dialog>
  );
}
