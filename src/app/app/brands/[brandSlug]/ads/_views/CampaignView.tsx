import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WorkspaceCardHeader } from "@/app/app/performance/WorkspaceCard";
import { WorkspaceBreadcrumbs } from "@/components/workspace-breadcrumbs";
import {
  campaignDisplayName,
  campaignListPath,
  type CampaignWorkspace,
} from "@/lib/campaign-navigation";
import { workspaceActor } from "@/server/workspace-actor";
import { listBrandHomes } from "@/server/services/homes.service";
import { isImportedMetaCatalog } from "@/lib/meta-import";
import { notFound, redirect } from "next/navigation";
import { and, inArray, isNotNull } from "drizzle-orm";
import { Images, Radio, Users, ChartNoAxesCombined } from "lucide-react";

import { db } from "@/server/db";
import { homeTable, platformAdTable } from "@/server/db/schema";
import { destinationLabel, safeHomeUrl } from "@/lib/ad-preview-links";
import { getSession } from "@/server/better-auth/server";
import { platformLabel } from "@/components/channel-logos";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/lib/utils";
import { getDraftCampaign } from "@/server/services/ads-draft.service";

import { type AdState } from "@/lib/ad-wall";
import { targetedAsset } from "@/lib/audience-asset";
import { AdIdeasList } from "./AdIdeasList";

import { AskAssistantButton } from "./AskAssistantButton";
import { Audiences } from "./Audiences";
import { AddExistingAdsDialog } from "@/app/app/performance/clients/[brandSlug]/ads/AddExistingAdsDialog";
import { money } from "./format";
import { PlanPlatformButton } from "./PlanPlatformButton";
import { PlatformSection } from "./PlatformSection";
import { WorkInChatButton } from "./WorkInChatButton";

/**
 * The campaign, read top to bottom as the work happens: the ads, the photos
 * they can draw from, who sees them, where they run, and what they are doing
 * once live. Ads come first because the set is drawn on the brand's Ads tab
 * and attached here; the pool is a source, not a step someone must fill. Each step shows its content when it has some and one clear way to
 * fill it when it does not, and each step can be handed to the assistant.
 *
 * Underneath it is still one plan compiled onto platforms: the platform rows
 * hold the authoritative budget while drafts, and the platform's own numbers
 * once pushed.
 */
export async function CampaignView({
  brandSlug,
  campaignId,
  workspace = "brand",
}: {
  brandSlug: string;
  campaignId: string;
  group?: "home" | "format";
  workspace?: CampaignWorkspace;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const actor = await workspaceActor();
  if (!actor) notFound();
  const org = { id: actor.orgId };

  // A read that fails is logged before it becomes a 404, so a broken query
  // never masquerades as a missing campaign.
  const draft = await getDraftCampaign(org.id, campaignId).catch(
    (error: unknown) => {
      console.error("campaign page could not load", campaignId, error);
      return null;
    },
  );
  if (draft?.brand.slug !== brandSlug) notFound();

  const { campaign, audiences, ads, platformCampaigns, platformAudiences } =
    draft;
  const reusableAssets = platformAudiences.map((asset) => ({
    ...asset,
    linkedAudienceIds: draft.assetLinks
      .filter((link) => link.platformAudienceId === asset.id)
      .map((link) => link.audienceId),
  }));
  const metaTargets = Object.fromEntries(
    audiences.flatMap((row) => {
      const hit = targetedAsset(row, reusableAssets, "meta_ads");
      return hit ? [[row.id, { name: hit.asset.name, via: hit.via }]] : [];
    }),
  );
  const brand = draft.brand;
  const brandName = brand.name;

  // Their homes, for binding an ad to one. Empty for a brand whose WanderOS
  // site is not connected, in which case a home is a name typed on the tile.
  const orderedHomes = await listBrandHomes(brand.id);
  const adHomeIds = [
    ...new Set(ads.flatMap((ad) => (ad.homeId ? [ad.homeId] : []))),
  ];
  const adHomes = adHomeIds.length
    ? await db.query.homeTable.findMany({
        where: inArray(homeTable.id, adHomeIds),
        columns: { id: true, name: true, url: true },
      })
    : [];
  const homeLinks = Object.fromEntries(
    adHomes.flatMap((home) => {
      const url = safeHomeUrl(home.url);
      return url ? [[home.id, { name: home.name, url }]] : [];
    }),
  );
  const planned = [...platformCampaigns].sort((a, b) =>
    a.platform.localeCompare(b.platform),
  );
  const plannedPlatforms = planned.map((row) => row.platform);
  const pushed = planned.filter((row) => row.externalId);
  const anyPushed = pushed.length > 0;
  const anyLive = planned.some((row) => row.status === "live");

  // Where each ad stands, from the platform rows that point back at it.
  const states: Record<string, AdState> = {};
  if (pushed.length > 0) {
    const liveIds = new Set(
      pushed.filter((row) => row.status === "live").map((row) => row.id),
    );
    const rows = await db.query.platformAdTable.findMany({
      where: and(
        inArray(
          platformAdTable.platformCampaignId,
          pushed.map((row) => row.id),
        ),
        isNotNull(platformAdTable.adId),
      ),
      columns: { adId: true, platformCampaignId: true },
    });
    for (const row of rows) {
      if (!row.adId) continue;
      const state: AdState = liveIds.has(row.platformCampaignId)
        ? "live"
        : "pushed";
      if (states[row.adId] !== "live") states[row.adId] = state;
    }
  }

  const totals = planned.reduce(
    (acc, row) => {
      const stats = row.stats ?? {};
      acc.spend += stats.spend ?? row.spend ?? 0;
      acc.impressions += stats.impressions ?? 0;
      acc.clicks += stats.clicks ?? 0;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0 },
  );
  const ctr =
    totals.impressions > 0
      ? `${((totals.clicks / totals.impressions) * 100).toFixed(2)}%`
      : "—";

  const ask = (
    focus: "photos" | "ads" | "audiences" | "platforms" | "live",
    text: string,
  ) => (
    <AskAssistantButton
      brandId={brand.id}
      brandName={brandName}
      campaignId={campaign.id}
      campaignName={campaign.name}
      focus={focus}
      ask={text}
      variant="ghost"
    />
  );

  const editableAds = ads.filter(
    (ad) => !("media" in ad.content) || !isImportedMetaCatalog(ad.content),
  );
  // The push sends approved ads; drafts stay here until they are approved.
  const approvedAds = ads.filter((ad) => ad.status === "approved");
  const adActions = (
    <div className="flex flex-wrap items-center gap-2">
      {!anyPushed && (
        <>
          <AddExistingAdsDialog brandId={brand.id} campaignId={campaign.id} />
          <Button size="sm" variant="outline" asChild>
            <Link
              href={`/app/performance/clients/${brand.slug ?? brand.id}/ads`}
            >
              Create in Studio
            </Link>
          </Button>
        </>
      )}
      <AskAssistantButton
        brandId={brand.id}
        brandName={brandName}
        campaignId={campaign.id}
        campaignName={campaign.name}
        focus="ads"
        label="Shape"
        newThread
        ask={`Help me shape the ads for “${campaignDisplayName(campaign.name)}”. Read the campaign and its assigned ads, then discuss the creative and copy I want to refine before making changes.`}
      />
    </div>
  );
  const platformActions = (
    <>
      <PlanPlatformButton
        brandId={brand.id}
        brandName={brandName}
        campaignId={campaign.id}
        campaignName={campaign.name}
        planned={plannedPlatforms}
      />
      <AskAssistantButton
        brandId={brand.id}
        brandName={brandName}
        campaignId={campaign.id}
        campaignName={campaign.name}
        focus="platforms"
        label="Shape"
        newThread
        ask={`Help me shape the platform plan for “${campaign.name}”. Read its current setup and discuss platforms, budget and tracking with me before changing anything.`}
      />
    </>
  );
  return (
    <div className="space-y-4">
      <header className="space-y-3 py-1">
        {/* The Performance brand layout already crumbs Clients / brand and
            its Campaigns tab is the way back, so only the brand workspace
            needs a trail. */}
        {workspace !== "performance" && (
          <WorkspaceBreadcrumbs
            items={[
              { label: "Brands", href: "/app/brands" },
              { label: brandName, href: `/app/brands/${brandSlug}` },
              {
                label: "Paid campaigns",
                href: campaignListPath(brandSlug, workspace),
              },
              { label: campaign.name },
            ]}
          />
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h2
                title={campaign.name}
                className="line-clamp-2 min-w-0 text-2xl leading-snug font-semibold tracking-tight [overflow-wrap:anywhere]"
              >
                {campaignDisplayName(campaign.name)}
              </h2>
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-5 font-medium",
                  anyLive
                    ? "bg-primary/10 text-primary"
                    : anyPushed
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {anyLive ? "live" : anyPushed ? "pushed, paused" : "draft"}
              </span>
            </div>
            {(campaign.budget != null || campaign.landingUrl) && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {campaign.budget != null ? (
                  <span>{money(campaign.budget)} planned</span>
                ) : null}
                {campaign.landingUrl ? (
                  <a
                    href={safeHomeUrl(campaign.landingUrl) ?? undefined}
                    title={campaign.landingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-full min-w-0 truncate underline underline-offset-4"
                  >
                    {destinationLabel(campaign.landingUrl)} ↗
                  </a>
                ) : null}
              </p>
            )}
            {campaign.description ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {campaign.description}
              </p>
            ) : null}
            <nav aria-label="Sections" className="mt-3 flex flex-wrap gap-1.5">
              {[
                ["campaign-ads", `Ads · ${ads.length}`],
                ["campaign-audiences", "Audiences"],
                ["campaign-platforms", "Platforms"],
              ].map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <WorkInChatButton
              brandId={brand.id}
              brandName={brandName}
              campaignId={campaign.id}
              campaignName={campaign.name}
              hasAds={ads.length > 0}
            />
          </div>
        </div>
      </header>

      <section
        id="campaign-ads"
        className="scroll-mt-4 space-y-4 rounded-xl border bg-background p-4"
      >
        <AdIdeasList
          actions={adActions}
          emptyState={
            <EmptyState
              compact
              icon={Images}
              title="Add the campaign’s first ads"
              description="Choose existing brand ads or create a new ad."
              actions={adActions}
            />
          }
          preparingHero={false}
          homeOrder={orderedHomes.map((home) => home.id)}
          homeLinks={homeLinks}
          studioHref={`/app/performance/clients/${brandSlug}/ads`}
          ads={ads}
          brandId={brand.id}
          brandName={brandName}
          brandLogo={brand.logo}
          states={states}
          plannedPlatforms={plannedPlatforms}
        />
      </section>
      <section>
        <ol className="space-y-4">
          <Step
            title="Audiences"
            hideHeading
            meta={
              audiences.length > 0
                ? `${audiences.length} ad set${audiences.length === 1 ? "" : "s"}`
                : "broad"
            }
          >
            <Audiences
              campaignId={campaign.id}
              campaignName={campaign.name}
              brandId={brand.id}
              brandName={brandName}
              audiences={audiences}
              metaTargets={metaTargets}
              personas={draft.personas}
            />
          </Step>

          <Step
            title="Platforms"
            meta={
              planned.length > 0
                ? planned.map((row) => platformLabel(row.platform)).join(", ")
                : undefined
            }
            actions={platformActions}
          >
            {editableAds.length > 0 && (
              <div className="mb-4 space-y-2 rounded-lg border p-3">
                <h3 className="text-sm font-medium">Ad destinations</h3>
                <p className="text-xs text-muted-foreground">
                  Review the saved ad URLs below and the tracking settings in
                  each platform draft. Edit destinations in the ad editor or Ad
                  Studio.
                </p>
                <ul className="space-y-2 text-xs">
                  {editableAds.map((ad) => {
                    const url = ad.content.linkUrl ?? campaign.landingUrl;
                    const safe = safeHomeUrl(url);
                    const cardUrls =
                      "media" in ad.content
                        ? ad.content.media.flatMap((card, index) =>
                            card.landingUrl
                              ? [{ index, url: card.landingUrl }]
                              : [],
                          )
                        : [];
                    return (
                      <li key={ad.id} className="space-y-1">
                        <span className="font-medium">{ad.name}: </span>
                        {safe ? (
                          <a
                            href={safe}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all underline"
                          >
                            {url}
                          </a>
                        ) : (
                          <span role="alert" className="text-destructive">
                            {url
                              ? "Invalid destination URL"
                              : "Missing destination URL"}
                          </span>
                        )}
                        {ad.content.linkUrl == null && safe && (
                          <span className="text-muted-foreground">
                            {" "}
                            (campaign fallback)
                          </span>
                        )}
                        {cardUrls.map((card) => (
                          <p key={card.index} className="pl-3 break-all">
                            Card {card.index + 1}:{" "}
                            {safeHomeUrl(card.url) ? (
                              <a
                                href={safeHomeUrl(card.url)!}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                              >
                                {card.url}
                              </a>
                            ) : (
                              <span role="alert" className="text-destructive">
                                Invalid card destination URL
                              </span>
                            )}
                          </p>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {planned.length === 0 ? (
              <EmptyState
                compact
                icon={Radio}
                title="Choose where the campaign runs"
                actions={platformActions}
                description="Create a Meta draft, or choose another platform. Review its account, tracking and budget before pushing. Shape lets you work through those choices together."
              />
            ) : (
              <div className="space-y-2">
                {planned.map((platformCampaign) => (
                  <PlatformSection
                    workspace={workspace}
                    brandName={brandName}
                    brandLogo={brand.logo}
                    key={platformCampaign.id}
                    brandSlug={brandSlug}
                    campaignId={campaign.id}
                    platformCampaign={platformCampaign}
                    campaignName={campaign.name}
                    campaignStartAt={campaign.startAt}
                    campaignEndAt={campaign.endAt}
                    draftAds={approvedAds}
                    audiences={audiences}
                    draftAdCount={approvedAds.length}
                    unapprovedCount={editableAds.length - approvedAds.length}
                    audienceCount={audiences.length}
                    brandUrl={campaign.landingUrl ?? brand.website ?? null}
                  />
                ))}
              </div>
            )}
          </Step>

          {anyPushed ? (
            <Step
              title="Results"
              meta={anyLive ? "spending" : "paused"}
              actions={ask("live", `How is “${campaign.name}” doing?`)}
            >
              <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
                <Stat
                  label="Spend"
                  value={money(totals.spend)}
                  sub={
                    campaign.budget != null
                      ? `of ${money(campaign.budget)} planned`
                      : undefined
                  }
                />
                <Stat
                  label="Impressions"
                  value={
                    totals.impressions
                      ? totals.impressions.toLocaleString()
                      : "—"
                  }
                />
                <Stat
                  label="Clicks"
                  value={totals.clicks ? totals.clicks.toLocaleString() : "—"}
                />
                <Stat label="CTR" value={ctr} />
              </div>
            </Step>
          ) : null}
        </ol>
      </section>
    </div>
  );
}

/** One section of the campaign: a small label with its count, its actions, its content. */
function Step({
  title,
  meta,
  actions,
  children,
  hideHeading = false,
}: {
  title: string;
  hideHeading?: boolean;
  meta?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li
      id={`campaign-${title.toLowerCase()}`}
      className="scroll-mt-4 space-y-4 rounded-xl border bg-background p-4"
    >
      {!hideHeading && (
        <WorkspaceCardHeader
          title={title}
          icon={
            title === "Platforms"
              ? Radio
              : title === "Results"
                ? ChartNoAxesCombined
                : Users
          }
          count={meta}
          actions={actions}
        />
      )}
      {children}
    </li>
  );
}

/** One figure in the live strip. */
function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
