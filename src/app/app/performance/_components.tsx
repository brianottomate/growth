import Link from "next/link";
import type { ReactNode } from "react";

import { DeleteCampaignButton } from "@/app/app/brands/[brandSlug]/ads/_views/DeleteCampaignButton";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { cn } from "@/components/ui/lib/utils";
import {
  deskMoney,
  type DeskBrand,
  type DeskCampaign,
  type DeskCampaignState,
} from "@/server/services/performance-desk.service";

/** Small uppercase label above a group, the way the section names its parts. */
export function SectionLabel({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "amber";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[10.5px] font-semibold tracking-[0.09em] uppercase",
        tone === "amber" ? "text-amber-300" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** The panel every list sits in. */
export const panel = "bg-card overflow-hidden rounded-2xl border";
/** A tile inside a panel. */
export const tile = "bg-muted/40 rounded-xl border px-3 py-2.5";
/** Pill buttons, the section's button shape. */
export const pill = "rounded-full";

const STATE_LABEL: Record<DeskCampaignState, string> = {
  draft: "draft",
  pushed: "paused",
  live: "live",
  ended: "ended",
};
const DOT: Record<DeskCampaignState, string> = {
  live: "bg-emerald-400",
  pushed: "bg-amber-400",
  draft: "bg-white/25",
  ended: "bg-white/15",
};

/** A coloured dot for a campaign state: green live, amber paused, grey draft. */
export function StateDot({ state, className }: { state: DeskCampaignState; className?: string }) {
  return (
    <span
      aria-label={STATE_LABEL[state]}
      className={cn("inline-block size-[7px] shrink-0 rounded-full", DOT[state], className)}
    />
  );
}

/** A bordered pill naming the state, for lists that mix states. */
export function StateChip({ state, className }: { state: DeskCampaignState; className?: string }) {
  return (
    <span
      className={cn(
        "border-border/80 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
        state === "live" ? "text-emerald-300" : state === "pushed" ? "text-amber-300" : "text-muted-foreground",
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
      className={cn("shrink-0 rounded-[10px] border bg-white object-contain p-0.5", className)}
    />
  ) : (
    <span
      className={cn(
        "bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-[10px] border text-xs font-semibold",
        className,
      )}
    >
      {initials(brand.name)}
    </span>
  );
}

function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)).toUpperCase();
}

export function brandAdsHref(brand: Pick<DeskBrand, "id" | "slug">) {
  return `/app/brands/${brand.slug ?? brand.id}/ads`;
}
export function campaignHref(brand: Pick<DeskBrand, "id" | "slug">, campaign: Pick<DeskCampaign, "id">) {
  return `/app/brands/${brand.slug ?? brand.id}/ads/${campaign.id}`;
}

/** Spend against budget: the figure bold, its qualifier muted. */
export function SpendCell({ campaign }: { campaign: DeskCampaign }) {
  if (campaign.state === "draft") {
    return (
      <span className="text-xs tabular-nums">
        {campaign.budget > 0 ? (
          <>
            <span className="font-semibold">{deskMoney(campaign.budget)}</span>
            <span className="text-muted-foreground"> planned</span>
          </>
        ) : (
          <span className="text-muted-foreground">no budget</span>
        )}
      </span>
    );
  }
  return (
    <span className="text-xs tabular-nums">
      <span className="font-semibold">{deskMoney(campaign.spend)}</span>
      <span className="text-muted-foreground">
        {campaign.budget > 0 ? ` of ${deskMoney(campaign.budget)}` : " no cap"}
      </span>
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

/** One campaign as a row: dot, name over its client, platforms, money. */
export function CampaignRow({
  brand,
  campaign,
  showBrand = false,
  deletable = false,
}: {
  brand: DeskBrand;
  campaign: DeskCampaign;
  showBrand?: boolean;
  /** Offer the confirmed delete on drafts (rows on a platform refuse it). */
  deletable?: boolean;
}) {
  const client =
    campaign.accountName && brand.relationship === "internal"
      ? `${campaign.accountName} · run from ${brand.name}`
      : brand.name;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-4 py-3 @lg:flex">
      <StateDot state={campaign.state} />
      <div className="min-w-0 @lg:flex-1">
        <Link
          href={campaignHref(brand, campaign)}
          className="block truncate text-[13px] font-semibold hover:underline"
        >
          {campaign.name}
        </Link>
        {showBrand ? (
          <span className="text-muted-foreground block truncate text-[11px]">{client}</span>
        ) : null}
      </div>
      <span className="text-muted-foreground col-span-2 flex items-center gap-1.5 @lg:col-span-1">
        {campaign.platforms.map((row) => (
          <span key={row.id} title={`${platformLabel(row.platform)} · ${row.status}`}>
            <ChannelLogo platform={row.platform} className="size-3.5" />
          </span>
        ))}
        {campaign.platforms.length === 0 ? <span className="text-[11px]">no platform</span> : null}
        <span className="ml-auto @lg:hidden">
          <SpendCell campaign={campaign} />
        </span>
      </span>
      <span className="hidden w-36 shrink-0 text-right @lg:block">
        <SpendCell campaign={campaign} />
      </span>
      {deletable && campaign.state === "draft" ? (
        <span className="col-start-2 justify-self-end @lg:col-auto">
          <DeleteCampaignButton
            campaignId={campaign.id}
            campaignName={campaign.name}
            brandSlug={brand.slug ?? brand.id}
            livePlatformCampaigns={campaign.platforms.filter((row) => row.status !== "draft").length}
            compact
            afterDelete="refresh"
          />
        </span>
      ) : null}
    </li>
  );
}
