import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { Radio } from "lucide-react";

import { db } from "@/server/db";
import { memberTable, platformAdTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { campaignPrefillFromIntake } from "@/server/services/performance-intake.service";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/lib/utils";
import { getDraftCampaign } from "@/server/services/ads-draft.service";
import { brandListings } from "@/server/services/wanderos-listings.service";
import { toWallAd, type AdState, type WallAd } from "@/lib/ad-wall";
import { AddAdDialog } from "@/app/app/performance/brands/[brandSlug]/ads/AddAdDialog";
import { AdWall } from "@/app/app/performance/brands/[brandSlug]/ads/AdWall";
import { CreativeDrop } from "@/app/app/performance/brands/[brandSlug]/ads/CreativeDrop";
import type { PickableHome } from "@/app/app/performance/brands/[brandSlug]/HomePicker";

import { AskAssistantButton } from "./AskAssistantButton";
import { Audiences } from "./Audiences";
import { CreativePool } from "./CreativePool";
import { DeleteCampaignButton } from "./DeleteCampaignButton";
import { DraftFromHomesButton } from "./DraftFromHomesButton";
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
}: {
  brandSlug: string;
  campaignId: string;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  // A read that fails is logged before it becomes a 404, so a broken query
  // never masquerades as a missing campaign.
  const draft = await getDraftCampaign(org.id, campaignId).catch(
    (error: unknown) => {
      console.error("campaign page could not load", campaignId, error);
      return null;
    },
  );
  if (draft?.brand.slug !== brandSlug) notFound();

  const { campaign, audiences, ads, platformCampaigns, personas } = draft;
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
  const homesRun = campaign.homesRun ?? null;
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

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/app/brands" className="hover:underline">
            Brands
          </Link>
          <span>/</span>
          <Link href={`/app/brands/${brandSlug}`} className="hover:underline">
            {brandName}
          </Link>
          <span>/</span>
          <Link
            href={`/app/brands/${brandSlug}/ads`}
            className="hover:underline"
          >
            Ads
          </Link>
        </div>
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

      <ol className="space-y-8">
        <Step
          title="Ads"
          meta={
            ads.length > 0
              ? [
                  `${ads.length} ad${ads.length === 1 ? "" : "s"}`,
                  Object.values(states).length > 0
                    ? `${Object.values(states).length} on a platform`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
          actions={
            <>
              <DraftFromHomesButton
                campaignId={campaign.id}
                brandId={brand.id}
                lastRun={homesRun}
                label={homesRun ? "Homes run" : "From their homes"}
              />
              <AddAdDialog
                brandId={brand.id}
                homes={homes}
                campaignId={campaign.id}
              />
              {ads.length > 0 ? (
                <Link
                  href={`/app/brands/${brandSlug}/ads/${campaign.id}/by-home`}
                  className="px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  By home
                </Link>
              ) : null}
              {ads.length > 0
                ? ask("ads", `Review the ads for “${campaign.name}”`)
                : null}
            </>
          }
        >
          <div className="space-y-4">
            {wall.length === 0 ? (
              <EmptyState
                compact
                icon={Radio}
                title="No ads yet"
                description="Draft them from their homes, add shells to fill, or drop finished creatives."
                actions={
                  <>
                    <DraftFromHomesButton
                      campaignId={campaign.id}
                      brandId={brand.id}
                      lastRun={homesRun}
                      variant="default"
                    />
                    {ask("ads", `Draft the ads for “${campaign.name}”`)}
                  </>
                }
              />
            ) : (
              <AdWall
                brandId={brand.id}
                brandSlug={brandSlug}
                brandName={brandName}
                brandLogo={brand.logo}
                landingUrl={campaign.landingUrl}
                homes={homes}
                ads={wall}
                states={states}
                title="Ads"
              />
            )}
            {anyPushed ? null : (
              <CreativeDrop
                brandId={brand.id}
                homes={homes}
                campaignId={campaign.id}
              />
            )}
          </div>
        </Step>

        <Step
          title="Sources"
          meta={
            pool.length > 0
              ? `${pool.length} photos the ads can draw from`
              : "optional"
          }
        >
          <CreativePool
            campaignId={campaign.id}
            brandId={brand.id}
            pool={pool}
            askAssistant={ask("photos", `Find photos for “${campaign.name}”`)}
          />
        </Step>

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
            audiences={audiences}
            personas={personas}
            geoPrefill={prefill?.geography ?? null}
            emptyActions={ask(
              "audiences",
              `Suggest audiences for “${campaign.name}”`,
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
                campaignId={campaign.id}
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
                <>
                  <PlanPlatformButton
                    campaignId={campaign.id}
                    planned={plannedPlatforms}
                  />
                  {ask(
                    "platforms",
                    `Plan the platforms for “${campaign.name}”`,
                  )}
                </>
              }
            />
          ) : (
            <div className="space-y-2">
              {planned.map((platformCampaign) => (
                <PlatformSection
                  key={platformCampaign.id}
                  brandSlug={brandSlug}
                  campaignId={campaign.id}
                  platformCampaign={platformCampaign}
                  draftAdCount={ads.length}
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
                  totals.impressions ? totals.impressions.toLocaleString() : "—"
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
