import Link from "next/link";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import type { platformCampaignTable } from "@/server/db/schema";

import { fmtDate, money, statusStyle } from "./format";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { DeliverySwitch } from "./DeliverySwitch";

/**
 * One platform's run of this campaign, summarised where the campaign lives —
 * the ads-side counterpart to content's SpotCard. Delivery, money, the link
 * into Ads Manager and delete are all here, so the common case never leaves
 * the campaign. The name opens the platform campaign's own page, which is
 * where its ads and per-ad numbers live.
 */
export function PlatformCampaignCard({
  campaign,
  brandSlug,
  adCount,
}: {
  campaign: typeof platformCampaignTable.$inferSelect;
  brandSlug: string;
  adCount: number;
}) {
  const stats = campaign.stats ?? {};
  const short = { month: "short", day: "numeric" } as const;
  const window = [
    fmtDate(campaign.startAt, short),
    fmtDate(campaign.endAt, short),
  ]
    .filter(Boolean)
    .join(" – ");
  const figures: { label: string; value: string }[] = [
    { label: "Spend", value: money(stats.spend ?? campaign.spend) },
    ...(campaign.budget != null
      ? [{ label: "Budget", value: money(campaign.budget) }]
      : []),
    ...(stats.impressions != null
      ? [{ label: "Impr.", value: stats.impressions.toLocaleString() }]
      : []),
    ...(stats.clicks != null
      ? [{ label: "Clicks", value: stats.clicks.toLocaleString() }]
      : []),
    ...(stats.ctr != null ? [{ label: "CTR", value: `${stats.ctr}%` }] : []),
    ...(stats.roas != null ? [{ label: "ROAS", value: `${stats.roas}` }] : []),
  ];

  return (
    <div className="bg-card space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <ChannelLogo platform={campaign.platform} className="size-5" />
        <Link
          href={`/app/brands/${brandSlug}/ads/platform/${campaign.id}`}
          className="truncate text-sm font-medium hover:underline"
        >
          {campaign.name}
        </Link>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyle(
            campaign.status,
          )}`}
        >
          {campaign.status}
        </span>
        <span className="text-muted-foreground text-xs">
          {platformLabel(campaign.platform)}
          {window ? ` · ${window}` : ""}
          {adCount > 0 ? ` · ${adCount} ad${adCount === 1 ? "" : "s"}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {campaign.manageUrl && (
            <a
              href={campaign.manageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Open in platform ↗
            </a>
          )}
          <DeletePlatformCampaign
            platformCampaignId={campaign.id}
            campaignName={campaign.name}
            brandSlug={brandSlug}
            isLive={campaign.status === "live"}
            spend={campaign.spend}
          />
          <DeliverySwitch
            platformCampaignId={campaign.id}
            status={campaign.status}
            hasExternalId={Boolean(campaign.externalId)}
            spendLine={
              campaign.budget != null
                ? `${money(campaign.budget)} budget`
                : "no stored budget"
            }
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {figures.map((figure) => (
          <div key={figure.label}>
            <p className="text-muted-foreground text-[11px]">{figure.label}</p>
            <p className="text-sm font-medium tabular-nums">{figure.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
