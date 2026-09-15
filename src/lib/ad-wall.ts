import type { AdContent } from "@/server/db/ads-schema";

import { adFormatOf, type AdFormat } from "./performance-ads";

// The wall's view of an ad, and where an ad stands. Client-safe: the brand's
// Ads tab and the campaign page both build tiles from this, so the two walls
// cannot drift apart in what they show.

export type WallCard = {
  url: string;
  thumbnail: string | null;
  assetId: string | null;
  type: "image" | "video" | "carousel";
};

export type WallAd = {
  id: string;
  name: string;
  status: "drawn" | "approved";
  format: AdFormat;
  headline: string;
  body: string;
  callToAction: string | null;
  linkUrl: string | null;
  /** The WanderOS listing id of the home this ad is about, when it has a row. */
  homeId: string | null;
  homeName: string | null;
  homeUrl: string | null;
  cards: WallCard[];
};

/** Where an ad stands: on this plan only, on a platform paused, or spending. */
export type AdState = "draft" | "pushed" | "live";

/**
 * One ad row as a tile. Text ads have no cards and are not the wall's
 * business; they return nothing.
 */
export function toWallAd(ad: {
  id: string;
  name: string;
  status: string;
  content: AdContent;
  home?: { name: string; externalId: string; url: string } | null;
}): WallAd | null {
  const content = ad.content;
  if (!("media" in content)) return null;
  const creative = content;
  return {
    id: ad.id,
    name: ad.name,
    // `kept` is a retired middle state; anything not approved is a draft.
    status: ad.status === "approved" ? "approved" : "drawn",
    format: adFormatOf(creative),
    headline: creative.headline,
    body: creative.body,
    callToAction: creative.callToAction ?? null,
    linkUrl: creative.linkUrl ?? null,
    homeId: ad.home?.externalId ?? null,
    homeName: ad.home?.name ?? creative.propertyName ?? null,
    homeUrl: ad.home?.url ?? null,
    cards: creative.media.map((item) => ({
      url: item.url,
      thumbnail: item.thumbnail ?? null,
      assetId: item.assetId ?? null,
      type: item.type,
    })),
  };
}

const FORMAT_ORDER: AdFormat[] = [
  "static",
  "carousel",
  "video",
  "portfolio",
  "catalog",
];

export type HomeGroup = {
  /** The WanderOS listing id, or null for a home known by name alone. */
  homeId: string | null;
  homeName: string;
  homeUrl: string | null;
  ads: WallAd[];
};

/** A stable key for a home group, for anchors and filters. */
export function homeGroupKey(group: Pick<HomeGroup, "homeId" | "homeName">) {
  return (
    group.homeId ?? group.homeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  );
}

/**
 * The wall's order: one group per home in the order the homes first appear,
 * each home's static before its carousel; ads about no home after them; the
 * portfolio and catalog ads last, as the slice that closes the set.
 */
export function groupWall(ads: WallAd[]) {
  const byFormat = (a: WallAd, b: WallAd) =>
    FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format);
  const slices = ads
    .filter((ad) => ad.format === "portfolio" || ad.format === "catalog")
    .sort(byFormat);
  const rest = ads.filter((ad) => !slices.includes(ad));
  const homes: HomeGroup[] = [];
  const other: WallAd[] = [];
  for (const ad of rest) {
    if (!ad.homeId && !ad.homeName) {
      other.push(ad);
      continue;
    }
    const key = ad.homeId ?? ad.homeName;
    let group = homes.find((row) => (row.homeId ?? row.homeName) === key);
    if (!group) {
      group = {
        homeId: ad.homeId,
        homeName: ad.homeName!,
        homeUrl: ad.homeUrl,
        ads: [],
      };
      homes.push(group);
    }
    group.ads.push(ad);
  }
  for (const group of homes) group.ads.sort(byFormat);
  return { homes, other: other.sort(byFormat), slices };
}
