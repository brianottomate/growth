import Link from "next/link";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { cn } from "@/components/ui/lib/utils";
import {
  deskMoney,
  type DeskBrand,
  type DeskCampaign,
  type DeskCampaignState,
} from "@/server/services/performance-desk.service";

const STATE_LABEL: Record<DeskCampaignState, string> = {
  draft: "Draft",
  pushed: "Pushed, paused",
  live: "Live",
  ended: "Ended",
};
const STATE_STYLE: Record<DeskCampaignState, string> = {
  draft: "bg-muted text-muted-foreground",
  pushed: "bg-sky-500/15 text-sky-300",
  live: "bg-emerald-500/15 text-emerald-300",
  ended: "bg-muted text-muted-foreground",
};

export function StateChip({ state, className }: { state: DeskCampaignState; className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
        STATE_STYLE[state],
        className,
      )}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

export function BrandLogo({ brand, className }: { brand: Pick<DeskBrand, "name" | "logo">; className?: string }) {
  return brand.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logo}
      alt=""
      className={cn("shrink-0 rounded-md border bg-white object-contain p-0.5", className)}
    />
  ) : (
    <span
      className={cn(
        "bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-md text-xs font-semibold",
        className,
      )}
    >
      {brand.name.slice(0, 1)}
    </span>
  );
}

export function brandAdsHref(brand: Pick<DeskBrand, "id" | "slug">) {
  return `/app/brands/${brand.slug ?? brand.id}/ads`;
}
export function campaignHref(brand: Pick<DeskBrand, "id" | "slug">, campaign: Pick<DeskCampaign, "id">) {
  return `/app/brands/${brand.slug ?? brand.id}/ads/${campaign.id}`;
}

/** Spend against budget, in words a client manager reads at a glance. */
export function SpendCell({ campaign }: { campaign: DeskCampaign }) {
  if (campaign.state === "draft") {
    return (
      <span className="text-muted-foreground text-xs">
        {campaign.budget > 0 ? `${deskMoney(campaign.budget)} planned` : "No budget yet"}
      </span>
    );
  }
  return (
    <span className="text-xs tabular-nums">
      <span className="font-medium">{deskMoney(campaign.spend)}</span>
      {campaign.budget > 0 ? (
        <span className="text-muted-foreground"> of {deskMoney(campaign.budget)}</span>
      ) : null}
      {campaign.pace ? (
        <span
          className={cn(
            "ml-1.5",
            campaign.pace === "behind"
              ? "text-amber-300"
              : campaign.pace === "ahead"
                ? "text-sky-300"
                : "text-muted-foreground",
          )}
        >
          {campaign.pace === "on" ? "on pace" : `${campaign.pace} of pace`}
        </span>
      ) : null}
    </span>
  );
}

/** One campaign as a row: state, name, platforms, money, and where it lives. */
export function CampaignRow({
  brand,
  campaign,
  showBrand = false,
}: {
  brand: DeskBrand;
  campaign: DeskCampaign;
  showBrand?: boolean;
}) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 @lg:flex">
      <StateChip state={campaign.state} className="@lg:w-24 @lg:text-center" />
      <div className="min-w-0 @lg:flex-1">
        <Link href={campaignHref(brand, campaign)} className="block truncate text-sm hover:underline">
          {campaign.name}
        </Link>
        {showBrand ? (
          <span className="text-muted-foreground text-[11px]">{brand.name}</span>
        ) : null}
      </div>
      <span className="text-muted-foreground col-span-2 flex items-center gap-1.5 @lg:col-span-1">
        {campaign.platforms.map((row) => (
          <span key={row.id} title={`${platformLabel(row.platform)} · ${row.status}`}>
            <ChannelLogo platform={row.platform} className="size-3.5" />
          </span>
        ))}
        {campaign.platforms.length === 0 ? (
          <span className="text-[11px]">no platform</span>
        ) : null}
        <span className="ml-auto @lg:hidden">
          <SpendCell campaign={campaign} />
        </span>
      </span>
      <span className="hidden w-40 shrink-0 text-right @lg:block">
        <SpendCell campaign={campaign} />
      </span>
    </li>
  );
}
