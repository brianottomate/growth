import { adRoutesTo } from "./ad-platforms";
import type { ChannelPlatform } from "@/server/db/channel-schema";
import type { Ad, PlatformCampaignSettings } from "@/server/db/ads-schema";

/** Shared by review and publishing: selections never override format or platform routing. */
export function eligiblePlatformAds(
  ads: Ad[],
  platform: ChannelPlatform,
  settings: PlatformCampaignSettings,
) {
  return ads.filter((ad) => {
    if (!adRoutesTo(ad.platforms, platform)) return false;
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
    return true;
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
