"use client";

import { resolveMetaSchedule, metaScheduleIssue } from "@/lib/meta-schedule";
import { applyMetaTrackingDefaults } from "@/lib/meta-tracking";
import Image from "next/image";
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
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { orpc } from "@/orpc/client";
import { AD_PUSH_GOALS, type AdPushGoal } from "@/lib/ad-platforms";
import type {
  Ad,
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

/** "connection:adAccount", the select's key, as the draft's saved destination. */
function destinationOf(key: string) {
  const at = key.indexOf(":");
  if (at <= 0) return {};
  return {
    destination: {
      connectionAccountId: key.slice(0, at),
      adAccountId: key.slice(at + 1),
    },
  };
}

export function MetaPlatformCard({
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
  unapprovedCount,
}: {
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
  unapprovedCount: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [projectionOpen, setProjectionOpen] = useLocalStorage<
    Record<string, boolean>
  >({
    key: `meta-projections:${campaignId}:${pc.id}:expanded`,
    defaultValue: DEFAULT_PROJECTION_EXPANSION,
  });

  const saved = pc.settings?.meta;
  const [destinationKey, setDestinationKey] = useState(
    saved?.destination
      ? `${saved.destination.connectionAccountId}:${saved.destination.adAccountId}`
      : "",
  );
  const [goal, setGoal] = useState<AdPushGoal>(saved?.goal ?? "conversions");
  const sectionId = useId();
  const destinations = useQuery(
    orpc.ads.destinations.queryOptions({
      input: { brandSlug, platform: "meta" },
      enabled: expanded,
    }),
  );
  // Facebook and Meta Ads connections can expose the same paying account/Page.
  const choices = (destinations.data?.destinations ?? []).filter(
    (choice, index, all) =>
      index ===
      all.findIndex(
        (other) =>
          other.adAccountId === choice.adAccountId &&
          other.pageId === choice.pageId &&
          other.runsAsBrandPage === choice.runsAsBrandPage,
      ),
  );
  const chosen =
    choices.find(
      (d) => `${d.connectionAccountId}:${d.adAccountId}` === destinationKey,
    ) ?? (choices.length === 1 ? choices[0] : undefined);
  const configuration = chosen
    ? {
        connectionAccountId: chosen.connectionAccountId,
        adAccountId: chosen.adAccountId,
        goal,
        label: `${chosen.adAccountName ?? chosen.adAccountId} · Page ${chosen.pageId ?? "not resolved"}`,
      }
    : undefined;
  const catalogCount = ads.filter(
    (ad) => "media" in ad.content && isImportedMetaCatalog(ad.content),
  ).length;
  const creativeAds = ads.filter(
    (ad) =>
      ad.type === "creative" &&
      "media" in ad.content &&
      !isImportedMetaCatalog(ad.content) &&
      // An approved idea has no media until the push saves its images.
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
        (p) =>
          metaPlacementMedia(
            ad.content as import("@/server/db/ads-schema").AdCreativeContent,
            p,
          ).issue,
      ),
  );
  const missingTracking =
    goal === "conversions" &&
    !meta?.customConversionId &&
    !(meta?.pixelId && meta?.customEventType);
  const blockers = [
    scheduleError,
    !configuration && "Choose an ad account in Edit setup.",
    configuration &&
      !chosen?.runsAsBrandPage &&
      "The connection does not have access to this brand’s Facebook Page.",
    !placementPlan.length && "Choose delivery placements in Edit setup.",
    missingTracking &&
      "Set a pixel and conversion event, or a custom conversion, in Edit setup.",
    !pc.budget && "Set a budget in Edit setup.",
    !creativeAds.length && "Add at least one creative ad.",
    Boolean(unapprovedCount) &&
      "Approve or delete all remaining ad ideas before validating or pushing.",
    missingCreative && "Add the missing artwork for the selected placements.",
    Boolean(catalogCount) &&
      "Catalog ads cannot be included in this creative push.",
    Boolean(meta?.importSource?.issues.length && !meta.importReviewed) &&
      "Review imported delivery settings in Edit setup.",
  ].filter((message): message is string => typeof message === "string");
  const ready = blockers.length === 0;

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ChannelLogo platform="meta_ads" className="size-5" />
        <h3 className="font-semibold">On Meta Ads</h3>
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
          Planned
        </span>
        <span className="text-sm text-muted-foreground">
          {sets.length} ad {sets.length === 1 ? "set" : "sets"} ×{" "}
          {creativeAds.length} {creativeAds.length === 1 ? "ad" : "ads"} ·{" "}
          {pc.budget ? money(pc.budget) : "Budget not set"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={sectionId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
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
        </div>
      </div>
      {!ready && !destinations.isPending && (
        <div
          className="space-y-1 text-sm text-muted-foreground"
          aria-label="Required before pushing"
        >
          <p className="font-medium">Before pushing</p>
          <ul className="list-disc pl-5">
            {blockers.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {expanded && (
        <div id={sectionId} className="space-y-5">
          <section
            id={`${sectionId}-setup`}
            className="space-y-4"
            aria-label="Setup"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold">Setup</h4>
              <MetaSettings
                pc={{ ...pc, settings: { ...pc.settings, meta } }}
                campaignStartAt={campaignStartAt}
                campaignEndAt={campaignEndAt}
                choices={choices}
                destinationKey={
                  chosen
                    ? `${chosen.connectionAccountId}:${chosen.adAccountId}`
                    : ""
                }
                goal={goal}
                onApply={(key, nextGoal) => {
                  setDestinationKey(key);
                  setGoal(nextGoal);
                }}
              />
            </div>
            <dl className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
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
                  chosen?.adAccountName ??
                  chosen?.adAccountId ??
                  (destinations.isPending ? "Loading…" : "Not selected")
                }
                detail={chosen?.pageId ? `Page ${chosen.pageId}` : "No Page"}
              />
            </dl>
            {destinations.error && (
              <p role="alert" className="text-sm">
                {destinations.error.message}
              </p>
            )}
            {chosen && !chosen.runsAsBrandPage && (
              <p role="alert" className="text-sm">
                This destination does not match the brand’s Facebook Page.
                Choose a matching connection before pushing.
              </p>
            )}
            {!destinations.isPending &&
              !destinations.error &&
              !choices.length && (
                <p className="text-sm text-muted-foreground">
                  No allowlisted Meta destination is connected to this brand.
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
          <section className="space-y-4 border-t pt-5" aria-label="Projection">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="font-semibold">Placement review</h4>
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
            <p className="text-xs text-muted-foreground">
              Compare placements for each ad. These previews share the creative
              above; editing happens in the ad idea. Previewing does not approve
              delivery.
            </p>
            <div>
              <h4 className="font-semibold">{campaignName}</h4>
              <p className="text-sm text-muted-foreground">
                {goal} · {sets.length} ad sets ·{" "}
                {sets.length * creativeAds.length} ads · Will create paused
              </p>
            </div>
            {sets.map((audience) => (
              <div
                key={audience.id}
                className="space-y-1 rounded-lg border px-4 py-3"
              >
                <h5 className="text-sm font-semibold">
                  Ad set · {audience.name}
                </h5>
                <p className="text-xs text-muted-foreground">
                  {[
                    ...(audience.geography?.countries ?? []),
                    ...(audience.geography?.states ?? []),
                    ...(audience.geography?.regions ?? []),
                    ...(audience.geography?.cities ?? []),
                  ].join(" · ") || "Broad · provider defaults"}
                  {audience.ageMin != null || audience.ageMax != null
                    ? ` · Ages ${audience.ageMin ?? 13}–${audience.ageMax ?? "65+"}`
                    : " · No age narrowing"}
                </p>
              </div>
            ))}
            {!placementPlan.length && !meta?.importSource && (
              <p className="text-sm text-muted-foreground">
                Choose delivery placements to preview approved artwork.{" "}
                <a className="underline" href={`#${sectionId}-setup`}>
                  Edit setup above
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
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Meta campaign source</DialogTitle>
                    <DialogDescription>
                      Local working copy of campaign{" "}
                      {meta.importSource.campaignId}. Reconstructed previews are
                      not a report of actual delivery.
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
              {sets.length === 1 ? "set" : "sets"}. Expand to inspect delivery.
            </p>
            {creativeAds.map((ad, index) => {
              const open = projectionOpen?.[ad.id] ?? index === 0;
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
                      <ProjectionSummary
                        ad={ad}
                        placements={placementPlan}
                        expanded={open}
                      />
                    </span>
                  </button>
                  <div id={panelId} hidden={!open} className="px-4 pb-4">
                    {open && (
                      <ProjectedAd
                        ad={ad}
                        brandName={brandName}
                        brandLogo={brandLogo}
                        placements={placementPlan}
                        configuration={configuration}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {ads.length - catalogCount !== creativeAds.length && (
              <p className="text-sm text-muted-foreground">
                {ads.length - catalogCount - creativeAds.length} ads without
                media are excluded from this Meta projection.
              </p>
            )}
          </section>
          {catalogCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {catalogCount} imported catalog ad(s) are reference only and
              cannot be rebuilt by this publisher. This campaign cannot be
              pushed with catalog ads included.
            </p>
          )}
          {unapprovedCount > 0 && (
            <p className="text-sm">
              Approve or delete {unapprovedCount} remaining ads before pushing.
            </p>
          )}
          {!pc.budget && (
            <p className="text-sm text-muted-foreground">
              Set a budget to enable validation and push.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Push creates the campaign paused. Launch is a separate action after
            reviewing the result in Meta.
          </p>
        </div>
      )}
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
    <div className="min-w-0 rounded-lg border p-3">
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
  destinationKey,
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
  destinationKey: string;
  goal: AdPushGoal;
  onApply: (key: string, goal: AdPushGoal) => void;
}) {
  const [draftDestination, setDraftDestination] = useState(destinationKey);
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
        onApply(draftDestination, draftGoal);
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
          setDraftDestination(destinationKey);
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
        Edit setup
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Meta delivery settings</DialogTitle>
        </DialogHeader>
        <label className="space-y-1 text-sm">
          Ad account · Facebook Page
          <select
            className="w-full rounded border bg-background p-2"
            value={draftDestination}
            onChange={(e) => setDraftDestination(e.target.value)}
          >
            <option value="" disabled>
              Choose an allowlisted account
            </option>
            {choices.map((d) => (
              <option
                key={`${d.connectionAccountId}:${d.adAccountId}`}
                value={`${d.connectionAccountId}:${d.adAccountId}`}
              >
                {d.adAccountName ?? d.adAccountId} · Page{" "}
                {d.pageId ?? "not resolved"}
              </option>
            ))}
          </select>
        </label>
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
                  ...destinationOf(draftDestination),
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
  expanded,
}: {
  ad: Ad;
  placements: MetaPlacement[];
  expanded: boolean;
}) {
  if (!("media" in ad.content)) return null;
  const content = ad.content;
  const visible = metaPreviewPlacements(content, placements);
  const views = META_PLACEMENTS.filter((view) => visible.includes(view.id));
  const groups = new Map<
    string,
    {
      media: ReturnType<typeof metaPreviewMedia>["media"];
      labels: Set<string>;
      vertical: boolean;
      square: boolean;
    }
  >();
  const issues = new Set<string>();
  for (const view of views) {
    const resolved = metaPreviewMedia(content, view.id, ad.brandId);
    const vertical = view.kind !== "feed";
    // Facebook and Instagram feeds can get different cards (square on
    // Facebook), so a feed group says which one it is.
    const label = vertical
      ? "Stories & Reels"
      : view.publisher === "facebook"
        ? "Facebook feed"
        : "Instagram feed";
    if (resolved.issue) {
      issues.add(`${label}: ${resolved.issue}`);
      continue;
    }
    const key = JSON.stringify(resolved.media.map((item) => item.url));
    const existing = groups.get(key);
    if (existing) existing.labels.add(label);
    else
      groups.set(key, {
        media: resolved.media,
        labels: new Set([label]),
        vertical,
        square: "crop" in resolved && resolved.crop === "square",
      });
  }
  // An approved idea's media stays empty until the push saves its images.
  const slides =
    content.ideaStudio?.document.cards.length ?? content.media.length;
  return (
    <span className="block space-y-3">
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {slides > 1 ? `Carousel · ${slides} slides` : "Single image"}
        </span>
        {[...new Set(views.map((view) => view.publisher))].map((publisher) => (
          <ChannelLogo
            key={publisher}
            platform={publisher}
            className="size-3.5"
          />
        ))}
        {issues.size > 0 && <span>· {[...issues].join(" · ")}</span>}
      </span>
      {!expanded && (
        <span className="flex flex-wrap gap-x-5 gap-y-3">
          {[...groups.entries()].map(([key, group]) => (
            <span key={key} className="block max-w-full min-w-0 space-y-1.5">
              {groups.size > 1 && (
                <span className="block text-xs text-muted-foreground">
                  {[...group.labels].join(" / ")}
                </span>
              )}
              <span className="flex flex-wrap gap-2">
                {group.media.map((item, index) => (
                  <span
                    key={`${index}:${item.url}`}
                    className={`relative block h-[144px] shrink-0 overflow-hidden rounded-md bg-muted ${group.vertical ? "w-[81px]" : group.square ? "w-[144px]" : "w-[115px]"}`}
                  >
                    {item.type === "video" ? (
                      <span className="flex size-full items-center justify-center text-xs">
                        Video
                      </span>
                    ) : (
                      <Image
                        src={item.url}
                        alt={`${[...group.labels].join(" / ")} · slide ${index + 1}`}
                        fill
                        unoptimized
                        className="object-contain"
                      />
                    )}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

function MetaNativePreview({
  adId,
  configuration,
}: {
  adId: string;
  configuration?: { connectionAccountId: string; adAccountId: string };
}) {
  const preview = useMutation(orpc.ads.previewAd.mutationOptions());
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!configuration}
          onClick={() => {
            if (configuration && !preview.data && !preview.isPending)
              preview.mutate({
                adId,
                connectionAccountId: configuration.connectionAccountId,
                adAccountId: configuration.adAccountId,
              });
          }}
        >
          Meta preview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Meta-rendered feed preview</DialogTitle>
          <DialogDescription>
            Meta renders this local copy using the selected account and Page.
            This is not a snapshot of the live ad. Stories and Reels use the
            local previews.
          </DialogDescription>
        </DialogHeader>
        {preview.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading Meta previews…
          </p>
        )}
        {preview.error && (
          <p role="alert" className="text-sm">
            {preview.error.message}
          </p>
        )}
        {preview.data && !preview.data.previewUrls.length && (
          <p className="text-sm">Meta did not return an embeddable preview.</p>
        )}
        {preview.data?.previewUrls.map((src, index) => {
          let safe = false;
          try {
            const url = new URL(src);
            safe =
              url.protocol === "https:" &&
              (url.hostname === "facebook.com" ||
                url.hostname.endsWith(".facebook.com"));
          } catch {}
          return safe ? (
            <iframe
              key={src}
              src={src}
              title={`Meta feed preview ${index + 1}`}
              className="h-[640px] w-full rounded border bg-white"
              sandbox="allow-scripts allow-same-origin allow-popups"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : null;
        })}
        {preview.error && (
          <Button
            variant="outline"
            onClick={() => {
              if (configuration) preview.mutate({ adId, ...configuration });
            }}
          >
            Try again
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProjectedAd({
  ad,
  brandName,
  brandLogo,
  placements,
  configuration,
}: {
  ad: Ad;
  brandName: string;
  brandLogo: string | null;
  placements: MetaPlacement[];
  configuration?: { connectionAccountId: string; adAccountId: string };
}) {
  const [selected, setSelected] = useState<MetaPlacement | "">("");
  const [compare, setCompare] = useState(true);
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
        <MetaNativePreview
          key={`${String(ad.updatedAt)}:${configuration?.connectionAccountId}:${configuration?.adAccountId}`}
          adId={ad.id}
          configuration={configuration}
        />
        {!configuration && (
          <span className="text-xs text-muted-foreground">
            Select an account in setup for Meta previews.
          </span>
        )}
        <label className="text-sm">
          Placements{" "}
          <select
            className="ml-2 rounded border bg-background p-2"
            value={compare ? "all" : active?.id}
            onChange={(e) => {
              setCompare(e.target.value === "all");
              if (e.target.value !== "all")
                setSelected(e.target.value as MetaPlacement);
              setCard(0);
            }}
          >
            <option value="all">Compare all placements</option>
            {views.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className={
          compare
            ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] items-start gap-5"
            : "max-w-72"
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      document.getElementById(`ad-${ad.id}`)?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                      window.dispatchEvent(
                        new CustomEvent("prepare-ad-creative", {
                          detail: {
                            adId: ad.id,
                            shape: view.kind === "feed" ? "portrait" : "story",
                          },
                        }),
                      );
                    }}
                  >
                    Review ad creative
                  </Button>
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
