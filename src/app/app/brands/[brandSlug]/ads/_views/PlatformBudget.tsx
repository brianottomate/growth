"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc } from "@/orpc/client";

import { money } from "./format";

/**
 * The AUTHORITATIVE budget on a platform draft — the number the push sends,
 * in the ad account's currency. Plan budgets elsewhere are advisory.
 */
export function PlatformBudget({
  platformCampaignId,
  budget,
  budgetType,
  endAt,
  label,
}: {
  platformCampaignId: string;
  budget: number | null;
  budgetType: string | null;
  endAt?: Date | null;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(budget != null ? String(budget) : "");
  const [type, setType] = useState<"daily" | "lifetime">(
    budgetType === "lifetime" ? "lifetime" : "daily",
  );

  const [end, setEnd] = useState(
    endAt ? new Date(endAt).toISOString().slice(0, 10) : "",
  );

  const save = useMutation(
    orpc.ads.setPlatformDraft.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );

  const parsed = Number(amount);
  const valid =
    Number.isFinite(parsed) &&
    parsed > 0 &&
    (type !== "lifetime" ||
      Boolean(end && new Date(`${end}T23:59:59.000Z`).getTime() > Date.now()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={budget ? "ghost" : "outline"}>
          {label ??
            (budget
              ? `${money(budget)}${budgetType === "lifetime" ? " lifetime" : "/day"}`
              : "Set budget")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pb-amount">Budget ($)</Label>
          <Input
            id="pb-amount"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="5"
          />
        </div>
        <div className="flex gap-1.5">
          {(["daily", "lifetime"] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={type === option ? "default" : "outline"}
              onClick={() => setType(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        {type === "lifetime" && (
          <div className="space-y-2">
            <Label htmlFor="pb-end">Flight end date</Label>
            <Input
              id="pb-end"
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const date = new Date();
                date.setUTCMonth(date.getUTCMonth() + 1);
                setEnd(date.toISOString().slice(0, 10));
              }}
            >
              One month from today
            </Button>
            <p className="text-xs text-muted-foreground">
              Push creates a paused campaign. This fixed end date does not move
              when you launch.
            </p>
          </div>
        )}
        {save.error && (
          <p className="text-xs text-red-300">{save.error.message}</p>
        )}
        <Button
          size="sm"
          className="w-full"
          disabled={!valid}
          loading={save.isPending}
          onClick={() =>
            save.mutate({
              platformCampaignId,
              budget: parsed,
              budgetType: type,
              ...(type === "lifetime" ? { endAt: `${end}T23:59:59.000Z` } : {}),
            })
          }
        >
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}
