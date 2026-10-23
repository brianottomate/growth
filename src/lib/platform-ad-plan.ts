import { adRoutesTo } from "./ad-platforms";
import type { ChannelPlatform } from "@/server/db/channel-schema";
import type { Ad, PlatformCampaignSettings } from "@/server/db/ads-schema";

/** Format compatibility independent of an ad's saved platform selection. */
export function adSupportsPlatform(
  ad: Pick<Ad, "type" | "content">,
  platform: ChannelPlatform,
  settings: PlatformCampaignSettings,
) {
  if (platform === "google_ads") {
    if (!settings.google?.campaignType) return false;
    if (settings.google.campaignType === "search") return ad.type === "text";
    return (
      ad.type === "creative" &&
      !("media" in ad.content && ad.content.media[0]?.type === "video")
    );
  }
  if (platform === "meta_ads" || platform === "linkedin_ads")
    return ad.type === "creative";
  // A chat card is one static image; video and carousels have no shape here.
  if (platform === "openai_ads")
    return (
      ad.type === "creative" &&
      "media" in ad.content &&
      ad.content.media.length === 1 &&
      ad.content.media[0]?.type === "image"
    );
  return true;
}

/** Shared by review and publishing: selections never override format or platform routing. */
export function eligiblePlatformAds(
  ads: Ad[],
  platform: ChannelPlatform,
  settings: PlatformCampaignSettings,
) {
  return ads.filter((ad) => {
    if (!adRoutesTo(ad.platforms, platform)) return false;
    return adSupportsPlatform(ad, platform, settings);
  });
}

export function selectPlatformAds(
  ads: Ad[],
  platform: ChannelPlatform,
  settings: PlatformCampaignSettings,
) {
  const selected =
    settings.selectedAdIds === undefined
      ? null
      : new Set(settings.selectedAdIds);
  return eligiblePlatformAds(ads, platform, settings).filter(
    (ad) => !selected || selected.has(ad.id),
  );
}

/** Platform statuses after which an ad no longer exists on the platform. */
const GONE_ON_PLATFORM = ["deleted", "removed", "cancelled", "canceled"];

export function adGoneOnPlatform(status: string | null | undefined) {
  return GONE_ON_PLATFORM.includes((status ?? "").toLowerCase());
}
