/**
 * Click-URL parameters for every ad we push to Meta.
 *
 * Ads land on WanderOS direct-booking sites (and wander.com), whose server
 * events carry no marketing attribution, so the click itself must say which
 * campaign it came from. These go on the creative's `url_tags` (Ads Manager
 * → Tracking → URL parameters), not on the link, and use Meta's dynamic
 * macros so the values follow any rename made in Ads Manager.
 * https://docs.zernio.com/platforms/meta-ads/tracking-tags
 */
export const META_URL_TAGS = [
  // One source across placements so Amplitude and GA4 classify it as social.
  { key: "utm_source", value: "facebook" },
  { key: "utm_medium", value: "paid_social" },
  { key: "utm_campaign", value: "{{campaign.name}}" },
  { key: "utm_term", value: "{{adset.name}}" },
  { key: "utm_content", value: "{{ad.name}}" },
] as const;
