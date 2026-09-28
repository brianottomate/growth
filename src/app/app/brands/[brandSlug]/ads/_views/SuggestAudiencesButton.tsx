"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

type Suggestion = {
  name: string;
  kind: "geo" | "lookalike" | "retargeting";
  cities: string[];
  states: string[];
  countries: string[];
  regions: string[];
  ageMin: number;
  ageMax: number;
  platformAudienceId: string | null;
  why: string;
};

/** Proposes audiences from the brand's evidence; each one is added on its own. */
export function SuggestAudiencesButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [refreshing, startTransition] = useTransition();
  const suggest = useMutation(
    orpc.ads.suggestCampaignAudiences.mutationOptions({
      onSuccess: () => setAdded([]),
      onError: (error) => toast.error(error.message),
    }),
  );
  const link = useMutation(orpc.ads.linkAudience.mutationOptions());
  const add = useMutation(
    orpc.ads.addAudience.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );
  const addOne = async (s: Suggestion) => {
    const audience = await add.mutateAsync({
      campaignId,
      name: s.name,
      ageMin: s.ageMin,
      ageMax: s.ageMax,
      countries: s.countries.length ? s.countries : undefined,
      states: s.states.length ? s.states : undefined,
      regions: s.regions.length ? s.regions : undefined,
      cities: s.cities.length ? s.cities : undefined,
    });
    if (s.platformAudienceId)
      await link.mutateAsync({
        platformAudienceId: s.platformAudienceId,
        audienceId: audience.id,
      });
    setAdded((rows) => [...rows, s.name]);
    startTransition(() => router.refresh());
  };
  const result = suggest.data;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={suggest.isPending}
        onClick={() => {
          setOpen(true);
          if (!result) suggest.mutate({ campaignId });
        }}
      >
        <Sparkles className="size-3.5" />
        {suggest.isPending ? "Suggesting…" : "Suggest audiences"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Suggested audiences</DialogTitle>
            <DialogDescription>
              {result?.evidence.note ??
                "From the market, the bookings and the ad account."}
            </DialogDescription>
          </DialogHeader>
          {suggest.isPending && (
            <p className="text-sm text-muted-foreground">
              Reading the evidence…
            </p>
          )}
          {result && (
            <ul className="space-y-3">
              {result.suggestions.map((s) => {
                const done = added.includes(s.name);
                const where = [...s.cities, ...s.regions].join(", ");
                return (
                  <li
                    key={s.name}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.kind} · {s.ageMin}-{s.ageMax}
                        {where ? ` · ${where}` : ""}
                      </p>
                      <p className="text-sm">{s.why}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={done ? "ghost" : "outline"}
                      disabled={
                        done || add.isPending || link.isPending || refreshing
                      }
                      onClick={() => void addOne(s)}
                    >
                      {done ? "Added" : "Add"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {result && result.evidence.inUse.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Already used by another campaign:{" "}
              {result.evidence.inUse
                .map((row) => `${row.name} (${row.campaign})`)
                .join(", ")}
            </p>
          )}
          {result && (
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              disabled={suggest.isPending}
              onClick={() => suggest.mutate({ campaignId })}
            >
              Suggest again
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
