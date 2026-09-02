"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { useTRPC } from "@/trpc/react";

/**
 * Creates a local draft and lands on its canvas. Deliberately minimal — a
 * name and a platform are enough to start; everything else is edited in chat
 * and read on the canvas.
 */
export function NewCampaignButton({
  brandId,
  brandWebsite,
}: {
  brandId: string;
  brandWebsite?: string | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [platforms, setPlatforms] = useState<("meta_ads" | "google_ads")[]>([
    "meta_ads",
  ]);
  const [budget, setBudget] = useState("");
  // Prefilled from the brand so the field is never empty, but visible and
  // editable: paid traffic to a homepage converts far worse than traffic to
  // the specific property or offer page.
  const [landingUrl, setLandingUrl] = useState(brandWebsite ?? "");
  const [description, setDescription] = useState("");

  // A Performance+ client already told us their budget and which homes they
  // are advertising, on the intake form. Retyping it is how the number in the
  // campaign drifts from the number they agreed to.
  const prefill = useQuery({
    ...trpc.performance.campaignPrefill.queryOptions({ brandId }),
    enabled: open,
  });
  const prefilled = prefill.data ?? null;

  useEffect(() => {
    if (!prefilled) return;
    setBudget((current) =>
      current === "" && prefilled.mediaBudgetDollars != null
        ? String(prefilled.mediaBudgetDollars)
        : current,
    );
    setLandingUrl((current) => current || prefilled.landingUrl || "");
  }, [prefilled]);

  const geoSummary = prefilled?.geography.regions?.length
    ? prefilled.geography.regions.join(", ")
    : null;

  const create = useMutation(
    trpc.ads.createDraft.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        router.push(result.path);
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5" />
          New campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign draft</DialogTitle>
          <DialogDescription>
            A local draft — nothing reaches an ad platform until you push it.
            Pick both to plan one push across Meta and Google; each platform
            gets its own campaign when the push runs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="camp-name">Name</Label>
            <Input
              id="camp-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="WANDER_PROSPECTING_PURCHASES"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Platforms</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: "meta_ads", label: "Meta" },
                    { value: "google_ads", label: "Google" },
                  ] as const
                ).map((option) => {
                  const on = platforms.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setPlatforms((current) =>
                          current.includes(option.value)
                            ? current.length > 1
                              ? current.filter((p) => p !== option.value)
                              : current
                            : [...current, option.value],
                        )
                      }
                      className={`h-9 flex-1 rounded-md border text-sm transition-colors ${
                        on
                          ? "border-white/30 bg-white/10 font-medium"
                          : "border-input text-muted-foreground hover:bg-white/5"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-budget">Budget ($, optional)</Label>
              <Input
                id="camp-budget"
                type="number"
                min={0}
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                placeholder="500"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="camp-landing">Landing URL</Label>
            <Input
              id="camp-landing"
              value={landingUrl}
              onChange={(event) => setLandingUrl(event.target.value)}
              placeholder="https://…"
            />
            <p className="text-muted-foreground text-xs">
              Where the ads send people. Every ad inherits this unless it
              overrides it. Point it at the specific property or offer page — a
              homepage converts far worse on paid traffic.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="camp-description">What is this push for?</Label>
            <Textarea
              id="camp-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="The audience, the season, the goal — context chat and the team read later."
            />
          </div>
          {prefilled?.accountId && (
            <p className="text-muted-foreground text-xs">
              From their intake:{" "}
              {prefilled.mediaBudgetDollars != null
                ? `$${prefilled.mediaBudgetDollars}/mo`
                : "no budget agreed"}
              {prefilled.allProperties
                ? " · all their homes"
                : prefilled.propertyUrls.length > 0
                  ? ` · ${prefilled.propertyUrls.length} homes on the record`
                  : ""}
              {geoSummary ? ` · ${geoSummary}` : ""}
            </p>
          )}
          {create.error && (
            <p className="text-xs text-red-300">{create.error.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            size="sm"
            disabled={!name.trim() || create.isPending}
            loading={create.isPending}
            onClick={() =>
              create.mutate({
                brandId,
                name: name.trim(),
                platforms,
                landingUrl: landingUrl.trim() || null,
                description: description.trim() || null,
                budget:
                  budget === "" || !Number.isFinite(Number(budget))
                    ? null
                    : Math.max(0, Math.round(Number(budget))),
              })
            }
          >
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
