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
import { ChannelLogo } from "@/components/channel-logos";
import {
  PUSHABLE_AD_PLATFORMS,
  requireAdPlatformSpec,
  type PushableAdPlatform,
} from "@/lib/ad-platforms";
import { campaignDraftName } from "@/lib/performance-ads";
import { useTRPC } from "@/trpc/react";

/**
 * Creates a local draft and lands on its canvas. Deliberately minimal — a
 * name and a platform are enough to start; everything else is edited in chat
 * and read on the canvas.
 */
/** What a draft is worth before anyone has said otherwise. Advisory. */
const DEFAULT_BUDGET_USD = 1000;

export function NewCampaignButton({
  brandId,
  brandName,
  brandWebsite,
  isClient = false,
}: {
  brandId: string;
  brandName: string;
  brandWebsite?: string | null;
  /** Only a paying client has an intake to prefill from. */
  isClient?: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Born in the house convention, editable from the first keystroke.
  const [name, setName] = useState(() =>
    campaignDraftName({ brandName, isClient }),
  );
  const [platforms, setPlatforms] = useState<PushableAdPlatform[]>([
    "meta_ads",
  ]);
  // A real default rather than a placeholder: the draft carries $1,000 unless
  // the operator or the client's intake says otherwise.
  const [budget, setBudget] = useState(String(DEFAULT_BUDGET_USD));
  const [budgetTouched, setBudgetTouched] = useState(false);
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
    // Wander's own brands have no intake behind them, so this would be a
    // round trip to be told nothing.
    enabled: open && isClient,
  });
  const prefilled = prefill.data ?? null;

  useEffect(() => {
    if (!prefilled) return;
    // The intake's number beats the default; a number the operator typed
    // beats both.
    if (!budgetTouched && prefilled.mediaBudgetDollars != null) {
      setBudget(String(prefilled.mediaBudgetDollars));
    }
    setLandingUrl((current) => current || prefilled.landingUrl || "");
  }, [prefilled, budgetTouched]);

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
            A local draft. Nothing reaches an ad platform until you push it, and
            each platform you pick gets its own campaign then.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="camp-name">Name</Label>
            <Input
              id="camp-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="WANDER_PROSPECTING_PURCHASES"
            />
            <p className="text-muted-foreground text-xs">
              {isClient
                ? "OSPERF+CUSTOMER_STRATEGY_OBJECTIVE. Finance filters spend on the OSPERF+ prefix, so it leads."
                : "BRAND_STRATEGY_OBJECTIVE, upper snake case. Change the strategy or objective to match the campaign."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {PUSHABLE_AD_PLATFORMS.map((value) => {
                const on = platforms.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPlatforms((current) =>
                        current.includes(value)
                          ? current.length > 1
                            ? current.filter((p) => p !== value)
                            : current
                          : [...current, value],
                      )
                    }
                    className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors ${
                      on
                        ? "border-white/30 bg-white/10 font-medium"
                        : "border-input text-muted-foreground hover:bg-white/5"
                    }`}
                  >
                    <ChannelLogo
                      platform={value}
                      className={on ? "size-4" : "size-4 opacity-60"}
                    />
                    {requireAdPlatformSpec(value).shortLabel}
                  </button>
                );
              })}
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
              Where the ads send people. A property or offer page converts far
              better than the homepage.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="camp-budget">Budget ($)</Label>
              <Input
                id="camp-budget"
                type="number"
                min={0}
                value={budget}
                onChange={(event) => {
                  setBudgetTouched(true);
                  setBudget(event.target.value);
                }}
                placeholder={String(DEFAULT_BUDGET_USD)}
              />
              <p className="text-muted-foreground text-xs">
                {prefilled?.mediaBudgetDollars != null
                  ? `From their intake: $${prefilled.mediaBudgetDollars.toLocaleString()}/mo`
                  : `Defaults to $${DEFAULT_BUDGET_USD.toLocaleString()}. Advisory; each platform draft sets its own.`}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-description">Notes</Label>
              <Textarea
                id="camp-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                placeholder="Audience, season, goal."
              />
            </div>
          </div>
          {prefilled?.accountId &&
            (prefilled.allProperties ||
              prefilled.propertyUrls.length > 0 ||
              geoSummary) && (
              <p className="text-muted-foreground text-xs">
                Also from their intake:{" "}
                {[
                  prefilled.allProperties
                    ? "all their homes"
                    : prefilled.propertyUrls.length > 0
                      ? `${prefilled.propertyUrls.length} homes on the record`
                      : null,
                  geoSummary,
                ]
                  .filter(Boolean)
                  .join(" · ")}
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
