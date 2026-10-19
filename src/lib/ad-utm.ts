/**
 * Click-URL parameters for every ad we push to Meta.
 *
 * The campaign ID connects booking attribution to a managed campaign in Growth.
 * These go on the creative's `url_tags` (Ads Manager → Tracking → URL parameters).
 * https://docs.zernio.com/platforms/meta-ads/tracking-tags
 */
export const META_URL_TAGS = [
  // One source across placements so Amplitude and GA4 classify it as social.
  { key: "utm_source", value: "facebook" },
  { key: "utm_medium", value: "paid_social" },
  { key: "utm_id", value: "{{campaign.id}}" },
  { key: "utm_campaign", value: "{{campaign.name}}" },
  { key: "utm_term", value: "{{adset.name}}" },
  { key: "utm_content", value: "{{ad.name}}" },
] as const;

/** Google expands ValueTrack in final URLs, including new campaigns and ad attaches.
 * https://support.google.com/google-ads/answer/6305348
 */
export function tagGoogleAdUrl(linkUrl: string): string {
  const url = new URL(linkUrl);
  url.searchParams.set("utm_source", "google");
  url.searchParams.set("utm_medium", "cpc");
  url.searchParams.set("utm_id", "{campaignid}");
  url.searchParams.set("utm_campaign", "{campaignid}");
  // URLSearchParams encodes ValueTrack macros; preserve all of them for Google.
  return url.toString().replace(/%7B.*?%7D/gi, decodeURIComponent);
}
