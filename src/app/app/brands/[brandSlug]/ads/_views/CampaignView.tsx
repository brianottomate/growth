import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import type { ChannelPlatform } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { getDraftCampaign } from "@/server/services/ads-draft.service";

import { AddAdButton } from "./AddAdButton";
import { AdSets } from "./AdSets";
import { money } from "./format";
import { PlatformSection } from "./PlatformSection";
import { CreativePool } from "./CreativePool";
import { DeleteCampaignButton } from "./DeleteCampaignButton";
import { WorkInChatButton } from "./WorkInChatButton";

/**
 * The campaign: one plan, run on one or more platforms.
 *
 * The page is in two halves, because that is what the model is. Everything
 * picked once — creative, landing page, audience and budget split — sits in
 * the shared half. Below it, one section per platform carries only what that
 * platform did with the plan. Settings that gate a push (Google's campaign
 * type) live in that platform's section rather than beside the creative pool,
 * where they read as another shared choice.
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

  const draft = await getDraftCampaign(org.id, campaignId).catch(() => null);
  if (draft?.brand.slug !== brandSlug) notFound();

  const {
    campaign,
    adSets,
    spots,
    campaigns,
    audienceTargets,
    platformAudiences,
  } = draft;
  // Platforms the plan intends, plus any it already runs on — a campaign
  // pulled from an ad account can be live somewhere nobody planned for.
  const targets = [
    ...new Set([
      ...((campaign.targetChannels ?? []) as ChannelPlatform[]),
      ...campaigns.map((row) => row.platform),
    ]),
  ];
  const byPlatform = new Map(campaigns.map((row) => [row.platform, row]));
  const adsFor = (platformCampaignId: string) =>
    spots.filter((spot) => spot.platformCampaignId === platformCampaignId);
  // `ad_spot.platform` is not null: an ad is drafted FOR a platform, so it
  // belongs in that platform's section rather than a shared bucket.
  const draftedFor = (platform: string) =>
    spots.filter(
      (spot) => !spot.platformCampaignId && spot.platform === platform,
    );
  const totals = campaigns.reduce(
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Link href="/app/brands" className="hover:underline">
            Brands
          </Link>
          <span>/</span>
          <Link href={`/app/brands/${brandSlug}`} className="hover:underline">
            {brandSlug}
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
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
                draft
              </span>
            </div>
            <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              <span>Planned for</span>
              {targets.map((platform) => (
                <span key={platform} className="flex items-center gap-1">
                  <ChannelLogo platform={platform} className="size-4" />
                  {platformLabel(platform)}
                </span>
              ))}
              {campaign.landingUrl && (
                <span className="truncate">· {campaign.landingUrl}</span>
              )}
            </p>
            {campaign.description && (
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
                {campaign.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DeleteCampaignButton
              campaignId={campaign.id}
              campaignName={campaign.name}
              brandSlug={brandSlug}
              livePlatformCampaigns={campaigns.length}
            />
            <WorkInChatButton
              brandId={draft.brand.id}
              brandName={draft.brand.slug ?? brandSlug}
              campaignId={campaign.id}
              campaignName={campaign.name}
              hasAds={spots.length > 0}
            />
            <AddAdButton
              campaignId={campaign.id}
              brandId={draft.brand.id}
              inheritedLinkUrl={campaign.landingUrl}
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Spend"
          value={campaigns.length === 0 ? "—" : money(totals.spend)}
          sub={
            campaign.budget != null ? `of ${money(campaign.budget)}` : undefined
          }
        />
        <Stat
          label="Impressions"
          value={totals.impressions ? totals.impressions.toLocaleString() : "—"}
        />
        <Stat
          label="Clicks"
          value={totals.clicks ? totals.clicks.toLocaleString() : "—"}
        />
        <Stat label="CTR" value={ctr} />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Shared across platforms</h2>
          <p className="text-muted-foreground text-xs">
            Creative, landing page, audience and budget split, picked once
            here and used by every platform below.
          </p>
        </div>

        <CreativePool
          campaignId={campaign.id}
          brandId={draft.brand.id}
          pool={campaign.creativePool ?? []}
        />

        <AdSets
          campaignId={campaign.id}
          brandId={draft.brand.id}
          brandSlug={brandSlug}
          adSets={adSets}
          audienceTargets={audienceTargets}
          platformAudiences={platformAudiences}
          budgetMode={campaign.platformConfig?.meta?.budgetMode ?? "cbo"}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">On each platform</h2>
        {targets.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No platforms chosen yet. Pick them in chat and they show up here.
          </p>
        ) : (
          targets.map((platform) => {
            const platformCampaign = byPlatform.get(platform) ?? null;
            return (
              <PlatformSection
                key={platform}
                platform={platform}
                brandSlug={brandSlug}
                campaignId={campaign.id}
                platformCampaign={platformCampaign}
                ads={platformCampaign ? adsFor(platformCampaign.id) : []}
                draftedAds={draftedFor(platform)}
                adSetCount={adSets.length}
                defaultBudget={campaign.budget}
                googleConfig={campaign.platformConfig?.google}
                brandUrl={campaign.landingUrl ?? draft.brand.website ?? null}
              />
            );
          })
        )}
      </section>
    </div>
  );
}

/** One figure in the campaign's top strip. */
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
    <div className="bg-card rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-muted-foreground text-[11px]">{sub}</p>}
    </div>
  );
}
