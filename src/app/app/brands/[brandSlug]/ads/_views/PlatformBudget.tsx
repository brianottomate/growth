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
}: {
  platformCampaignId: string;
  budget: number | null;
  budgetType: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(budget != null ? String(budget) : "");
  const [type, setType] = useState<"daily" | "lifetime">(
    budgetType === "lifetime" ? "lifetime" : "daily",
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
  const valid = Number.isFinite(parsed) && parsed > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={budget ? "ghost" : "outline"}>
          {budget
            ? `${money(budget)}${budgetType === "lifetime" ? " lifetime" : "/day"}`
            : "Set budget"}
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
          <p className="text-xs text-muted-foreground">
            A lifetime budget needs an end date on the campaign — it is the date
            the spend stops.
          </p>
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
            })
          }
        >
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}
