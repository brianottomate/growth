"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type {
  AudienceMarketSide,
  AudienceProfileScope,
  AudienceResearchMaturity,
  AudienceTargetPriority,
  AudienceTargetStatus,
  ChannelPlatform,
} from "@/server/db/schema";
import type {
  AudienceContext,
  AudienceDemographics,
  AudienceGeography,
} from "@/lib/audience-model";
import { useTRPC } from "@/trpc/react";
import { AD_PLATFORM_OPTIONS } from "@/lib/ad-platforms";

export type TargetDraft = {
  id?: string;
  brandId: string;
  name: string;
  description?: string | null;
  profileScope: AudienceProfileScope;
  marketSide: AudienceMarketSide;
  researchMaturity: AudienceResearchMaturity;
  status: AudienceTargetStatus;
  priority: AudienceTargetPriority;
  intendedChannels?: string[] | null;
  sizeGoalLabel?: string | null;
  geography?: AudienceGeography | null;
  demographics?: AudienceDemographics | null;
  context?: AudienceContext | null;
};

const PROFILE_SCOPES = [
  ["core", "Core ICP"],
  ["segment", "Segment"],
  ["experimental", "Experimental"],
] as const;

const MARKET_SIDES = [
  ["consumer", "Consumer"],
  ["professional", "Professional"],
  ["business", "Business"],
  ["partner", "Partner"],
] as const;

const MATURITY = [
  ["hypothesis", "Hypothesis"],
  ["researched", "Researched"],
  ["validated", "Validated"],
] as const;

const STATUSES = [
  ["idea", "Idea"],
  ["planned", "Planned"],
  ["active", "Active"],
  ["retired", "Retired"],
] as const;

const PRIORITIES = [
  ["must_have", "Must have"],
  ["should_have", "Should have"],
  ["nice_to_have", "Nice to have"],
] as const;

export function TargetDialog({
  open,
  onOpenChange,
  brands,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: { id: string; name: string }[];
  initial?: TargetDraft;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial?.id);

  const [brandId, setBrandId] = useState(
    initial?.brandId ?? brands[0]?.id ?? "",
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [profileScope, setProfileScope] = useState<AudienceProfileScope>(
    initial?.profileScope ?? "segment",
  );
  const [marketSide, setMarketSide] = useState<AudienceMarketSide>(
    initial?.marketSide ?? "consumer",
  );
  const [researchMaturity, setResearchMaturity] =
    useState<AudienceResearchMaturity>(
      initial?.researchMaturity ?? "hypothesis",
    );
  const [status, setStatus] = useState<AudienceTargetStatus>(
    initial?.status ?? "planned",
  );
  const [priority, setPriority] = useState<AudienceTargetPriority>(
    initial?.priority ?? "should_have",
  );
  const [channels, setChannels] = useState<string[]>(
    initial?.intendedChannels ?? [],
  );
  const [sizeGoalLabel, setSizeGoalLabel] = useState(
    initial?.sizeGoalLabel ?? "",
  );
  const [geoMode, setGeoMode] = useState<"unknown" | "global" | "specific">(
    initial?.geography?.mode ?? "unknown",
  );
  const [includedLocations, setIncludedLocations] = useState(
    initial?.geography?.mode === "specific"
      ? initial.geography.include.map((place) => place.name).join("\n")
      : "",
  );
  const [excludedLocations, setExcludedLocations] = useState(
    initial?.geography?.exclude.map((place) => place.name).join("\n") ?? "",
  );
  const [ageMin, setAgeMin] = useState(
    initial?.demographics?.ageRange?.min?.toString() ?? "",
  );
  const [ageMax, setAgeMax] = useState(
    initial?.demographics?.ageRange?.max?.toString() ?? "",
  );
  const [languages, setLanguages] = useState(
    initial?.demographics?.languages?.join(", ") ?? "",
  );
  const [lifeStages, setLifeStages] = useState(
    initial?.demographics?.lifeStages?.join("\n") ?? "",
  );
  const [occupations, setOccupations] = useState(
    initial?.demographics?.occupations?.join("\n") ?? "",
  );
  const [demographicNotes, setDemographicNotes] = useState(
    initial?.demographics?.notes ?? "",
  );
  const [jobsToBeDone, setJobsToBeDone] = useState(
    initial?.context?.jobsToBeDone.join("\n") ?? "",
  );
  const [pains, setPains] = useState(initial?.context?.pains.join("\n") ?? "");
  const [desiredOutcomes, setDesiredOutcomes] = useState(
    initial?.context?.desiredOutcomes.join("\n") ?? "",
  );

  useEffect(() => {
    if (!open) return;
    setBrandId(initial?.brandId ?? brands[0]?.id ?? "");
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setProfileScope(initial?.profileScope ?? "segment");
    setMarketSide(initial?.marketSide ?? "consumer");
    setResearchMaturity(initial?.researchMaturity ?? "hypothesis");
    setStatus(initial?.status ?? "planned");
    setPriority(initial?.priority ?? "should_have");
    setChannels(initial?.intendedChannels ?? []);
    setSizeGoalLabel(initial?.sizeGoalLabel ?? "");
    setGeoMode(initial?.geography?.mode ?? "unknown");
    setIncludedLocations(
      initial?.geography?.mode === "specific"
        ? initial.geography.include.map((place) => place.name).join("\n")
        : "",
    );
    setExcludedLocations(
      initial?.geography?.exclude.map((place) => place.name).join("\n") ?? "",
    );
    setAgeMin(initial?.demographics?.ageRange?.min?.toString() ?? "");
    setAgeMax(initial?.demographics?.ageRange?.max?.toString() ?? "");
    setLanguages(initial?.demographics?.languages?.join(", ") ?? "");
    setLifeStages(initial?.demographics?.lifeStages?.join("\n") ?? "");
    setOccupations(initial?.demographics?.occupations?.join("\n") ?? "");
    setDemographicNotes(initial?.demographics?.notes ?? "");
    setJobsToBeDone(initial?.context?.jobsToBeDone.join("\n") ?? "");
    setPains(initial?.context?.pains.join("\n") ?? "");
    setDesiredOutcomes(initial?.context?.desiredOutcomes.join("\n") ?? "");
  }, [open, initial, brands]);

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.audience.overview.queryOptions());

  const create = useMutation(
    trpc.audience.createTarget.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to create target"),
    }),
  );
  const update = useMutation(
    trpc.audience.updateTarget.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to update target"),
    }),
  );
  const pending = create.isPending || update.isPending;

  function submit() {
    if (!name.trim()) return toast.error("Name is required");
    if (!isEdit && !brandId) return toast.error("Pick a brand");
    const lines = (value: string) =>
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    const include = lines(includedLocations).map((location) => ({
      name: location,
      level: "market" as const,
    }));
    const exclude = lines(excludedLocations).map((location) => ({
      name: location,
      level: "market" as const,
    }));
    if (geoMode === "specific" && include.length === 0) {
      return toast.error("Add at least one included location");
    }
    const geography: AudienceGeography | null =
      geoMode === "unknown"
        ? null
        : geoMode === "global"
          ? { mode: "global", exclude }
          : { mode: "specific", include, exclude };
    const ageRange =
      ageMin || ageMax
        ? {
            ...(ageMin ? { min: Number(ageMin) } : {}),
            ...(ageMax ? { max: Number(ageMax) } : {}),
          }
        : undefined;
    const demographics: AudienceDemographics | null =
      ageRange ||
      languages.trim() ||
      lifeStages.trim() ||
      occupations.trim() ||
      demographicNotes.trim()
        ? {
            ...(ageRange ? { ageRange } : {}),
            ...(languages.trim() ? { languages: lines(languages) } : {}),
            ...(lifeStages.trim() ? { lifeStages: lines(lifeStages) } : {}),
            ...(occupations.trim() ? { occupations: lines(occupations) } : {}),
            ...(demographicNotes.trim()
              ? { notes: demographicNotes.trim() }
              : {}),
          }
        : null;
    const shared = {
      name: name.trim(),
      description: description.trim() || undefined,
      profileScope,
      marketSide,
      researchMaturity,
      status,
      priority,
      geography,
      demographics,
      context: {
        jobsToBeDone: lines(jobsToBeDone),
        pains: lines(pains),
        desiredOutcomes: lines(desiredOutcomes),
      },
      intendedChannels: channels as ChannelPlatform[],
      sizeGoalLabel: sizeGoalLabel.trim() || null,
    };
    if (isEdit && initial?.id) {
      update.mutate({ id: initial.id, ...shared });
    } else {
      create.mutate({ brandId, ...shared });
    }
  }

  function toggleChannel(c: string) {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit target" : "New audience target"}
          </DialogTitle>
          <DialogDescription>
            The canonical <em>who</em> you want to reach. Link the per-platform
            audiences that fulfil it to track which channels are covered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && brands.length > 1 && (
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tgt-name">Name</Label>
            <Input
              id="tgt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CA remote workers"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tgt-desc">Who they are</Label>
            <Textarea
              id="tgt-desc"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Remote-first professionals in California, 28–45…"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Profile</Label>
              <Select
                value={profileScope}
                onValueChange={(v) =>
                  setProfileScope(v as AudienceProfileScope)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFILE_SCOPES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Market side</Label>
              <Select
                value={marketSide}
                onValueChange={(v) => setMarketSide(v as AudienceMarketSide)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKET_SIDES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as AudienceTargetStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as AudienceTargetPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Research maturity</Label>
            <Select
              value={researchMaturity}
              onValueChange={(v) =>
                setResearchMaturity(v as AudienceResearchMaturity)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATURITY.map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <Label>Market geography</Label>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Reusable audience context. Campaign activations inherit this
                unless explicitly narrowed.
              </p>
            </div>
            <Select
              value={geoMode}
              onValueChange={(v) => setGeoMode(v as typeof geoMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Not established yet</SelectItem>
                <SelectItem value="global">Genuinely global</SelectItem>
                <SelectItem value="specific">Specific markets</SelectItem>
              </SelectContent>
            </Select>
            {geoMode === "specific" && (
              <div className="space-y-1.5">
                <Label htmlFor="tgt-geo-include">Included locations</Label>
                <Textarea
                  id="tgt-geo-include"
                  value={includedLocations}
                  onChange={(e) => setIncludedLocations(e.target.value)}
                  placeholder={
                    "United States\nNew York City\nSan Francisco Bay Area"
                  }
                  rows={3}
                />
              </div>
            )}
            {geoMode !== "unknown" && (
              <div className="space-y-1.5">
                <Label htmlFor="tgt-geo-exclude">Excluded locations</Label>
                <Textarea
                  id="tgt-geo-exclude"
                  value={excludedLocations}
                  onChange={(e) => setExcludedLocations(e.target.value)}
                  placeholder="Optional, one market per line"
                  rows={2}
                />
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <Label>Descriptive demographics</Label>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Context for research, messaging, and AI. Never automatically
                copied into ad targeting.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tgt-age-min">Age from</Label>
                <Input
                  id="tgt-age-min"
                  type="number"
                  min={0}
                  max={120}
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tgt-age-max">Age to</Label>
                <Input
                  id="tgt-age-max"
                  type="number"
                  min={0}
                  max={120}
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tgt-languages">Languages</Label>
              <Input
                id="tgt-languages"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                placeholder="English, Spanish"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tgt-life-stages">Life stages</Label>
                <Textarea
                  id="tgt-life-stages"
                  value={lifeStages}
                  onChange={(e) => setLifeStages(e.target.value)}
                  placeholder="First-time buyer"
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tgt-occupations">Occupations or roles</Label>
                <Textarea
                  id="tgt-occupations"
                  value={occupations}
                  onChange={(e) => setOccupations(e.target.value)}
                  placeholder="Apartment locator"
                  rows={2}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tgt-demo-notes">Demographic notes</Label>
              <Textarea
                id="tgt-demo-notes"
                value={demographicNotes}
                onChange={(e) => setDemographicNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tgt-jobs">Jobs to be done</Label>
              <Textarea
                id="tgt-jobs"
                value={jobsToBeDone}
                onChange={(e) => setJobsToBeDone(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tgt-pains">Pain points</Label>
              <Textarea
                id="tgt-pains"
                value={pains}
                onChange={(e) => setPains(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tgt-outcomes">Desired outcomes</Label>
              <Textarea
                id="tgt-outcomes"
                value={desiredOutcomes}
                onChange={(e) => setDesiredOutcomes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tgt-size">Reach goal</Label>
            <Input
              id="tgt-size"
              value={sizeGoalLabel}
              onChange={(e) => setSizeGoalLabel(e.target.value)}
              placeholder="~500K"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Intended channels</Label>
            <div className="flex flex-wrap gap-1.5">
              {AD_PLATFORM_OPTIONS.map(({ value: v, label: l }) => {
                const on = channels.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleChannel(v)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Save" : "Create target"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
