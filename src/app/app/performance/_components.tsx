import Link from "next/link";
import type { ReactNode } from "react";

import { DeleteCampaignButton } from "@/app/app/brands/[brandSlug]/ads/_views/DeleteCampaignButton";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { cn } from "@/components/ui/lib/utils";
import { deskMoney } from "@/lib/performance-desk";
import type {
  DeskBrand,
  DeskCampaign,
  DeskCampaignState,
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

const STATE_WORD: Record<DeskCampaignState, string> = {
  draft: "Draft",
  pushed: "Pushed, paused",
  live: "Live",
  ended: "Ended",
};

/** A small pill naming a campaign's state: green live, amber paused, grey otherwise. */
export function StateChip({
  state,
  className,
}: {
  state: DeskCampaignState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border border-border/80 px-2 text-[10.5px] font-medium whitespace-nowrap",
        state === "live"
          ? "text-[var(--color-success)]"
          : state === "pushed"
            ? "text-[var(--color-warning)]"
            : "text-muted-foreground",
        className,
      )}
    >
      {STATE_WORD[state]}
    </span>
  );
}

export function BrandLogo({
  brand,
  className,
}: {
  brand: Pick<DeskBrand, "name" | "logo">;
  className?: string;
}) {
  return brand.logo ? (
    // oxlint-disable-next-line nextjs/no-img-element
    <img
      src={brand.logo}
      alt=""
      className={cn(
        "shrink-0 rounded-[10px] border bg-white object-contain p-0.5",
        className,
      )}
    />
  ) : (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[10px] border bg-muted text-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      {initials(brand.name)}
    </span>
  );
}

function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return (
    words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)
  ).toUpperCase();
}

export function brandAdsHref(brand: Pick<DeskBrand, "id" | "slug">) {
  return `/app/performance/clients/${brand.slug ?? brand.id}/campaigns`;
}
export function campaignHref(
  brand: Pick<DeskBrand, "id" | "slug">,
  campaign: Pick<DeskCampaign, "id">,
) {
  return `/app/performance/clients/${brand.slug ?? brand.id}/campaigns/${campaign.id}`;
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

/** One campaign as a row: name and state over its client, platforms, money. */
/** "Sep 21", with the year only when it is not this one. */
function createdOn(date: Date) {
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * A composition preview renders on request; its source photo is the cheap
 * stand-in at thumbnail size.
 */
function thumbSrc(url: string) {
  if (!url.includes("/api/compositions/preview")) return url;
  const query = url.slice(url.indexOf("?") + 1);
  return new URLSearchParams(query).get("sourceUrl") ?? url;
}

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
  const livePlatformIds = campaign.platforms
    .filter((row) => row.status !== "draft")
    .map((row) => row.id);
  return (
    <li className="grid grid-cols-1 items-center gap-x-3 gap-y-1.5 px-4 py-3 @lg:flex">
      <div className="min-w-0 @lg:flex-1">
        <span className="flex items-center gap-2">
          <Link
            href={campaignHref(brand, campaign)}
            title={campaign.name}
            className="min-w-0 text-[13px] font-semibold [overflow-wrap:anywhere] hover:underline @lg:truncate"
          >
            {campaign.name}
          </Link>
          <StateChip state={campaign.state} />
        </span>
        <span className="block text-[11px] text-muted-foreground @lg:truncate">
          {[
            showBrand ? client : null,
            `Created ${createdOn(campaign.createdAt)}`,
            campaign.adCount
              ? `${campaign.adCount} ad${campaign.adCount === 1 ? "" : "s"}${campaign.approvedCount ? ` · ${campaign.approvedCount} approved` : ""}`
              : "no ads",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <span className="hidden w-40 shrink-0 justify-end gap-1 @3xl:flex">
        {[...new Set(campaign.thumbs.map(thumbSrc))].slice(0, 4).map((src) => (
          // oxlint-disable-next-line nextjs/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            className="size-9 rounded-md bg-muted object-cover"
          />
        ))}
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground @lg:w-20 @lg:shrink-0">
        {campaign.platforms.map((row) => (
          <span
            key={row.id}
            title={`${platformLabel(row.platform)} · ${row.status}`}
          >
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
      <span className="hidden w-36 shrink-0 text-right @lg:block">
        <SpendCell campaign={campaign} />
      </span>
      {deletable ? (
        <span className="justify-self-end @lg:w-8 @lg:shrink-0">
          <DeleteCampaignButton
            campaignId={campaign.id}
            campaignName={campaign.name}
            brandSlug={brand.slug ?? brand.id}
            livePlatformCampaigns={livePlatformIds.length}
            platformCampaignIds={livePlatformIds}
            compact
            afterDelete="refresh"
          />
        </span>
      ) : null}
    </li>
  );
}
