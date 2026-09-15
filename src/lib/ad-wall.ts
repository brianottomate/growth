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
