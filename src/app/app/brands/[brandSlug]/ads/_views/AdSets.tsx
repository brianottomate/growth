"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, RefreshCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/trpc/react";

type AdSet = {
  id: string;
  name: string;
  audienceTargetId: string | null;
  audienceId: string | null;
  budget: number | null;
  budgetType: string | null;
  externalId: string | null;
};

type AudienceTarget = { id: string; name: string };
type PlatformAudience = {
  id: string;
  name: string;
  type: string;
  sizeLabel: string | null;
};

/**
 * Encoded so one <select> can express three different things: broad, a
 * first-party target we resolve per platform, or a platform audience the
 * client already built.
 */
const BROAD = "";
const encode = (kind: "t" | "a", id: string) => `${kind}:${id}`;

/**
 * Ad sets are where targeting, audience, and budget live on every platform
 * (Meta ad set, Google ad group). Several under one campaign is how a real
 * prospecting build splits audiences, so this is the layer that answers
 * "who are we buying" — the campaign brief above says what and where.
 */
export function AdSets({
  campaignId,
  brandId,
  brandSlug,
  adSets,
  audienceTargets,
  platformAudiences,
  budgetMode,
}: {
  campaignId: string;
  brandId: string;
  brandSlug: string;
  adSets: AdSet[];
  audienceTargets: AudienceTarget[];
  platformAudiences: PlatformAudience[];
  budgetMode: "cbo" | "abo";
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState(BROAD);
  const [budget, setBudget] = useState("");
  const [newAudience, setNewAudience] = useState("");

  const add = useMutation(
    trpc.ads.addDraftAdSet.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setName("");
        setAudience(BROAD);
        setBudget("");
        router.refresh();
      },
    }),
  );
  const removeAdSet = useMutation(
    trpc.ads.deleteDraftAdSet.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );
  // Creating the target here keeps the half-filled ad-set form alive; sending
  // someone to /app/audiences to define one loses everything they typed.
  const createTarget = useMutation(
    trpc.audience.createTarget.mutationOptions({
      onSuccess: (target) => {
        setAudience(encode("t", target.id));
        setNewAudience("");
        router.refresh();
      },
    }),
  );
  const pullAudiences = useMutation(
    trpc.ads.syncPlatformAudiences.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );
  const setBudgetMode = useMutation(
    trpc.ads.setCampaignPlatformConfig.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  const labelFor = (adSet: AdSet) => {
    if (adSet.audienceId) {
      return (
        platformAudiences.find((row) => row.id === adSet.audienceId)?.name ??
        "platform audience"
      );
    }
    if (adSet.audienceTargetId) {
      return (
        audienceTargets.find((row) => row.id === adSet.audienceTargetId)
          ?.name ?? "audience"
      );
    }
    return "Broad";
  };

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
      </div>

      {/* Budget ownership only bites once there is more than one ad set. */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <span>Budget</span>
        {(
          [
            ["cbo", "Shared across ad sets"],
            ["abo", "Fixed per ad set"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            disabled={setBudgetMode.isPending}
            onClick={() =>
              setBudgetMode.mutate({ campaignId, meta: { budgetMode: mode } })
            }
            className={`rounded-full border px-2.5 py-0.5 ${
              budgetMode === mode
                ? "border-white/25 text-foreground"
                : "border-transparent hover:border-white/10"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-muted-foreground/60">
          {budgetMode === "cbo"
            ? "Meta moves spend to whichever audience works."
            : "Each ad set holds its own amount."}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div />
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
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
              >
                <option value={BROAD}>Broad — let the platform find them</option>
                {audienceTargets.length > 0 && (
                  <optgroup label="Your audiences">
                    {audienceTargets.map((row) => (
                      <option key={row.id} value={encode("t", row.id)}>
                        {row.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {platformAudiences.length > 0 && (
                  <optgroup label="Already in the ad account">
                    {platformAudiences.map((row) => (
                      <option key={row.id} value={encode("a", row.id)}>
                        {row.name}
                        {row.sizeLabel ? ` (${row.sizeLabel})` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
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

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newAudience}
              onChange={(event) => setNewAudience(event.target.value)}
              placeholder="Or name a new audience…"
              className="h-8 max-w-xs text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!newAudience.trim() || createTarget.isPending}
              loading={createTarget.isPending}
              onClick={() =>
                createTarget.mutate({ brandId, name: newAudience.trim() })
              }
            >
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              loading={pullAudiences.isPending}
              onClick={() => pullAudiences.mutate({ brandSlug })}
            >
              <RefreshCw className="size-3.5" />
              Pull from ad account
            </Button>
          </div>

          <p className="text-muted-foreground text-xs">
            Broad is a real choice, and often the right one — strong creative
            plus a wide pool beats hand-cut interests on most accounts. Reach
            for an audience when you have a genuine list or seed.
          </p>
          {(add.error ?? createTarget.error ?? pullAudiences.error) && (
            <p className="text-xs text-red-300">
              {
                (add.error ?? createTarget.error ?? pullAudiences.error)
                  ?.message
              }
            </p>
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
                  audienceTargetId: audience.startsWith("t:")
                    ? audience.slice(2)
                    : null,
                  audienceId: audience.startsWith("a:")
                    ? audience.slice(2)
                    : null,
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
          No ad sets yet. Push without one and we create a single ad set from
          the campaign budget, targeting broad. Add them when you want to split
          audiences or budget.
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
                {labelFor(adSet)}
              </span>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {adSet.budget != null
                  ? `$${adSet.budget}${adSet.budgetType === "daily" ? "/day" : ""}`
                  : "budget from campaign"}
              </span>
              <span className="text-muted-foreground/60 text-xs">
                {adSet.externalId ? "live" : "drafted"}
              </span>
              {!adSet.externalId && (
                <button
                  type="button"
                  onClick={() => removeAdSet.mutate({ adSetId: adSet.id })}
                  disabled={removeAdSet.isPending}
                  className="text-muted-foreground/60 hover:text-red-300 text-xs"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
