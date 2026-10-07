"use client";

import { campaignDisplayName } from "@/lib/campaign-navigation";
import { resolveMetaSchedule, metaScheduleIssue } from "@/lib/meta-schedule";
import { applyMetaTrackingDefaults } from "@/lib/meta-tracking";
import { isImportedMetaCatalog } from "@/lib/meta-import";
import { useLocalStorage } from "@/components/ui/hooks/use-local-storage";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import {
  metaPreviewPlacements,
  metaPreviewMedia,
  importedPlacementLabel,
} from "@/lib/meta-preview";
import {
  META_DEFAULT_PLACEMENTS,
  META_PLACEMENTS,
  metaPlacementMedia,
  type MetaPlacement,
} from "@/lib/meta-placement-plan";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ChannelLogo } from "@/components/channel-logos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { AskAssistantButton } from "./AskAssistantButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { orpc } from "@/orpc/client";
import { adRoutesTo, AD_PUSH_GOALS, type AdPushGoal } from "@/lib/ad-platforms";
import type {
  Ad,
  AdCreativeContent,
  PlatformCampaign,
  AudienceGeographyPlan,
} from "@/server/db/ads-schema";
import { CompactAdMock } from "@/components/ad-mock";
import { PushToPlatform } from "./PushToPlatform";
import { META_DEFAULT_CALL_TO_ACTION } from "@/lib/zernio-ads";
import { money } from "./format";

type Audience = {
  id: string;
  name: string;
  geography: AudienceGeographyPlan | null;
  ageMin: number | null;
  ageMax: number | null;
};
const DEFAULT_PROJECTION_EXPANSION: Record<string, boolean> = {};

export function MetaPlatformCard({
  destination,
  campaignId,
  campaignName,
  brandSlug,
  brandName,
  brandLogo,
  campaignStartAt,
  campaignEndAt,
  platformCampaign: pc,
  ads,
  audiences,
}: {
  destination?: {
    connectionAccountId: string;
    adAccountId: string;
    adAccountName: string | null;
    pageId: string;
    trackingDefaults?: Parameters<typeof applyMetaTrackingDefaults>[1];
  };
  campaignId: string;
  campaignName: string;
  campaignStartAt?: Date | null;
  campaignEndAt?: Date | null;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  platformCampaign: PlatformCampaign;
  ads: Ad[];
  audiences: Audience[];
}) {
  const [inspectOpen, setInspectOpen] = useState(false);
  const [projectionOpen, setProjectionOpen] = useLocalStorage<
    Record<string, boolean>
  >({
    key: `meta-projections:${campaignId}:${pc.id}:expanded`,
    defaultValue: DEFAULT_PROJECTION_EXPANSION,
  });

  const saved = pc.settings?.meta;
  const [goal, setGoal] = useState<AdPushGoal>(saved?.goal ?? "conversions");
  const sectionId = useId();
  const chosen = destination;
  const choices = chosen ? [chosen] : [];
  const configuration = chosen
    ? {
        connectionAccountId: chosen.connectionAccountId,
        adAccountId: chosen.adAccountId,
        goal,
        label: chosen.adAccountName ?? chosen.adAccountId,
      }
    : undefined;
  const routedAds = ads.filter((ad) => adRoutesTo(ad.platforms, "meta_ads"));
  const catalogCount = routedAds.filter(
    (ad) => "media" in ad.content && isImportedMetaCatalog(ad.content),
  ).length;
  const creativeAds = routedAds.filter(
    (ad) =>
      ad.type === "creative" &&
      "media" in ad.content &&
      !isImportedMetaCatalog(ad.content) &&
      (Boolean(ad.content.media[0]?.url) ||
        Boolean(
          ad.content.ideaStudio?.approval &&
          ad.content.ideaStudio.document.cards.length,
        )),
  );
  const sets = audiences.length
    ? audiences
    : [
        {
          id: "broad",
          name: "Broad",
          geography: null,
          ageMin: null,
          ageMax: null,
        },
      ];
  const meta = applyMetaTrackingDefaults(
    pc.settings?.meta ?? {},
    chosen?.trackingDefaults,
  );
  const schedule = resolveMetaSchedule({
    startAt: pc.startAt,
    endAt: pc.endAt,
    campaignStartAt,
    campaignEndAt,
    ...meta,
  });
  const scheduleError = metaScheduleIssue(schedule, pc.budgetType);
  const placementPlan = meta?.placements ?? META_DEFAULT_PLACEMENTS;
  const selectedPlacements = META_PLACEMENTS.filter((p) =>
    placementPlan.includes(p.id),
  );
  const placementSummary =
    selectedPlacements.length === META_PLACEMENTS.length
      ? `All ${META_PLACEMENTS.length} placements`
      : selectedPlacements.length > 0
        ? `${selectedPlacements.length} of ${META_PLACEMENTS.length} placements`
        : meta?.importSource
          ? importedPlacementLabel(meta.importSource.adSets)
          : "No placements";
  const missingCreative = creativeAds.some(
    (ad) =>
      "media" in ad.content &&
      placementPlan.some(
        (p) => metaPlacementMedia(ad.content as AdCreativeContent, p).issue,
      ),
  );
  const missingTracking =
    goal === "conversions" &&
    !meta?.customConversionId &&
    !(meta?.pixelId && meta?.customEventType);
  const blockers = [
    scheduleError,
    !configuration && "Configure Meta access in brand settings.",
    !placementPlan.length && "Choose delivery placements in Settings.",
    missingTracking &&
      "Set a pixel and conversion event, or a custom conversion, in Settings.",
    !pc.budget && "Set a budget in Settings.",
    !creativeAds.length && "Add at least one creative ad.",
    missingCreative && "Add the missing artwork for the selected placements.",
    Boolean(catalogCount) &&
      "Catalog ads cannot be included in this creative push.",
    Boolean(meta?.importSource?.issues.length && !meta.importReviewed) &&
      "Review imported delivery settings in Settings.",
  ].filter((message): message is string => typeof message === "string");
  const ready = blockers.length === 0;

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ChannelLogo platform="meta_ads" className="size-5" />
        <h3 className="font-semibold">Meta Ads</h3>
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
          Planned · paused on push
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <AskAssistantButton
            brandId={pc.brandId}
            brandName={brandName}
            campaignId={campaignId}
            campaignName={campaignName}
            focus="platforms"
            label="Shape"
            ask={`Help me shape the Meta delivery setup for “${campaignName}”. Read its approved ads, campaign audiences and Meta settings, then discuss what I want to refine before changing anything.`}
          />
          {!ready && (
            <Button size="sm" disabled>
              Push to Meta
            </Button>
          )}
          {ready && (
            <PushToPlatform
              configuration={configuration}
              campaignId={campaignId}
              brandSlug={brandSlug}
              platform="meta_ads"
              draftAdCount={creativeAds.length}
              audienceCount={audiences.length}
              budget={pc.budget}
              budgetType={pc.budgetType}
            />
          )}
          <DeletePlatformCampaign
            platformCampaignId={pc.id}
            campaignName="Meta Ads"
            brandSlug={brandSlug}
            isLive={false}
            spend={pc.spend}
            hasExternalId={Boolean(pc.externalId)}
            compact
            afterDelete="refresh"
            connectionAccountId={configuration?.connectionAccountId}
          />
        </div>
      </div>
      {!ready && (
        <div
          className="space-y-1 text-sm text-muted-foreground"
          aria-label="Required before pushing"
        >
          <p className="font-medium">To finish setup</p>
          <ul className="list-disc pl-5">
            {blockers.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <div id={sectionId} className="space-y-4">
        <section
          id={`${sectionId}-setup`}
          className="space-y-4"
          aria-label="Setup"
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium">Delivery setup</h4>
            <MetaSettings
              pc={{ ...pc, settings: { ...pc.settings, meta } }}
              campaignStartAt={campaignStartAt}
              campaignEndAt={campaignEndAt}
              choices={choices}
              goal={goal}
              onApply={setGoal}
            />
          </div>
          <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:grid-cols-4">
            <SetupFact
              label="Budget"
              value={
                pc.budget
                  ? `${money(pc.budget)}${pc.budgetType === "lifetime" ? " lifetime" : " / day"}`
                  : "Not set"
              }
              detail={
                meta?.budgetMode === "abo"
                  ? "Per ad set (ABO)"
                  : "Campaign (CBO)"
              }
            />
            <SetupFact
              label="Goal"
              value={
                goal.charAt(0).toUpperCase() + goal.slice(1).replace("_", " ")
              }
              detail={
                meta?.customConversionId ||
                (meta?.customEventType
                  ? `${meta.customEventType} · ${
                      meta.conversionScope === "host"
                        ? "client site"
                        : "shared pixel"
                    }`
                  : "No conversion set")
              }
            />
            <SetupFact
              label="Schedule"
              value={
                schedule.startAt
                  ? new Date(schedule.startAt).toLocaleDateString()
                  : "When launched"
              }
              detail={
                schedule.endAt
                  ? `Until ${new Date(schedule.endAt).toLocaleDateString()}`
                  : "Runs until paused"
              }
            />
            <SetupFact
              label="Ad account"
              value={
                chosen?.adAccountName ?? chosen?.adAccountId ?? "Not configured"
              }
              detail={chosen?.pageId ? `Page ${chosen.pageId}` : "No Page"}
            />
          </dl>
          {!choices.length && (
            <p className="text-sm text-muted-foreground">
              Configure Meta access in brand settings before pushing.
            </p>
          )}
          <details className="group text-xs text-muted-foreground">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
              <span>{placementSummary}</span>
              <span aria-hidden>·</span>
              <span className="break-all">
                Pixel {meta?.pixelId || "not configured"}
              </span>
            </summary>
            {selectedPlacements.length > 0 && (
              <p className="mt-2 pl-5">
                {selectedPlacements.map((p) => p.label).join(", ")}
              </p>
            )}
          </details>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {sets.length} ad {sets.length === 1 ? "set" : "sets"} ·{" "}
            {creativeAds.length} approved{" "}
            {creativeAds.length === 1 ? "creative" : "creatives"} ·{" "}
            {sets.length * creativeAds.length} Meta ads
          </p>
          <Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={!creativeAds.length}
              >
                Inspect placements
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] gap-4 overflow-x-hidden overflow-y-auto pb-6 md:w-[calc(100%-2rem)] md:max-w-5xl">
              <DialogHeader>
                <DialogTitle>Meta placements</DialogTitle>
                <DialogDescription className="break-words">
                  {campaignDisplayName(campaignName)} · Approved artwork for the
                  selected placements. Meta may adjust the layout when serving
                  an ad.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-medium">
                  {creativeAds.length} approved creatives
                </h4>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setProjectionOpen(
                        Object.fromEntries(
                          creativeAds.map((ad) => [ad.id, true]),
                        ),
                      )
                    }
                  >
                    Expand all
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setProjectionOpen(
                        Object.fromEntries(
                          creativeAds.map((ad) => [ad.id, false]),
                        ),
                      )
                    }
                  >
                    Collapse all
                  </Button>
                </div>
              </div>
              {!placementPlan.length && !meta?.importSource && (
                <p className="text-sm text-muted-foreground">
                  Choose delivery placements to preview approved artwork.{" "}
                  <a className="underline" href={`#${sectionId}-setup`}>
                    Settings above
                  </a>{" "}
                  to choose delivery placements.
                </p>
              )}
              {meta?.importSource && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost">
                      Imported from Meta · Source details
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto pb-6 md:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Meta campaign source</DialogTitle>
                      <DialogDescription>
                        Local working copy of campaign{" "}
                        {meta.importSource.campaignId}. Reconstructed previews
                        are not a report of actual delivery.
                      </DialogDescription>
                    </DialogHeader>
                    {meta.importSource.issues.map((issue) => (
                      <p key={issue} className="text-sm">
                        {issue}
                      </p>
                    ))}
                    <details>
                      <summary className="cursor-pointer text-sm">
                        Original ad set settings
                      </summary>
                      <pre className="mt-3 max-h-80 overflow-auto text-xs whitespace-pre-wrap">
                        {JSON.stringify(meta.importSource.adSets, null, 2)}
                      </pre>
                    </details>
                  </DialogContent>
                </Dialog>
              )}
              <p className="text-xs text-muted-foreground">
                {meta?.importSource
                  ? "Recovered from Meta · local working copy. "
                  : ""}
                {meta?.importSource && !placementPlan.length
                  ? "Artwork below is recovered; select delivery placements in setup before shipping. "
                  : ""}
                Each creative is shared across {sets.length} ad{" "}
                {sets.length === 1 ? "set" : "sets"}. Expand to inspect
                delivery.
              </p>
              {creativeAds.map((ad) => {
                const open = projectionOpen?.[ad.id] ?? false;
                const panelId = `${sectionId}-projection-${ad.id}`;
                return (
                  <div key={ad.id} className="rounded-lg border">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 p-4 text-left"
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() =>
                        setProjectionOpen((current) => ({
                          ...current,
                          [ad.id]: !open,
                        }))
                      }
                    >
                      {open ? (
                        <ChevronDown className="size-4 shrink-0" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 space-y-2">
                        <span className="block text-sm font-medium">
                          {ad.name
                            .replace(/^[^_]+_(?:Carousel|Static)_/, "")
                            .replaceAll("_", " ")}
                        </span>
                        <ProjectionSummary ad={ad} placements={placementPlan} />
                      </span>
                    </button>
                    <div id={panelId} hidden={!open} className="px-4 pb-4">
                      {open && (
                        <ProjectedAd
                          ad={ad}
                          brandName={brandName}
                          brandLogo={brandLogo}
                          placements={placementPlan}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </DialogContent>
          </Dialog>
        </div>
        {catalogCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {catalogCount} imported catalog ad(s) are reference only and cannot
            be rebuilt by this publisher. This campaign cannot be pushed with
            catalog ads included.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Push creates the campaign paused. Launch is a separate action after
          reviewing the result in Meta.
        </p>
      </div>
    </section>
  );
}

function SetupFact({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-base font-semibold" title={value}>
        {value}
      </dd>
      <dd className="truncate text-xs text-muted-foreground" title={detail}>
        {detail}
      </dd>
    </div>
  );
}

function MetaSettings({
  pc,
  campaignStartAt,
  campaignEndAt,
  choices,
  goal,
  onApply,
}: {
  pc: PlatformCampaign;
  campaignStartAt?: Date | null;
  campaignEndAt?: Date | null;
  choices: {
    connectionAccountId: string;
    adAccountId: string;
    adAccountName?: string | null;
    pageId?: string | null;
  }[];
  goal: AdPushGoal;
  onApply: (goal: AdPushGoal) => void;
}) {
  const [draftGoal, setDraftGoal] = useState(goal);
  const [amount, setAmount] = useState(pc.budget?.toString() ?? "");
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">(
    pc.budgetType === "lifetime" ? "lifetime" : "daily",
  );
  const [open, setOpen] = useState(false);
  const meta = pc.settings?.meta;
  const [importReviewed, setImportReviewed] = useState(
    meta?.importReviewed ?? false,
  );
  const [placements, setPlacements] = useState<MetaPlacement[]>(
    meta?.placements ?? META_DEFAULT_PLACEMENTS,
  );
  const [pixel, setPixel] = useState(meta?.pixelId ?? "");
  const [event, setEvent] = useState(meta?.customEventType ?? "");
  const [conversion, setConversion] = useState(meta?.customConversionId ?? "");
  const [scope, setScope] = useState<"host" | "pixel">(
    meta?.conversionScope ?? "pixel",
  );
  const [mode, setMode] = useState<"cbo" | "abo">(meta?.budgetMode ?? "cbo");
  const dateValue = (d: Date | null) =>
    d
      ? new Date(
          new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "";
  const effective = resolveMetaSchedule({
    startAt: pc.startAt,
    endAt: pc.endAt,
    campaignStartAt,
    campaignEndAt,
    ...meta,
  });
  const [start, setStart] = useState(dateValue(effective.startAt));
  const [end, setEnd] = useState(dateValue(effective.endAt));
  const [scheduledStart, setScheduledStart] = useState(
    Boolean(effective.startAt),
  );
  const [scheduledEnd, setScheduledEnd] = useState(
    Boolean(effective.endAt) || pc.budgetType === "lifetime",
  );
  const router = useRouter();
  const save = useMutation(
    orpc.ads.setPlatformDraft.mutationOptions({
      onSuccess: () => {
        onApply(draftGoal);
        setOpen(false);
        router.refresh();
      },
    }),
  );
  const dateIssue =
    scheduledStart && !start
      ? "Choose a start date."
      : scheduledEnd && !end
        ? "Choose an end date."
        : metaScheduleIssue(
            {
              startAt: scheduledStart && start ? new Date(start) : null,
              endAt: scheduledEnd && end ? new Date(end) : null,
            },
            budgetType,
          );
  const invalidDates = Boolean(dateIssue);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setDraftGoal(goal);
          setAmount(pc.budget?.toString() ?? "");
          setBudgetType(pc.budgetType === "lifetime" ? "lifetime" : "daily");
          setImportReviewed(meta?.importReviewed ?? false);
          setPlacements(meta?.placements ?? META_DEFAULT_PLACEMENTS);
          setPixel(meta?.pixelId ?? "");
          setEvent(meta?.customEventType ?? "");
          setConversion(meta?.customConversionId ?? "");
          setScope(meta?.conversionScope ?? "pixel");
          setMode(meta?.budgetMode ?? "cbo");
          setStart(dateValue(effective.startAt));
          setEnd(dateValue(effective.endAt));
          setScheduledStart(Boolean(effective.startAt));
          setScheduledEnd(
            Boolean(effective.endAt) || pc.budgetType === "lifetime",
          );
          save.reset();
          setOpen(true);
        }}
      >
        Settings
      </Button>
      <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto pb-6">
        <DialogHeader>
          <DialogTitle>Meta delivery settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          <p>Ad account · Facebook Page</p>
          <p className="text-muted-foreground">
            {choices[0]
              ? `${choices[0].adAccountName ?? choices[0].adAccountId} · Page ${choices[0].pageId ?? "not resolved"}`
              : "Configure Meta access in brand settings."}
          </p>
        </div>
        <label className="space-y-1 text-sm">
          Goal
          <select
            className="w-full rounded border bg-background p-2"
            value={draftGoal}
            onChange={(e) => setDraftGoal(e.target.value as AdPushGoal)}
          >
            {AD_PUSH_GOALS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Saved to the platform draft with the budget, schedule and tracking.
        </p>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Placements</legend>
          {META_PLACEMENTS.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={placements.includes(p.id)}
                onChange={(e) =>
                  setPlacements((current) =>
                    e.target.checked
                      ? [...current, p.id]
                      : current.filter((id) => id !== p.id),
                  )
                }
              />
              {p.label}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            These are the placements sent to Meta. Missing creative is shown in
            review.
          </p>
        </fieldset>
        <label className="space-y-1 text-sm">
          Budget (account currency)
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          Budget period
          <select
            className="w-full rounded border bg-background p-2"
            value={budgetType}
            onChange={(e) => {
              setBudgetType(e.target.value as "daily" | "lifetime");
              if (e.target.value === "lifetime") setScheduledEnd(true);
            }}
          >
            <option value="daily">Daily</option>
            <option value="lifetime">Lifetime</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Budget allocation
          <select
            className="w-full rounded border bg-background p-2"
            value={mode}
            onChange={(e) => setMode(e.target.value as "cbo" | "abo")}
          >
            <option value="cbo">Campaign budget (CBO)</option>
            <option value="abo">Ad set budgets (ABO)</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Pixel / dataset ID
          <Input value={pixel} onChange={(e) => setPixel(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          Conversion event
          <Input
            placeholder="PURCHASE"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          Optimise on
          <select
            className="w-full rounded border bg-background p-2"
            value={scope}
            onChange={(e) => setScope(e.target.value as "host" | "pixel")}
          >
            <option value="pixel">Shared pixel event (all Wander sites)</option>
            <option value="host">This client&apos;s site only</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Custom conversion ID (optional)
          <Input
            value={conversion}
            onChange={(e) => setConversion(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          Start
          <select
            className="w-full rounded border bg-background p-2"
            value={scheduledStart ? "scheduled" : "launch"}
            onChange={(e) => setScheduledStart(e.target.value === "scheduled")}
          >
            <option value="launch">When launched</option>
            <option value="scheduled">Schedule a date</option>
          </select>
        </label>
        {scheduledStart && (
          <label className="space-y-1 text-sm">
            Start date (local time)
            <Input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
        )}
        <label className="space-y-1 text-sm">
          End
          <select
            className="w-full rounded border bg-background p-2"
            value={scheduledEnd ? "scheduled" : "none"}
            onChange={(e) => setScheduledEnd(e.target.value === "scheduled")}
          >
            <option value="none" disabled={budgetType === "lifetime"}>
              Run until paused
            </option>
            <option value="scheduled">Schedule an end date</option>
          </select>
        </label>
        {scheduledEnd && (
          <label className="space-y-1 text-sm">
            End date (local time)
            <Input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Push creates ads paused. When launched, they become eligible to
          deliver after Meta review. Lifetime budgets require an end date.
        </p>
        {meta?.importSource && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={importReviewed}
              onChange={(e) => setImportReviewed(e.target.checked)}
            />
            I reviewed the imported audience and delivery settings. Use this
            setup for the new campaign; source-only settings will not be copied.
          </label>
        )}
        {dateIssue && <p role="alert">{dateIssue}</p>}
        {save.error && <p role="alert">{save.error.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            disabled={
              !placements.length ||
              invalidDates ||
              (amount !== "" &&
                (!Number.isInteger(Number(amount)) || Number(amount) <= 0))
            }
            onClick={() =>
              save.mutate({
                platformCampaignId: pc.id,
                budget: amount ? Number(amount) : null,
                budgetType,
                meta: {
                  goal: draftGoal,
                  startWhenLaunched: !scheduledStart,
                  runUntilPaused: !scheduledEnd,
                  placements,
                  importReviewed,
                  pixelId: pixel.trim(),
                  customEventType: event.trim(),
                  customConversionId: conversion.trim(),
                  conversionScope: scope,
                  budgetMode: mode,
                },
                startAt:
                  scheduledStart && start
                    ? new Date(start).toISOString()
                    : null,
                endAt: scheduledEnd && end ? new Date(end).toISOString() : null,
              })
            }
          >
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectionSummary({
  ad,
  placements,
}: {
  ad: Ad;
  placements: MetaPlacement[];
}) {
  if (!("media" in ad.content)) return null;
  const content = ad.content;
  const visible = metaPreviewPlacements(content, placements);
  const views = META_PLACEMENTS.filter((view) => visible.includes(view.id));
  const slides =
    content.ideaStudio?.document.cards.length ?? content.media.length;
  const issues = [
    ...new Set(
      views.flatMap((view) => {
        const resolved = metaPreviewMedia(content, view.id, ad.brandId);
        return resolved.issue ? [resolved.issue] : [];
      }),
    ),
  ];
  const kinds = [...new Set(views.map((view) => view.kind))];
  return (
    <span className="block space-y-1 text-xs text-muted-foreground">
      <span className="flex flex-wrap items-center gap-2">
        <span>
          {slides > 1 ? `Carousel · ${slides} slides` : "Single image"}
        </span>
        <span aria-hidden>·</span>
        <span>
          {kinds
            .map((kind) =>
              kind === "feed" ? "Feed" : kind === "story" ? "Stories" : "Reels",
            )
            .join(" / ")}
        </span>
      </span>
      {issues.map((issue) => (
        <span key={issue} className="block">
          {issue}
        </span>
      ))}
    </span>
  );
}

function ProjectedAd({
  ad,
  brandName,
  brandLogo,
  placements,
}: {
  ad: Ad;
  brandName: string;
  brandLogo: string | null;
  placements: MetaPlacement[];
}) {
  const [selected, setSelected] = useState<MetaPlacement | "">("");
  const [compare, setCompare] = useState(false);
  const [card, setCard] = useState(0);
  if (!("media" in ad.content)) return null;
  const content = ad.content;
  const previewPlacements = metaPreviewPlacements(content, placements);
  const views = META_PLACEMENTS.filter((p) => previewPlacements.includes(p.id));
  const active = views.find((p) => p.id === selected) ?? views[0];
  return (
    <div className="space-y-4">
      {!views.length && (
        <p className="text-sm text-muted-foreground">
          No placement mapping is available. Choose placements in setup or
          review the imported ad.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">Placement</span>
        <Select
          value={compare ? "all" : active?.id}
          onValueChange={(value) => {
            setCompare(value === "all");
            if (value !== "all") setSelected(value as MetaPlacement);
            setCard(0);
          }}
        >
          <SelectTrigger aria-label="Placement" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Compare all placements</SelectItem>
            {views.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        className={
          compare
            ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] items-start gap-5"
            : "mx-auto w-full max-w-72"
        }
      >
        {(compare ? views : active ? [active] : []).map((view) => {
          const resolved = metaPreviewMedia(content, view.id, ad.brandId);
          const { media } = resolved;
          const issue = resolved.issue;
          return (
            <section
              key={view.id}
              className="space-y-3"
              aria-label={view.label}
            >
              {compare && <h6 className="text-sm font-medium">{view.label}</h6>}
              {issue ? (
                <div className="space-y-3 rounded-lg border border-dashed p-5 text-sm">
                  <p>{issue}</p>
                  <p className="text-xs text-muted-foreground">
                    Return this ad to Studio from its campaign card to change
                    the artwork.
                  </p>
                </div>
              ) : (
                <CompactAdMock
                  preserveArtwork
                  publisher={view.publisher}
                  verticalKind={view.kind === "reel" ? "reel" : "story"}
                  surface={view.surface}
                  frame={"frame" in view ? view.frame : undefined}
                  crop={
                    ("crop" in resolved ? resolved.crop : undefined) ??
                    (content.ideaStudio?.document.shapes.includes("portrait")
                      ? "portrait"
                      : (content.ideaStudio?.document.shapes[0] ?? "portrait"))
                  }
                  brandName={brandName}
                  brandLogo={brandLogo}
                  body={content.body}
                  headline={content.headline}
                  description={content.description ?? null}
                  link={content.linkUrl ?? null}
                  callToAction={
                    content.callToAction ?? META_DEFAULT_CALL_TO_ACTION
                  }
                  media={media}
                  card={Math.min(card, Math.max(0, media.length - 1))}
                  onCard={setCard}
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
