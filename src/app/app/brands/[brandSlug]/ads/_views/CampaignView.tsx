import { WorkspaceBreadcrumbs } from "@/components/workspace-breadcrumbs";
import {
  campaignListPath,
  campaignPath,
  type CampaignWorkspace,
} from "@/lib/campaign-navigation";
import { workspaceActor } from "@/server/workspace-actor";
import { starterGenerationStatus } from "@/server/services/starter-ad-generation.service";
import { listBrandHomes } from "@/server/services/homes.service";
import { isImportedMetaCatalog } from "@/lib/meta-import";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { Radio } from "lucide-react";

import { db } from "@/server/db";
import { platformAdTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { campaignPrefillFromIntake } from "@/server/services/performance-intake.service";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/lib/utils";
import { getDraftCampaign } from "@/server/services/ads-draft.service";
import { brandListings } from "@/server/services/wanderos-listings.service";
import { toWallAd, type AdState, type WallAd } from "@/lib/ad-wall";
import { targetedAsset } from "@/lib/audience-asset";
import { AddAdDialog } from "@/app/app/performance/brands/[brandSlug]/ads/AddAdDialog";
import { AdIdeasList } from "./AdIdeasList";
import { AdTile } from "./AdWall";
import { CampaignAssetsDrawer } from "./CampaignAssetsDrawer";
import type { PickableHome } from "@/app/app/performance/brands/[brandSlug]/HomePicker";

import { AskAssistantButton } from "./AskAssistantButton";
import { Audiences } from "./Audiences";
import { CreativePool } from "./CreativePool";
import { DeleteCampaignButton } from "./DeleteCampaignButton";
import { AddStarterIdeasButton } from "./AddStarterIdeasButton";
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

  const {
    campaign,
    audiences,
    ads,
    platformCampaigns,
    personas,
    platformAudiences,
  } = draft;
  const metaTargets = Object.fromEntries(
    audiences.flatMap((row) => {
      const hit = targetedAsset(row, platformAudiences, "meta_ads");
      return hit ? [[row.id, { name: hit.asset.name, via: hit.via }]] : [];
    }),
  );
  const brand = draft.brand;
  const brandName = brand.name;

  // Where this client's homes are, offered to the audience form as a starting
  // point. Only a paying client has an intake behind them; for Wander's own
  // brands this would be a query that can only answer "nothing".
  const prefill =
    brand.relationship === "client"
      ? await campaignPrefillFromIntake(
          { orgId: org.id },
          { brandId: brand.id },
        ).catch(() => null)
      : null;

  // Their homes, for binding an ad to one. Empty for a brand whose WanderOS
  // site is not connected, in which case a home is a name typed on the tile.
  const generation = await starterGenerationStatus({
    organizationId: org.id,
    campaignId,
  });
  const orderedHomes = await listBrandHomes(brand.id);
  const listings = await brandListings({
    id: brand.id,
    website: brand.website,
  });
  const homes: PickableHome[] = listings
    .filter((home) => home.imageUrl)
    .map((home) => ({
      id: home.id,
      name: home.name,
      imageUrl: home.imageUrl!,
      thumbUrl: home.thumbUrl ?? null,
      bedrooms: home.bedrooms ?? null,
      guests: home.guests ?? null,
      nightlyFrom: home.nightlyFrom ?? null,
    }));
  // The page reads newest first; the wall reads in the order the ads were
  // made, so the first home asked for is the first home shown.
  const wall: WallAd[] = [...ads]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .flatMap((ad) => {
      const row = toWallAd(ad);
      return row ? [row] : [];
    });

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

  const pool = campaign.creativePool ?? [];
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
  return (
    <div className="space-y-8">
      <header className="space-y-3">
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {campaign.name}
              </h1>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  anyLive
                    ? "bg-emerald-500/15 text-emerald-300"
                    : anyPushed
                      ? "bg-sky-500/15 text-sky-300"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {anyLive ? "live" : anyPushed ? "pushed, paused" : "draft"}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {plannedPlatforms.length === 0 ? (
                <span>No platform planned yet</span>
              ) : (
                plannedPlatforms.map((platform) => (
                  <span key={platform} className="flex items-center gap-1">
                    <ChannelLogo platform={platform} className="size-4" />
                    {platformLabel(platform)}
                  </span>
                ))
              )}
              {campaign.budget != null ? (
                <span>· {money(campaign.budget)} planned</span>
              ) : null}
              {campaign.landingUrl ? (
                <span className="truncate">· {campaign.landingUrl}</span>
              ) : null}
            </p>
            {campaign.description ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {campaign.description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <DeleteCampaignButton
              listPath={campaignListPath(brandSlug, workspace)}
              campaignId={campaign.id}
              campaignName={campaign.name}
              brandSlug={brandSlug}
              livePlatformCampaigns={pushed.length}
            />
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <AddStarterIdeasButton campaignId={campaign.id} />
          <AddAdDialog
            brandId={brand.id}
            homes={homes}
            campaignId={campaign.id}
          />
          <CampaignAssetsDrawer count={pool.length} brandId={brand.id}>
            <CreativePool
              campaignId={campaign.id}
              brandId={brand.id}
              pool={pool}
              askAssistant={ask(
                "photos",
                `Fill the photo pool for “${campaign.name}”`,
              )}
            />
          </CampaignAssetsDrawer>
        </div>
        <AdIdeasList
          preparingHero={
            generation?.source === "featured" &&
            ["queued", "processing"].includes(generation.status)
          }
          homeOrder={orderedHomes.map((home) => home.id)}
          campaignId={campaign.id}
          ads={ads}
          brandId={brand.id}
          brandName={brandName}
          brandLogo={brand.logo}
          states={states}
          fallback={(id) => (
            <ul>
              <AdTile
                brandId={brand.id}
                brandSlug={brandSlug}
                brandName={brandName}
                brandLogo={brand.logo}
                landingUrl={campaign.landingUrl}
                homes={homes}
                ad={wall.find((ad) => ad.id === id)!}
                states={states}
                surface="instagram"
                allowHomeBinding={false}
              />
            </ul>
          )}
        />
      </section>
      <section className="space-y-4 border-t pt-6">
        <h2 className="font-semibold">Delivery</h2>
        <p className="text-sm text-muted-foreground">
          {
            editableAds.filter(
              (ad) =>
                ad.status === "approved" &&
                (!("media" in ad.content) ||
                  !ad.content.ideaStudio ||
                  ad.content.ideaStudio.approval),
            ).length
          }{" "}
          of {editableAds.length} creative ads approved. Approve every creative
          before pushing. Approval does not publish or start spending.
        </p>
        <ol className="space-y-8">
          <Step
            title="Audiences"
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
              personas={personas}
              metaTargets={metaTargets}
              geoPrefill={prefill?.geography ?? null}
              emptyActions={ask(
                "audiences",
                `Create the audience for “${campaign.name}”`,
              )}
            />
          </Step>

          <Step
            title="Platforms"
            meta={
              planned.length > 0
                ? planned.map((row) => platformLabel(row.platform)).join(", ")
                : undefined
            }
            actions={
              planned.length > 0 ? (
                <PlanPlatformButton
                  brandId={brand.id}
                  brandName={brandName}
                  campaignId={campaign.id}
                  campaignName={campaign.name}
                  planned={plannedPlatforms}
                />
              ) : null
            }
          >
            {planned.length === 0 ? (
              <EmptyState
                compact
                icon={Radio}
                title="No platform yet"
                description="Plan one to set its budget. Nothing reaches the platform until you push."
                actions={
                  <PlanPlatformButton
                    brandId={brand.id}
                    brandName={brandName}
                    campaignId={campaign.id}
                    campaignName={campaign.name}
                    planned={plannedPlatforms}
                  />
                }
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
                    draftAds={ads}
                    audiences={audiences}
                    draftAdCount={ads.length}
                    unapprovedCount={
                      editableAds.filter(
                        (ad) =>
                          ad.status !== "approved" ||
                          ("media" in ad.content &&
                            ad.content.ideaStudio &&
                            !ad.content.ideaStudio.approval),
                      ).length
                    }
                    audienceCount={audiences.length}
                    brandUrl={campaign.landingUrl ?? brand.website ?? null}
                  />
                ))}
              </div>
            )}
          </Step>

          {anyPushed ? (
            <Step
              title="Live"
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
}: {
  title: string;
  meta?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
          {title}
          {meta ? (
            <span className="ml-1.5 font-medium tracking-normal normal-case">
              · {meta}
            </span>
          ) : null}
        </p>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
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
