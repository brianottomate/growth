import Link from "next/link";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { platformAdTable, type PlatformCampaign } from "@/server/db/schema";

import { fmtDate, money, statusStyle } from "./format";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { DeliverySwitch } from "./DeliverySwitch";
import { GoogleSettings } from "./GoogleSettings";
import { PlatformBudget } from "./PlatformBudget";
import { PushToPlatform } from "./PushToPlatform";

/**
 * One platform's row of the plan. A DRAFT row is the pre-push contract: it
 * shows the authoritative budget and the settings the push will send, plus
 * the push button once the plan has ads. A pushed row shows what the platform
 * is actually doing — its numbers and its real ads.
 */
export async function PlatformSection({
  brandSlug,
  campaignId,
  platformCampaign,
  draftAdCount,
  audienceCount,
  brandUrl,
}: {
  brandSlug: string;
  campaignId: string;
  platformCampaign: PlatformCampaign;
  draftAdCount: number;
  audienceCount: number;
  brandUrl: string | null;
}) {
  const platform = platformCampaign.platform;
  const label = platformLabel(platform);
  const isDraft = platformCampaign.status === "draft";
  const google = platformCampaign.settings?.google;

  // ---- draft: the pre-push contract ------------------------------------
  if (isDraft) {
    const googleBlocked = platform === "google_ads" && !google?.campaignType;
    const pushable = platform === "meta_ads" || platform === "google_ads";
    return (
      <div className="bg-card flex flex-wrap items-center gap-2.5 rounded-xl border p-3.5">
        <ChannelLogo platform={platform} className="size-5" />
        <span className="text-sm font-semibold">On {label}</span>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
          planned
        </span>
        <span className="text-muted-foreground text-xs">
          {draftAdCount === 0
            ? "Add ads to the plan, set the budget, then push."
            : googleBlocked
              ? "Pick a campaign type and the push compiles the plan."
              : `Will compile ${audienceCount === 0 ? "1 broad ad set" : `${audienceCount} ad set${audienceCount === 1 ? "" : "s"}`} × ${draftAdCount} ad${draftAdCount === 1 ? "" : "s"}, paused.`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <PlatformBudget
            platformCampaignId={platformCampaign.id}
            budget={platformCampaign.budget}
            budgetType={platformCampaign.budgetType}
          />
          {platform === "google_ads" && (
            <GoogleSettings
              platformCampaignId={platformCampaign.id}
              config={google}
              brandSlug={brandSlug}
              brandUrl={brandUrl}
              compact
            />
          )}
          {pushable && draftAdCount > 0 && !googleBlocked && (
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
          {!pushable && (
            <span className="text-muted-foreground text-xs">
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

      {ads.length > 0 && (
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
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span className="absolute top-1 right-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white capitalize backdrop-blur-sm">
                    {ad.status ?? "live"}
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
      )}
    </div>
  );
}
