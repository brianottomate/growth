"use client";
import { MetaDeliverySummary } from "./MetaDeliverySummary";
import { DeliveryGroupEditor } from "./DeliveryGroupEditor";
import { hasDeliveryLocations } from "@/lib/platform-delivery";
import type { DeliveryGroupConfiguration } from "@/lib/platform-delivery";

import { DeliveryTargetingSummary } from "./DeliveryTargetingSummary";
import type { NewSeedListContext } from "@/app/app/performance/clients/[brandSlug]/NewSeedList";
import { PlatformAdSelection } from "./PlatformAdSelection";
import { selectPlatformAds } from "@/lib/platform-ad-plan";

import { resolveMetaSchedule, metaScheduleIssue } from "@/lib/meta-schedule";
import { applyMetaTrackingDefaults } from "@/lib/meta-tracking";
import { isImportedMetaCatalog } from "@/lib/meta-import";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { metaPreviewPlacements, metaPreviewMedia } from "@/lib/meta-preview";
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
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { AskAssistantButton } from "./AskAssistantButton";
import { SeedLookalikeStep } from "./SeedLookalikeStep";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { orpc } from "@/orpc/client";
import { AD_PUSH_GOALS, type AdPushGoal } from "@/lib/ad-platforms";
import type {
  Ad,
  AdCreativeContent,
  PlatformCampaign,
  DeliveryGeography,
} from "@/server/db/ads-schema";
import { CompactAdMock } from "@/components/ad-mock";
import { PushToPlatform } from "./PushToPlatform";
import { MetaLeadFormPicker } from "./MetaLeadFormPicker";
import { META_DEFAULT_CALL_TO_ACTION } from "@/lib/zernio-ads";
import { money } from "./format";

type Audience = {
  configuration?: DeliveryGroupConfiguration | null;
  id: string;
  /** The campaign audience this ad set delivers; custom audiences link to it. */
  audienceId?: string | null;
  name: string;
  geography: DeliveryGeography | null;
  ageMin: number | null;
  ageMax: number | null;
  metaTargetName?: string;
};

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
  seedContext,
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
  seedContext?: NewSeedListContext;
}) {
  const saved = pc.settings?.meta;
  const [editingSetup, setEditingSetup] = useState(false);
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
  const routedAds = selectPlatformAds(
    ads,
    "meta_ads",
    pc.settings ?? {},
  ).filter((ad) => ad.status === "approved");
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
  const sets = audiences;
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
  const missingLeadForm = goal === "lead_generation" && !meta?.leadFormId;
  const blockers = [
    scheduleError,
    !configuration &&
      "Configure an ad account and Facebook Page in brand settings.",
    !sets.length && "Add a Meta ad set.",
    ...sets
      .filter((set) => !hasDeliveryLocations(set.geography))
      .map((set) => `Set delivery locations for ${set.name} in Edit.`),
    !placementPlan.length && "Choose delivery placements in Edit setup.",
    missingTracking &&
      "Set a pixel and conversion event, or a custom conversion, in Edit setup.",
    missingLeadForm && "Pick or create a lead form in Edit setup.",
    !pc.budget && "Set a budget in Edit setup.",
    !creativeAds.length && "Add and approve a creative in Ad Studio.",
    missingCreative && "Add the missing artwork for the selected placements.",
    Boolean(catalogCount) &&
      "Catalog ads cannot be included in this creative push.",
    Boolean(meta?.importSource?.issues.length && !meta.importReviewed) &&
      "Review imported delivery settings in Edit setup.",
  ].filter((message): message is string => typeof message === "string");
  const ready = blockers.length === 0;

  return (
    <section
      id="platform-meta_ads"
      className="@container min-w-0 scroll-mt-4 space-y-5 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ChannelLogo platform="meta_ads" className="size-5" />
        <h3 className="font-semibold">Meta Ads</h3>
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
          Planned · paused on push
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingSetup(!editingSetup)}
          >
            {editingSetup ? "Cancel" : "Edit setup"}
          </Button>
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
            <span title={blockers.join("\n")}>
              <Button size="sm" disabled>
                Push to Meta
              </Button>
            </span>
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
      <div id={sectionId} className="space-y-4">
        <section
          id={`${sectionId}-setup`}
          className="space-y-4"
          aria-label="Setup"
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium">Delivery setup</h4>
          </div>
          {editingSetup ? (
            <MetaSettings
              pc={{ ...pc, settings: { ...pc.settings, meta } }}
              brandSlug={brandSlug}
              campaignStartAt={campaignStartAt}
              campaignEndAt={campaignEndAt}
              choices={choices}
              goal={goal}
              onApply={setGoal}
              onClose={() => setEditingSetup(false)}
            />
          ) : (
            <>
              <MetaDeliverySummary
                pc={{
                  ...pc,
                  settings: { ...pc.settings, meta: { ...meta, goal } },
                }}
                accountName={chosen?.adAccountName ?? chosen?.adAccountId}
                pageId={chosen?.pageId}
                campaignStartAt={campaignStartAt}
                campaignEndAt={campaignEndAt}
              />
            </>
          )}
        </section>
        <section className="space-y-3 border-t pt-4" aria-label="Meta ad sets">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-medium">Ad sets · {sets.length}</h4>
          </div>
          {sets.length > 1 && (
            <p className="text-xs text-muted-foreground">
              The same creative selection is included in every ad set.
            </p>
          )}
          {sets.map((audience) => (
            <div key={audience.id} className="rounded-xl border bg-background">
              <div className="relative p-4">
                <details className="group min-w-0">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 pr-20 [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" />
                    <h5 className="text-sm font-semibold">{audience.name}</h5>
                    <span className="text-xs text-muted-foreground">
                      {creativeAds.length}{" "}
                      {creativeAds.length === 1 ? "ad" : "ads"}
                    </span>
                    <div className="w-full pl-7">
                      <DeliveryTargetingSummary compact audience={audience} />
                    </div>
                  </summary>
                  <div className="mt-4 space-y-4">
                    {meta.budgetMode === "abo" && (
                      <p className="text-xs text-muted-foreground">
                        {pc.budget
                          ? `${money(pc.budget)}${pc.budgetType === "daily" ? "/day" : " lifetime"} per ad set`
                          : "Budget not set"}
                      </p>
                    )}
                    {creativeAds.map((ad) => (
                      <article
                        key={ad.id}
                        className="space-y-4 rounded-xl border p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h6 className="min-w-0 flex-1 text-sm font-medium">
                            {ad.name}
                          </h6>
                        </div>
                        <ProjectedAd
                          ad={ad}
                          brandName={brandName}
                          brandLogo={brandLogo}
                          placements={placementPlan}
                        />
                      </article>
                    ))}
                    {!creativeAds.length && (
                      <p className="text-sm text-muted-foreground">
                        No ads included in this ad set.
                      </p>
                    )}
                  </div>
                </details>
                {audience.audienceId && (
                  <div className="mt-3 pl-7">
                    <SeedLookalikeStep
                      brandId={pc.brandId}
                      brandName={brandName}
                      campaignAudienceId={audience.audienceId}
                      display="row"
                    />
                  </div>
                )}
                <div className="absolute top-4 right-4">
                  <DeliveryGroupEditor group={audience}>
                    {audience.audienceId && (
                      <SeedLookalikeStep
                        brandId={pc.brandId}
                        brandName={brandName}
                        campaignAudienceId={audience.audienceId}
                        seedContext={seedContext}
                      />
                    )}
                    <section className="space-y-3 border-t pt-4">
                      <h4 className="text-sm font-medium">
                        Included ads · all Meta ad sets
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Creative selection is saved immediately and applies to
                        every Meta ad set. Location and age changes apply only
                        to this set when you Save.
                      </p>
                      <PlatformAdSelection pc={pc} ads={ads} compact />
                    </section>
                    {audience.audienceId && (
                      <SeedLookalikeStep
                        brandId={pc.brandId}
                        brandName={brandName}
                        campaignAudienceId={audience.audienceId}
                        display="row"
                      />
                    )}
                  </DeliveryGroupEditor>
                </div>
              </div>
            </div>
          ))}
        </section>
        {catalogCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {catalogCount} imported catalog ad(s) are reference only and cannot
            be rebuilt by this publisher. This campaign cannot be pushed with
            catalog ads included.
          </p>
        )}
      </div>
    </section>
  );
}

function MetaSettings({
  pc,
  brandSlug,
  campaignStartAt,
  campaignEndAt,
  choices,
  goal,
  onApply,
  onClose,
}: {
  pc: PlatformCampaign;
  brandSlug: string;
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
  onClose: () => void;
}) {
  const [draftGoal, setDraftGoal] = useState(goal);
  const [amount, setAmount] = useState(pc.budget?.toString() ?? "");
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">(
    pc.budgetType === "lifetime" ? "lifetime" : "daily",
  );
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
  const [leadFormId, setLeadFormId] = useState(meta?.leadFormId ?? "");
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
  const [end, setEnd] = useState(dateValue(effective.endAt));
  const [scheduledEnd, setScheduledEnd] = useState(
    Boolean(effective.endAt) || pc.budgetType === "lifetime",
  );
  const router = useRouter();
  const save = useMutation(
    orpc.ads.setPlatformDraft.mutationOptions({
      onSuccess: () => {
        onApply(draftGoal);
        onClose();
        router.refresh();
      },
    }),
  );
  const dateIssue =
    scheduledEnd && !end
      ? "Choose an end date."
      : metaScheduleIssue(
          {
            startAt: null,
            endAt: scheduledEnd && end ? new Date(end) : null,
          },
          budgetType,
        );
  const invalidDates = Boolean(dateIssue);
  return (
    <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
      <label className="space-y-1 text-sm">
        Goal
        <Select
          value={draftGoal}
          onValueChange={(value) => setDraftGoal(value as AdPushGoal)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AD_PUSH_GOALS.map((g) => (
              <SelectItem key={g} value={g}>
                {g.charAt(0).toUpperCase() + g.slice(1).replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {draftGoal === "lead_generation" && (
        <MetaLeadFormPicker
          brandSlug={brandSlug}
          value={leadFormId}
          onChange={setLeadFormId}
        />
      )}
      <div className="space-y-1 text-sm">
        <p>Ad account · Facebook Page</p>
        <p className="text-muted-foreground">
          {choices[0]
            ? `${choices[0].adAccountName ?? choices[0].adAccountId} · Page ${choices[0].pageId ?? "not resolved"}`
            : "Configure Meta access in brand settings."}
        </p>
      </div>
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
        <Select
          value={budgetType}
          onValueChange={(value) => {
            setBudgetType(value as "daily" | "lifetime");
            if (value === "lifetime") setScheduledEnd(true);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="lifetime">Lifetime</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1 text-sm">
        Budget allocation
        <Select
          value={mode}
          onValueChange={(value) => setMode(value as "cbo" | "abo")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cbo">Campaign budget (CBO)</SelectItem>
            <SelectItem value="abo">Ad set budgets (ABO)</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1 text-sm">
        End
        <Select
          value={scheduledEnd ? "scheduled" : "none"}
          onValueChange={(value) => setScheduledEnd(value === "scheduled")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" disabled={budgetType === "lifetime"}>
              Run until paused
            </SelectItem>
            <SelectItem value="scheduled">Schedule an end date</SelectItem>
          </SelectContent>
        </Select>
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
        Push creates ads paused. When launched, they become eligible to deliver
        after Meta review. Lifetime budgets require an end date.
      </p>
      <details className="space-y-3 @xl:col-span-2">
        <summary className="cursor-pointer text-sm font-medium">
          Placements and tracking
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-4 @xl:grid-cols-2">
          {" "}
          <fieldset className="space-y-2 @xl:col-span-2">
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
              These are the placements sent to Meta. Missing creative is shown
              in review.
            </p>
          </fieldset>
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
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as "host" | "pixel")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pixel">
                  Shared pixel event (all Wander sites)
                </SelectItem>
                <SelectItem value="host">
                  This client&apos;s site only
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            Custom conversion ID (optional)
            <Input
              value={conversion}
              onChange={(e) => setConversion(e.target.value)}
            />
          </label>
        </div>
      </details>
      {meta?.importSource && (
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={importReviewed}
            onChange={(e) => setImportReviewed(e.target.checked)}
          />
          I reviewed the imported audience and delivery settings. Use this setup
          for the new campaign; source-only settings will not be copied.
        </label>
      )}
      {dateIssue && <p role="alert">{dateIssue}</p>}
      {save.error && <p role="alert">{save.error.message}</p>}
      <div className="flex justify-end gap-2 @xl:col-span-2">
        <Button variant="outline" onClick={onClose}>
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
                startWhenLaunched: true,
                runUntilPaused: !scheduledEnd,
                placements,
                importReviewed,
                pixelId: pixel.trim(),
                customEventType: event.trim(),
                customConversionId: conversion.trim(),
                conversionScope: scope,
                budgetMode: mode,
                leadFormId: draftGoal === "lead_generation" ? leadFormId : "",
              },
              startAt: null,
              endAt: scheduledEnd && end ? new Date(end).toISOString() : null,
            })
          }
        >
          Save settings
        </Button>
      </div>
    </div>
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
        <span className="text-sm">Preview placement</span>
        <Select
          value={compare ? "all" : active?.id}
          onValueChange={(value) => {
            setCompare(value === "all");
            if (value !== "all") setSelected(value as MetaPlacement);
            setCard(0);
          }}
        >
          <SelectTrigger
            aria-label={`Preview placement for ${ad.name}`}
            className="w-full sm:w-64"
          >
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
