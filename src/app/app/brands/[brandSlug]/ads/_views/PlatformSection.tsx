import Link from "next/link";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import type {
  AdSpot,
  ChannelPlatform,
  platformCampaignTable,
} from "@/server/db/schema";

import { fmtDate, money, statusStyle } from "./format";
import { DeleteAdButton } from "./DeleteAdButton";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { DeliverySwitch } from "./DeliverySwitch";
import { GoogleSettings } from "./GoogleSettings";
import { PushToPlatform } from "./PushToPlatform";

type PlatformCampaign = typeof platformCampaignTable.$inferSelect;

/**
 * One platform's run of the shared plan.
 *
 * The section is state-aware rather than a fixed card: a live run expands to
 * its numbers and its ads, and anything not yet running collapses to a row
 * carrying the reason and the one control that fixes it. That keeps a campaign
 * on two platforms readable when only one of them is doing anything, which
 * columns side by side do not.
 *
 * Ads live here, not in a bucket above. `ad_spot.platform` is not null, so an
 * ad is drafted FOR a platform — showing drafted ads in one shared list said
 * the opposite. Same shape as content, where a platform post is a card under
 * its content post whether it is drafted or published.
 */
export function PlatformSection({
  platform,
  brandSlug,
  campaignId,
  platformCampaign,
  ads,
  draftedAds,
  adSetCount,
  defaultBudget,
  googleConfig,
  brandUrl,
}: {
  platform: ChannelPlatform;
  brandSlug: string;
  campaignId: string;
  platformCampaign: PlatformCampaign | null;
  /** Ads this platform is running. */
  ads: AdSpot[];
  /** Ads drafted for this platform that no push has created yet. */
  draftedAds: AdSpot[];
  adSetCount: number;
  defaultBudget: number | null;
  googleConfig: Parameters<typeof GoogleSettings>[0]["config"];
  brandUrl: string | null;
}) {
  const label = platformLabel(platform);

  // Google cannot be pushed without a campaign type, so that is the blocker to
  // state rather than a settings panel sitting next to the creative pool.
  if (
    !platformCampaign &&
    platform === "google_ads" &&
    !googleConfig?.campaignType
  ) {
    return (
      <Row platform={platform} label={label} tone="warn" state="needs setup">
        <span className="text-muted-foreground text-xs">
          Pick a campaign type and we push the shared plan.
        </span>
        <div className="ml-auto">
          <GoogleSettings
            campaignId={campaignId}
            config={googleConfig}
            brandSlug={brandSlug}
            brandUrl={brandUrl}
            compact
          />
        </div>
        <AdStrip ads={draftedAds} state="drafted" />
      </Row>
    );
  }

  if (!platformCampaign) {
    return (
      <Row platform={platform} label={label} tone="muted" state="not pushed">
        <span className="text-muted-foreground text-xs">
          {draftedAds.length === 0
            ? `Nothing drafted for ${label} yet.`
            : `${draftedAds.length} ad${draftedAds.length === 1 ? "" : "s"} ready to push.`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {platform === "google_ads" && (
            <GoogleSettings
              campaignId={campaignId}
              config={googleConfig}
              brandSlug={brandSlug}
              brandUrl={brandUrl}
              compact
            />
          )}
          {draftedAds.length > 0 && (
            <PushToPlatform
              campaignId={campaignId}
              brandSlug={brandSlug}
              spotCount={draftedAds.length}
              defaultBudget={defaultBudget}
              platform={platform as "meta_ads" | "google_ads"}
              adSetCount={adSetCount}
            />
          )}
        </div>
        <AdStrip ads={draftedAds} state="drafted" />
      </Row>
    );
  }

  const stats = platformCampaign.stats ?? {};
  const running = platformCampaign.status === "live";
  const figures = [
    {
      label: "Spend",
      value:
        platformCampaign.budget != null
          ? `${money(stats.spend ?? platformCampaign.spend)} / ${money(platformCampaign.budget)}`
          : money(stats.spend ?? platformCampaign.spend),
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
    <div className="bg-card space-y-3 rounded-xl border p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <ChannelLogo platform={platform} className="size-5" />
        <Link
          href={`/app/brands/${brandSlug}/ads/platform/${platformCampaign.id}`}
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
        <span className="text-muted-foreground truncate text-xs">
          {[
            window,
            adSetCount > 0
              ? `${adSetCount} ad set${adSetCount === 1 ? "" : "s"}`
              : null,
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
              className="text-muted-foreground hover:text-foreground text-xs"
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
          />
          <DeliverySwitch
            platformCampaignId={platformCampaign.id}
            status={platformCampaign.status}
            hasExternalId={Boolean(platformCampaign.externalId)}
            spendLine={
              platformCampaign.budget != null
                ? `${money(platformCampaign.budget)} budget`
                : "no stored budget"
            }
          />
        </div>
      </div>

      {/* A run that is not delivering has nothing to report; the row above
          already carries its status and the control to change it. */}
      {running && (
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {figures.map((figure) => (
            <div key={figure.label}>
              <p className="text-muted-foreground text-[11px]">
                {figure.label}
              </p>
              <p className="text-sm font-medium tabular-nums">{figure.value}</p>
            </div>
          ))}
        </div>
      )}

      <AdStrip ads={ads} state="live" />
      <AdStrip ads={draftedAds} state="drafted" />
    </div>
  );
}

/**
 * The ads themselves. `state` is what the ad is doing relative to this
 * platform, which is not the same as the raw platform status on the badge.
 */
function AdStrip({ ads, state }: { ads: AdSpot[]; state: "live" | "drafted" }) {
  if (ads.length === 0) return null;
  return (
    <div className="flex w-full gap-2 overflow-x-auto">
      {ads.map((ad) => {
        const image =
          ad.media?.[0]?.thumbnail ?? ad.media?.[0]?.url ?? ad.thumbnailUrl;
        return (
          <div
            key={ad.id}
            className="bg-background w-32 shrink-0 overflow-hidden rounded-lg border"
          >
            <div className="bg-muted relative h-20">
              {/* Only a draft can be withdrawn here; a live ad is deleted on
                  the platform, or by deleting the run. */}
              {state === "drafted" && <DeleteAdButton adSpotId={ad.id} />}
              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              <span className="absolute top-1 right-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white capitalize backdrop-blur-sm">
                {state === "drafted" ? "drafted" : (ad.status ?? "live")}
              </span>
            </div>
            <div className="space-y-0.5 p-2">
              <p className="truncate text-[11px] font-medium">
                {ad.headline ?? ad.name ?? "Untitled ad"}
              </p>
              {ad.stats?.spend != null && (
                <p className="text-muted-foreground text-[10px] tabular-nums">
                  {money(ad.stats.spend)}
                  {ad.stats.ctr != null ? ` · ${ad.stats.ctr}% CTR` : ""}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The collapsed form: one line, its reason, and the control that resolves it. */
function Row({
  platform,
  label,
  state,
  tone,
  children,
}: {
  platform: ChannelPlatform;
  label: string;
  state: string;
  tone: "warn" | "muted";
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card flex flex-wrap items-center gap-2.5 rounded-xl border p-3.5">
      <ChannelLogo platform={platform} className="size-5" />
      <span className="text-sm font-semibold">On {label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
          tone === "warn"
            ? "bg-amber-500/15 text-amber-300"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {state}
      </span>
      {children}
    </div>
  );
}
