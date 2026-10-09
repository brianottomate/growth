import { ClientPreviewLink } from "./clients/[brandSlug]/ads/ClientPreviewLink";
import {
  CampaignPlatforms,
  CampaignListRow,
  CampaignThumbnailStrip,
} from "@/components/campaigns/campaign-summary";
import type { ReactNode } from "react";

import { DeleteCampaignButton } from "@/app/app/brands/[brandSlug]/ads/_views/DeleteCampaignButton";
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

export function CampaignRow({
  brand,
  campaign,
  showBrand = false,
  deletable = false,
  card = false,
}: {
  brand: DeskBrand;
  campaign: DeskCampaign;
  showBrand?: boolean;
  /** Offer the confirmed delete on drafts (rows on a platform refuse it). */
  deletable?: boolean;
  card?: boolean;
}) {
  const client =
    campaign.accountName && brand.relationship === "internal"
      ? `${campaign.accountName} · run from ${brand.name}`
      : brand.name;
  const livePlatformIds = campaign.platforms
    .filter((row) => row.status !== "draft")
    .map((row) => row.id);
  return (
    <li className={cn("min-w-0", card && "rounded-xl border bg-card")}>
      <CampaignListRow
        name={campaign.name}
        href={campaignHref(brand, campaign)}
        status={<StateChip state={campaign.state} />}
        detail={[
          showBrand ? client : null,
          `Created ${createdOn(campaign.createdAt)}`,
          campaign.adCount
            ? `${campaign.adCount} ad${campaign.adCount === 1 ? "" : "s"}${campaign.approvedCount ? ` · ${campaign.approvedCount} approved` : ""}`
            : "No ads yet",
        ]
          .filter(Boolean)
          .join(" · ")}
        thumbnails={
          <CampaignThumbnailStrip
            urls={campaign.thumbs}
            total={campaign.adCount}
            href={campaignHref(brand, campaign)}
          />
        }
        platforms={<CampaignPlatforms platforms={campaign.platforms} />}
        spend={<SpendCell campaign={campaign} />}
        actions={
          <>
            <ClientPreviewLink
              brandId={brand.id}
              campaign={{ id: campaign.id, name: campaign.name }}
            />
            {deletable && (
              <DeleteCampaignButton
                campaignId={campaign.id}
                campaignName={campaign.name}
                brandSlug={brand.slug ?? brand.id}
                livePlatformCampaigns={livePlatformIds.length}
                platformCampaignIds={livePlatformIds}
                compact
                afterDelete="refresh"
              />
            )}
          </>
        }
      />
    </li>
  );
}
