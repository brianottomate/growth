"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
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
 * from the platform draft. With the setup saved (ad account, Page, goal) a
 * short confirmation says what will be created, since a pushed ad is locked;
 * spend starts only when the delivery switch is flipped afterwards. Without
 * the setup, a dialog asks for the destination and the goal. Once confirmed,
 * the dialog closes and the existing background job owns push progress.
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
      enabled: open && !configuration,
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
      onMutate: () => {
        setOpen(false);
        toast.info(
          `Pushing to ${platformName}. Follow progress in Background work.`,
        );
      },
      onError: (error) => toast.error(error.message),
      onSuccess: (result) => {
        toast.success(`Campaign pushed to ${platformName}, paused.`);
        if ("warnings" in result) {
          for (const warning of result.warnings ?? []) toast.warning(warning);
        }
        // The push lands on the platform campaign it just made real.
        setOpen(false);
        if (configuration) router.refresh();
        else if ("path" in result && result.path) router.push(result.path);
        else router.refresh();
      },
    }),
  );

  const canPush =
    Boolean(chosen) && budget != null && budget > 0 && !push.isPending;
  const groupLabel = platform === "google_ads" ? "ad group" : "ad set";
  const setSummary =
    audienceCount === 0
      ? `1 broad ${groupLabel}`
      : `${audienceCount} ${groupLabel}${audienceCount === 1 ? "" : "s"}`;
  const budgetSummary =
    budget != null
      ? `${money(budget)}${budgetType === "lifetime" ? " lifetime" : "/day"}`
      : "no budget";
  if (configuration) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              disabled={!canPush}
              loading={push.isPending}
              title={
                budget == null
                  ? `Set the budget on the ${platformName} draft first`
                  : undefined
              }
            >
              <UploadCloud className="size-3.5" />
              {push.isPending
                ? "Pushing…"
                : platform === "meta_ads"
                  ? "Push to Meta"
                  : `Push to ${platformName}`}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Push to {platformName}?</DialogTitle>
              <DialogDescription>
                {`Create ${setSummary} × ${draftAdCount} ad${draftAdCount === 1 ? "" : "s"} per group (${Math.max(1, audienceCount) * draftAdCount} total) on ${configuration.label} with a ${budgetSummary} ${budgetType === "lifetime" ? "" : "campaign "}budget. Everything will be paused. Review in ${platformName} before launching.`}
              </DialogDescription>
            </DialogHeader>
            {platform === "google_ads" && goal === "conversions" && (
              <p className="text-sm text-muted-foreground">
                Bidding: Maximize Conversions, using the account&apos;s default
                conversion goals.
              </p>
            )}
            {push.error && (
              <p
                role="alert"
                className="min-w-0 text-sm [overflow-wrap:anywhere] break-words text-destructive"
              >
                {push.error.message}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={push.isPending}
                disabled={!canPush}
                onClick={() =>
                  push.mutate({
                    campaignId,
                    platform,
                    connectionAccountId: configuration.connectionAccountId,
                    adAccountId: configuration.adAccountId,
                    goal,
                  })
                }
              >
                {push.isPending ? "Pushing…" : `Push to ${platformName}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {push.error && (
          <p
            role="alert"
            title={push.error.message}
            className="line-clamp-3 max-w-md min-w-0 text-right text-xs [overflow-wrap:anywhere] break-words text-destructive"
          >
            {push.error.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={push.isPending} loading={push.isPending}>
          <UploadCloud className="size-3.5" />
          {push.isPending ? "Pushing…" : `Push to ${platformName}`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Push this plan to {platformName}?</DialogTitle>
          <DialogDescription>
            Compiles {setSummary} × {draftAdCount} ad
            {draftAdCount === 1 ? "" : "s"} at {budgetSummary}, all paused.
            Nothing spends until you launch.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
                onChange={(event) => setGoal(event.target.value as typeof goal)}
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
            Push
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
