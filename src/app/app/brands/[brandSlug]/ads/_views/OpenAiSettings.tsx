"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OPENAI_BID_STRATEGIES,
  OPENAI_PUSH_GOALS,
  openAiBiddingRequirement,
  type OpenAiBidStrategy,
} from "@/lib/zernio-ads";
import { orpc } from "@/orpc/client";
import type { PlatformCampaignSettings } from "@/server/db/ads-schema";

type OpenAiConfig = NonNullable<PlatformCampaignSettings["openai"]>;
type Goal = OpenAiConfig["goal"] & string;

/**
 * What OpenAI needs beyond the first-party campaign: the goal, a fixed bid
 * where Maximize Results is refused (awareness, lifetime budgets), and the
 * tracking-tag event a conversions campaign optimises on. Kept on the draft
 * so the numbers are reviewable before anyone spends.
 */
export function OpenAiSettings({
  platformCampaignId,
  budgetType,
  config,
}: {
  /** The OpenAI platform DRAFT row the settings live on. */
  platformCampaignId: string;
  budgetType: string | null;
  config: OpenAiConfig | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<Goal>(config?.goal ?? "traffic");
  const [bidStrategy, setBidStrategy] = useState<OpenAiBidStrategy | "">(
    config?.bidStrategy ?? "",
  );
  const [bidAmount, setBidAmount] = useState(
    config?.bidAmount != null ? String(config.bidAmount) : "",
  );
  const [customEventType, setCustomEventType] = useState(
    config?.customEventType ?? "",
  );

  const save = useMutation(
    orpc.ads.setPlatformDraft.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );

  const parsedBid = Number(bidAmount);
  const bidValid =
    bidAmount === "" || (Number.isFinite(parsedBid) && parsedBid > 0);
  const biddingIssue = openAiBiddingRequirement({
    goal,
    budgetType: budgetType === "lifetime" ? "lifetime" : "daily",
    bidStrategy: bidStrategy || null,
    bidAmount: bidAmount === "" ? null : parsedBid,
  });
  const configured = Boolean(
    config?.goal || config?.bidStrategy || config?.customEventType,
  );

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {configured ? "Edit OpenAI settings" : "OpenAI settings"}
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-border bg-surface-secondary/30 p-3">
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="oa-goal">Goal</Label>
          <select
            id="oa-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value as Goal)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            {OPENAI_PUSH_GOALS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Conversions needs an optimizable event on the account&apos;s OpenAI
            tracking tag.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oa-event">Conversion event</Label>
          <Input
            id="oa-event"
            value={customEventType}
            disabled={goal !== "conversions"}
            onChange={(event) => setCustomEventType(event.target.value)}
            placeholder="Event id, type or name"
            textSize="xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oa-bid-strategy">Bidding</Label>
          <select
            id="oa-bid-strategy"
            value={bidStrategy}
            onChange={(event) =>
              setBidStrategy(event.target.value as OpenAiBidStrategy | "")
            }
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Maximize Results (automatic)</option>
            {OPENAI_BID_STRATEGIES.map((value) => (
              <option key={value} value={value}>
                {value.toLowerCase().replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Automatic bidding runs only for traffic and conversions on a daily
            budget; otherwise set a capped bid.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oa-bid">Bid ($, with a capped strategy)</Label>
          <Input
            id="oa-bid"
            inputMode="decimal"
            value={bidAmount}
            disabled={
              bidStrategy === "" || bidStrategy === "LOWEST_COST_WITHOUT_CAP"
            }
            onChange={(event) => setBidAmount(event.target.value)}
            placeholder="2"
            textSize="xs"
          />
        </div>
      </div>
      {biddingIssue && (
        <p className="text-xs text-amber-400">{biddingIssue}.</p>
      )}
      {save.error && (
        <p className="text-xs text-red-300">{save.error.message}</p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!bidValid}
          loading={save.isPending}
          onClick={() =>
            save.mutate({
              platformCampaignId,
              openai: {
                goal,
                bidStrategy: bidStrategy || undefined,
                bidAmount:
                  bidStrategy && bidAmount !== "" ? parsedBid : undefined,
                customEventType:
                  goal === "conversions"
                    ? customEventType.trim() || undefined
                    : undefined,
              },
            })
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
