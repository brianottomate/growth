import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { getDraftCampaign } from "@/server/services/ads-draft.service";

import { AddAdButton } from "./AddAdButton";
import { Audiences } from "./Audiences";
import { money } from "./format";
import { PlanPlatformButton } from "./PlanPlatformButton";
import { DraftedAds } from "./DraftedAds";
import { PlatformSection } from "./PlatformSection";
import { CreativePool } from "./CreativePool";
import { DeleteCampaignButton } from "./DeleteCampaignButton";
import { WorkInChatButton } from "./WorkInChatButton";

/**
 * The campaign: one plan, compiled onto one or more platforms.
 *
 * Two halves, because that is what the model is. The plan half carries what
 * is shared — creative pool, drafted ads, audiences with their advisory
 * splits. Below it, one section per planned platform holds that platform's
 * authoritative budget and settings while it is a draft, and what the
 * platform is actually doing once pushed.
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

  const { campaign, audiences, ads, platformCampaigns, personas } = draft;

  const planned = [...platformCampaigns].sort((a, b) =>
    a.platform.localeCompare(b.platform),
  );
  const plannedPlatforms = planned.map((row) => row.platform);
  const anyPushed = planned.some((row) => row.externalId);

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
                {anyPushed ? campaign.status : "draft"}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              <span>Planned for</span>
              {plannedPlatforms.length === 0 && <span>no platforms yet</span>}
              {plannedPlatforms.map((platform) => (
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
              livePlatformCampaigns={
                planned.filter((row) => row.externalId).length
              }
            />
            <WorkInChatButton
              brandId={draft.brand.id}
              brandName={draft.brand.slug ?? brandSlug}
              campaignId={campaign.id}
              campaignName={campaign.name}
              hasAds={ads.length > 0}
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
          value={anyPushed ? money(totals.spend) : "—"}
          sub={
            campaign.budget != null
              ? `of ${money(campaign.budget)} planned`
              : undefined
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
          <h2 className="text-base font-semibold">The plan</h2>
          <p className="text-muted-foreground text-xs">
            Creative, ads and audiences, picked once here. Each platform below
            compiles this into its own shape when you push.
          </p>
        </div>

        <CreativePool
          campaignId={campaign.id}
          brandId={draft.brand.id}
          pool={campaign.creativePool ?? []}
        />

        <DraftedAds
          ads={ads}
          brandSlug={brandSlug}
          brandName={draft.brand.name}
          brandLogo={draft.brand.logo}
          landingUrl={campaign.landingUrl}
        />

        <Audiences
          campaignId={campaign.id}
          audiences={audiences}
          personas={personas}
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">On each platform</h2>
          <PlanPlatformButton
            campaignId={campaign.id}
            planned={plannedPlatforms}
          />
        </div>
        {planned.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No platforms planned yet. Planning one creates its local draft —
            budget and settings live there, and nothing reaches the platform
            until you push.
          </p>
        ) : (
          planned.map((platformCampaign) => (
            <PlatformSection
              key={platformCampaign.id}
              brandSlug={brandSlug}
              campaignId={campaign.id}
              platformCampaign={platformCampaign}
              draftAdCount={ads.length}
              audienceCount={audiences.length}
              brandUrl={campaign.landingUrl ?? draft.brand.website ?? null}
            />
          ))
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
