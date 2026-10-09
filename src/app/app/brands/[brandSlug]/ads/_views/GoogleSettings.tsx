"use client";

import type { DeliveryGeography } from "@/server/db/ads-schema";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/orpc/client";

type GoogleConfig = {
  goal?: "traffic" | "engagement" | "awareness" | "conversions";
  geography?: DeliveryGeography;
  campaignType?: "search" | "display";
  keywords?: string[];
  negativeKeywords?: string[];
  businessName?: string;
};

/**
 * Google needs two things the first-party campaign cannot express: a campaign
 * TYPE, which decides everything else, and keywords, without which a Search
 * campaign buys nothing. Kept beside the campaign rather than asked at push
 * time so the decision is reviewable before anyone spends.
 */
export function GoogleSettings({
  platformCampaignId,
  config,
  compact = false,
  defaultOpen = false,
  onClose,
  budget,
  budgetType,
  endAt,
}: {
  /** The Google platform DRAFT row the settings live on. */
  platformCampaignId: string;
  config: GoogleConfig | undefined;
  /**
   * Inside a platform section the surrounding row already says which platform
   * this is and why it is blocked, so only the control is rendered.
   */
  compact?: boolean;
  defaultOpen?: boolean;
  onClose?: () => void;
  budget?: number | null;
  budgetType?: string | null;
  endAt?: Date | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [campaignType, setCampaignType] = useState<"search" | "display">(
    config?.campaignType ?? "search",
  );
  const [amount, setAmount] = useState(budget?.toString() ?? "");
  const [period, setPeriod] = useState(
    budgetType === "lifetime" ? "lifetime" : "daily",
  );
  const [end, setEnd] = useState(
    endAt ? new Date(endAt).toISOString().slice(0, 10) : "",
  );
  const budgetValid =
    period === "daily" &&
    (amount === "" || (Number.isInteger(Number(amount)) && Number(amount) > 0));
  const [goal, setGoal] = useState(config?.goal ?? "");
  const [geography, setGeography] = useState(config?.geography ?? {});
  const [negatives, setNegatives] = useState(
    (config?.negativeKeywords ?? []).join("\n"),
  );

  const save = useMutation(
    orpc.ads.setPlatformDraft.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        onClose?.();
        router.refresh();
      },
    }),
  );

  const lines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const configured = Boolean(config?.campaignType);

  return (
    <section className="space-y-3">
      {compact ? (
        !open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {configured ? "Edit Google settings" : "Set up Google"}
          </Button>
        )
      ) : (
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold">Google settings</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {configured
                ? `${config?.campaignType === "search" ? "Search" : "Display"} campaign${
                    config?.campaignType === "search"
                      ? ` · ${(config.keywords ?? []).length} fallback keywords`
                      : ""
                  }`
                : "Not set. Google needs a campaign type before it can be pushed."}
            </p>
          </div>
          {!open && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              {configured ? "Edit" : "Set up Google"}
            </Button>
          )}
        </div>
      )}

      {open && (
        <div
          className={
            compact
              ? "space-y-4"
              : "space-y-3 rounded-xl border border-border bg-surface-secondary/30 p-3"
          }
        >
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-type">Campaign type</Label>
              <Select
                value={campaignType}
                onValueChange={(value) =>
                  setCampaignType(value as "search" | "display")
                }
              >
                <SelectTrigger id="g-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="search">Search</SelectItem>
                  <SelectItem value="display">Display</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="google-goal">Goal</Label>
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger id="google-goal" className="w-full">
                  <SelectValue placeholder="Choose a goal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="traffic">Traffic</SelectItem>
                  <SelectItem value="engagement">Engagement</SelectItem>
                  <SelectItem value="awareness">Awareness</SelectItem>
                  <SelectItem value="conversions">Conversions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {goal === "conversions" && (
            <p className="text-sm text-muted-foreground">
              Maximize Conversions uses this Google account&apos;s default
              conversion goals. Confirm booking tracking is active before
              launching.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="google-budget">
                {period === "daily"
                  ? "Daily budget ($)"
                  : "Existing lifetime total ($)"}
              </Label>
              <Input
                id="google-budget"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="google-budget-period">Budget period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger id="google-budget-period" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="lifetime" disabled>
                    Lifetime (unsupported)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="google-end">Flight end date</Label>
              <Input
                id="google-end"
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>

          {budgetType === "lifetime" && (
            <p className="text-sm text-muted-foreground">
              Google accepts daily budgets only. Replace the lifetime total with
              your intended daily amount and select Daily before saving.
            </p>
          )}
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Campaign location targeting</p>
            <p className="text-xs text-muted-foreground">
              Locations apply to every Google ad group. State and country
              targets are combined, so selecting US alongside Ohio includes the
              whole country.
            </p>
            <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
              {(["states", "countries", "regions", "cities"] as const).map(
                (key) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`${platformCampaignId}-${key}`}>
                      {key === "states"
                        ? "US states (codes)"
                        : key === "countries"
                          ? "Countries (ISO codes)"
                          : key === "regions"
                            ? "International regions"
                            : "City targets"}
                    </Label>
                    <Textarea
                      id={`${platformCampaignId}-${key}`}
                      rows={2}
                      value={(geography[key] ?? []).join("\n")}
                      onChange={(event) =>
                        setGeography({
                          ...geography,
                          [key]: lines(event.target.value),
                        })
                      }
                      placeholder={
                        key === "states"
                          ? "OH\nPA\nIN"
                          : key === "countries"
                            ? "US"
                            : "One location per line"
                      }
                    />
                  </div>
                ),
              )}
            </div>
          </div>
          {campaignType === "search" ? (
            <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="g-negatives">Campaign negative keywords</Label>
                <Textarea
                  id="g-negatives"
                  rows={4}
                  value={negatives}
                  onChange={(event) => setNegatives(event.target.value)}
                  placeholder={"free\njobs"}
                  textSize="xs"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Display uses the campaign&apos;s creative. Google needs a
              landscape and a square image; the first ad&apos;s creative is used
              for both until sized variants exist.
            </p>
          )}

          {save.error && (
            <p className="text-xs text-red-300">{save.error.message}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={save.isPending}
              disabled={!goal || !budgetValid}
              onClick={() =>
                save.mutate({
                  platformCampaignId,
                  budget: amount ? Number(amount) : null,
                  budgetType: period as "daily" | "lifetime",
                  endAt: end ? `${end}T23:59:59.000Z` : null,
                  google: {
                    geography,
                    goal: goal as NonNullable<GoogleConfig["goal"]>,
                    campaignType,
                    negativeKeywords:
                      campaignType === "search" ? lines(negatives) : undefined,
                  },
                })
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                onClose?.();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
