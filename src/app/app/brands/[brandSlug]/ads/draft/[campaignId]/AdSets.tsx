"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/trpc/react";

type AdSet = {
  id: string;
  name: string;
  audienceTargetId: string | null;
  budget: number | null;
  budgetType: string | null;
  externalId: string | null;
};

type AudienceTarget = { id: string; name: string };

/**
 * Ad sets are where targeting, audience, and budget live on every platform
 * (Meta ad set, Google ad group). Several under one campaign is how a real
 * prospecting build splits audiences, so this is the layer that answers
 * "who are we buying" — the campaign brief above says what and where.
 */
export function AdSets({
  campaignId,
  brandId,
  adSets,
  audienceTargets,
}: {
  campaignId: string;
  brandId: string;
  adSets: AdSet[];
  audienceTargets: AudienceTarget[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [audienceTargetId, setAudienceTargetId] = useState("");
  const [budget, setBudget] = useState("");

  const options = useQuery(
    trpc.ads.audienceTargets.queryOptions({ brandId }, { enabled: open }),
  );
  const add = useMutation(
    trpc.ads.addDraftAdSet.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setName("");
        setAudienceTargetId("");
        setBudget("");
        router.refresh();
      },
    }),
  );

  const audienceName = (id: string | null) =>
    id ? (audienceTargets.find((a) => a.id === id)?.name ?? "—") : null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold">
            Ad sets{" "}
            <span className="text-muted-foreground text-sm font-normal">
              {adSets.length}
            </span>
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Who this campaign buys, and at what budget. One per audience.
          </p>
        </div>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" />
            Add ad set
          </Button>
        )}
      </div>

      {open && (
        <div className="border-border bg-surface-secondary/30 space-y-3 rounded-xl border p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="adset-name">Name</Label>
              <Input
                id="adset-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="PROSPECTING_LOOKALIKE"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adset-audience">Audience</Label>
              <select
                id="adset-audience"
                value={audienceTargetId}
                onChange={(event) => setAudienceTargetId(event.target.value)}
                className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
              >
                <option value="">
                  {options.isPending
                    ? "Loading…"
                    : (options.data ?? []).length === 0
                      ? "No audiences defined yet"
                      : "Pick an audience"}
                </option>
                {(options.data ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adset-budget">Budget ($/day)</Label>
              <Input
                id="adset-budget"
                type="number"
                min={0}
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                placeholder="20"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Audiences are defined once per brand in{" "}
            <Link href="/app/audiences" className="underline">
              Audiences
            </Link>{" "}
            and compiled per platform when the campaign is pushed.
          </p>
          {add.error && (
            <p className="text-xs text-red-300">{add.error.message}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!name.trim() || add.isPending}
              loading={add.isPending}
              onClick={() =>
                add.mutate({
                  campaignId,
                  name: name.trim(),
                  audienceTargetId: audienceTargetId || null,
                  budget: budget === "" ? null : Math.round(Number(budget)),
                  budgetType: budget === "" ? null : "daily",
                })
              }
            >
              Add ad set
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {adSets.length === 0 && !open ? (
        <p className="text-muted-foreground text-sm">
          No ad sets yet. A campaign needs at least one to say who it is
          buying — the push creates one per ad set on the platform.
        </p>
      ) : (
        <div className="space-y-2">
          {adSets.map((adSet) => (
            <div
              key={adSet.id}
              className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-3"
            >
              <span className="text-sm font-medium">{adSet.name}</span>
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Users className="size-3.5" />
                {audienceName(adSet.audienceTargetId) ?? "no audience set"}
              </span>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {adSet.budget != null
                  ? `$${adSet.budget}${adSet.budgetType === "daily" ? "/day" : ""}`
                  : "budget from campaign"}
              </span>
              <span className="text-muted-foreground/60 text-xs">
                {adSet.externalId ? "live" : "drafted"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
