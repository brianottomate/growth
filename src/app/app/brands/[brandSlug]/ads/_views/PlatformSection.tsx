import type { PlatformDeliveryGroup } from "@/server/db/schema";
import { GooglePlatformCard } from "./GooglePlatformCard";
import {
  campaignListPath,
  type CampaignWorkspace,
} from "@/lib/campaign-navigation";
import { MetaPlatformCard } from "./MetaPlatformCard";
import type { NewSeedListContext } from "@/app/app/performance/clients/[brandSlug]/NewSeedList";
import type { Ad, DeliveryGeography } from "@/server/db/ads-schema";
import Link from "next/link";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { isPushableAdPlatform } from "@/lib/ad-platforms";
import { db } from "@/server/db";
import { and, eq } from "drizzle-orm";
import { adPlatformSpec } from "@/lib/ad-platforms";
import {
  adAccountTable,
  brandTable,
  platformAdTable,
  type PlatformCampaign,
} from "@/server/db/schema";
import { metaTrackingDefaults } from "@/server/services/meta-tracking-defaults";

import { fmtDate, money, statusStyle } from "./format";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { DeliverySwitch } from "./DeliverySwitch";
import { LinkedInSettings } from "./LinkedInSettings";
import { posterForMedia } from "@/lib/media-url";
import { PlatformBudget } from "./PlatformBudget";
import { PushToPlatform } from "./PushToPlatform";
import { MetaDeliverySummary } from "./MetaDeliverySummary";
import { platformCampaignAdAccount } from "@/lib/platform-campaign-account";
import { PushedMetaGroups } from "./PushedMetaGroups";
import { SeedLookalikeStep } from "./SeedLookalikeStep";
import { PushedSearchGroups } from "./PushedSearchGroups";

/**
 * One platform's row of the plan. A DRAFT row is the pre-push contract: it
 * shows the authoritative budget and the settings the push will send, plus
 * the push button once the plan has ads. A pushed row shows what the platform
 * is actually doing — its numbers and its real ads.
 */
export async function PlatformSection({
  brandSlug,
  workspace = "brand",
  brandName = brandSlug,
  brandLogo = null,
  campaignId,
  platformCampaign,
  draftAdCount,
  unapprovedCount = 0,
  audienceCount,
  brandUrl,
  campaignName,
  campaignStartAt,
  campaignEndAt,
  draftAds,
  audiences,
  seedContext,
}: {
  brandSlug: string;
  workspace?: CampaignWorkspace;
  brandName?: string;
  brandLogo?: string | null;
  campaignId: string;
  platformCampaign: PlatformCampaign & {
    deliveryGroups?: PlatformDeliveryGroup[];
  };
  draftAdCount: number;
  unapprovedCount?: number;
  audienceCount: number;
  brandUrl: string | null;
  campaignName?: string;
  campaignStartAt?: Date | null;
  campaignEndAt?: Date | null;
  draftAds?: Ad[];
  audiences?: {
    id: string;
    name: string;
    metaTargetName?: string;
  }[];
  seedContext?: NewSeedListContext;
}) {
  const deliveryAudiences = (platformCampaign.deliveryGroups ?? []).map(
    (group) => {
      const config = group.configuration;
      const targeting =
        config && "targeting" in config ? config.targeting : undefined;
      const shared = audiences?.find((a) => a.id === group.audienceId);
      return {
        ...group,
        metaTargetName: shared?.metaTargetName,
        geography:
          platformCampaign.platform === "google_ads"
            ? (platformCampaign.settings?.google?.geography ?? null)
            : (targeting?.geography ?? null),
        ageMin: targeting?.ageMin ?? null,
        ageMax: targeting?.ageMax ?? null,
        keywords:
          config?.platform === "google_ads" ? (config.keywords ?? null) : null,
        excludedKeywords:
          config?.platform === "google_ads"
            ? (config.excludedKeywords ?? null)
            : null,
      };
    },
  );
  const platform = platformCampaign.platform;
  const label = platformLabel(platform);
  const isDraft = platformCampaign.status === "draft";
  const linkedin = platformCampaign.settings?.linkedin;

  // ---- draft: the pre-push contract ------------------------------------
  if (isDraft && platform === "meta_ads" && draftAds && audiences) {
    const brand = await db.query.brandTable.findFirst({
      where: eq(brandTable.id, platformCampaign.brandId),
    });
    const pinned = brand?.performanceSettings?.metaAdsDestination;
    const account =
      pinned &&
      (await db.query.adAccountTable.findFirst({
        where: and(
          eq(adAccountTable.brandId, platformCampaign.brandId),
          eq(adAccountTable.externalId, pinned.adAccountId),
          eq(adAccountTable.platform, "facebook"),
          eq(adAccountTable.isAllowed, true),
        ),
      }));
    const destination =
      pinned?.connectionAccountId && account && brand?.metaPageId
        ? {
            ...pinned,
            adAccountName: account.name,
            pageId: brand.metaPageId,
            trackingDefaults: await metaTrackingDefaults(
              brand.id,
              account.externalId,
            ),
          }
        : undefined;
    return (
      <MetaPlatformCard
        destination={destination}
        campaignId={campaignId}
        campaignStartAt={campaignStartAt}
        campaignEndAt={campaignEndAt}
        campaignName={campaignName ?? platformCampaign.name}
        brandSlug={brandSlug}
        brandName={brandName}
        brandLogo={brandLogo}
        platformCampaign={platformCampaign}
        ads={draftAds}
        audiences={deliveryAudiences}
        seedContext={seedContext}
      />
    );
  }
  if (isDraft && platform === "google_ads") {
    return (
      <GooglePlatformCard
        pc={platformCampaign}
        ads={draftAds ?? []}
        audiences={deliveryAudiences}
        campaignId={campaignId}
        campaignName={campaignName ?? platformCampaign.name}
        brandSlug={brandSlug}
        brandName={brandName}
        brandUrl={brandUrl}
        campaignEndAt={campaignEndAt}
      />
    );
  }
  if (isDraft) {
    const pushable = isPushableAdPlatform(platform);
    return (
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3.5">
        <ChannelLogo platform={platform} className="size-5" />
        <span className="text-sm font-semibold">On {label}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          planned
        </span>
        <span className="text-xs text-muted-foreground">
          {draftAdCount === 0
            ? "Add ads to the plan, set the budget, then push."
            : `Will compile ${audienceCount === 0 ? "1 broad ad set" : `${audienceCount} ad set${audienceCount === 1 ? "" : "s"}`} × ${draftAdCount} ad${draftAdCount === 1 ? "" : "s"}, paused.`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DeletePlatformCampaign
            platformCampaignId={platformCampaign.id}
            campaignName={label}
            brandSlug={brandSlug}
            isLive={false}
            spend={platformCampaign.spend}
            hasExternalId={Boolean(platformCampaign.externalId)}
            compact
            afterDelete="refresh"
          />
          <PlatformBudget
            platformCampaignId={platformCampaign.id}
            budget={platformCampaign.budget}
            budgetType={platformCampaign.budgetType}
          />
          {platform === "linkedin_ads" && (
            <LinkedInSettings
              platformCampaignId={platformCampaign.id}
              config={linkedin}
            />
          )}
          {pushable && draftAdCount > 0 && (
            <PushToPlatform
              campaignId={campaignId}
              brandSlug={brandSlug}
              platform={platform}
              draftAdCount={draftAdCount}
              audienceCount={audienceCount}
              budget={platformCampaign.budget}
              budgetType={platformCampaign.budgetType}
            />
          )}
          {unapprovedCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {unapprovedCount} unapproved ad{unapprovedCount === 1 ? "" : "s"}{" "}
              stay out of the push
            </span>
          )}
          {!pushable && (
            <span className="text-xs text-muted-foreground">
              Push not wired for {label} yet
            </span>
          )}
        </div>
      </div>
    );
  }

  // ---- pushed: what the platform is doing --------------------------------
  const ads = await db.query.platformAdTable.findMany({
    where: eq(platformAdTable.platformCampaignId, platformCampaign.id),
  });
  const metaBrand =
    platform === "meta_ads"
      ? await db.query.brandTable.findFirst({
          where: eq(brandTable.id, platformCampaign.brandId),
          columns: { metaPageId: true },
        })
      : null;
  const metaAccountId =
    platformCampaign.settings?.meta?.destination?.adAccountId;
  const metaAccount =
    platform === "meta_ads" && metaAccountId
      ? await db.query.adAccountTable.findFirst({
          where: and(
            eq(adAccountTable.brandId, platformCampaign.brandId),
            eq(adAccountTable.externalId, metaAccountId),
            eq(adAccountTable.platform, "facebook"),
          ),
          columns: { name: true },
        })
      : null;
  const stats = platformCampaign.stats ?? {};
  const running = platformCampaign.status === "live";
  // Each ad opens on its own editor in the platform. The account is the one
  // the push used, or the act= of a synced campaign's link.
  const adAccountId = platformCampaignAdAccount(platformCampaign);
  const adLink = (ad: (typeof ads)[number]) => {
    const build = adPlatformSpec(platform)?.adManageUrl;
    return build &&
      adAccountId &&
      platformCampaign.externalId &&
      ad.externalAdSetId &&
      ad.externalId
      ? build({
          accountId: adAccountId,
          campaignId: platformCampaign.externalId,
          adSetId: ad.externalAdSetId,
          adId: ad.externalId,
        })
      : null;
  };
  const figures = [
    {
      label: "Spend",
      value: money(stats.spend ?? platformCampaign.spend),
    },
    ...(stats.impressions != null
      ? [{ label: "Impressions", value: stats.impressions.toLocaleString() }]
      : []),
    ...(stats.clicks != null
      ? [{ label: "Clicks", value: stats.clicks.toLocaleString() }]
      : []),
    ...(stats.ctr != null ? [{ label: "CTR", value: `${stats.ctr}%` }] : []),
    ...(stats.roas != null ? [{ label: "ROAS", value: `${stats.roas}` }] : []),
  ];
  const window = [
    fmtDate(platformCampaign.startAt, { month: "short", day: "numeric" }),
    fmtDate(platformCampaign.endAt, { month: "short", day: "numeric" }),
  ]
    .filter(Boolean)
    .join(" – ");

  return (
    <div className="@container min-w-0 space-y-5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <ChannelLogo platform={platform} className="size-5" />
        <Link
          href={`${campaignListPath(brandSlug, workspace)}/platform/${platformCampaign.id}`}
          className="text-sm font-semibold hover:underline"
        >
          On {label}
        </Link>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyle(
            platformCampaign.status,
          )}`}
        >
          {platformCampaign.status}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {[
            window,
            ads.length > 0
              ? `${ads.length} ad${ads.length === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {platformCampaign.manageUrl && (
            <a
              href={platformCampaign.manageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Ads Manager ↗
            </a>
          )}
          <DeletePlatformCampaign
            platformCampaignId={platformCampaign.id}
            campaignName={platformCampaign.name}
            brandSlug={brandSlug}
            isLive={running}
            spend={platformCampaign.spend}
            compact
            afterDelete="refresh"
            connectionAccountId={
              platformCampaign.settings?.meta?.destination?.connectionAccountId
            }
          />
          <DeliverySwitch
            platformCampaignId={platformCampaign.id}
            status={platformCampaign.status}
            hasExternalId={Boolean(platformCampaign.externalId)}
            spendLine={
              platformCampaign.budget != null
                ? `${money(platformCampaign.budget)}${platformCampaign.budgetType === "daily" ? "/day" : " lifetime"} budget`
                : "no stored budget"
            }
          />
        </div>
      </div>

      {platform === "meta_ads" && (
        <section className="space-y-4">
          <h4 className="text-sm font-medium">Delivery setup</h4>
          <MetaDeliverySummary
            pc={platformCampaign}
            accountName={metaAccount?.name}
            pageId={metaBrand?.metaPageId}
            campaignStartAt={campaignStartAt}
            campaignEndAt={campaignEndAt}
          />
        </section>
      )}
      {running && (
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {figures.map((figure) => (
            <div key={figure.label}>
              <p className="text-[11px] text-muted-foreground">
                {figure.label}
              </p>
              <p className="text-sm font-medium tabular-nums">{figure.value}</p>
            </div>
          ))}
        </div>
      )}

      {platform === "meta_ads" ? (
        <div className="border-t pt-4">
          <PushedMetaGroups
            groups={platformCampaign.deliveryGroups ?? []}
            ads={ads}
            pc={platformCampaign}
          />
          {/* The seed steps do not depend on the push; a pushed plan uses
              the attached lookalike the next time it is compiled. */}
          {(audiences ?? []).map((audience) => (
            <SeedLookalikeStep
              key={audience.id}
              brandId={platformCampaign.brandId}
              brandName={brandName}
              campaignId={campaignId}
              campaignName={campaignName ?? platformCampaign.name}
              campaignAudienceId={audience.id}
              title={`Seed lookalike · ${audience.name}`}
              seedContext={seedContext}
            />
          ))}
        </div>
      ) : platform === "google_ads" &&
        platformCampaign.settings?.google?.campaignType === "search" ? (
        <PushedSearchGroups
          groups={platformCampaign.deliveryGroups ?? []}
          ads={ads}
        />
      ) : (
        ads.length > 0 && (
          <div className="flex w-full gap-2 overflow-x-auto">
            {ads.map((ad) => {
              const image = posterForMedia(ad.media?.[0]) ?? ad.thumbnailUrl;
              const href = adLink(ad);
              const Tile = href ? "a" : "div";
              return (
                <Tile
                  key={ad.id}
                  {...(href
                    ? {
                        href,
                        target: "_blank",
                        rel: "noreferrer",
                        title: `Open ${ad.name ?? "this ad"} in ${label}`,
                      }
                    : {})}
                  className="w-32 shrink-0 overflow-hidden rounded-lg border bg-background hover:border-foreground/40"
                >
                  <div className="relative h-20 bg-muted">
                    {image && (
                      // oxlint-disable-next-line nextjs/no-img-element
                      <img
                        src={image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                    <span className="absolute top-1 right-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white capitalize backdrop-blur-sm">
                      {platformCampaign.status === "paused"
                        ? "paused"
                        : (ad.status ?? "unknown")}
                    </span>
                  </div>
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-[11px] font-medium">
                      {ad.headline ?? ad.name ?? "Untitled ad"}
                    </p>
                    {ad.stats?.spend != null && (
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {money(ad.stats.spend)}
                        {ad.stats.ctr != null ? ` · ${ad.stats.ctr}% CTR` : ""}
                      </p>
                    )}
                  </div>
                </Tile>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
