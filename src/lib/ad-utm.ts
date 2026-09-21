/**
 * UTM tagging for paid-ad destination URLs.
 *
 * Ads we push to Meta land on WanderOS direct-booking sites (and wander.com).
 * Those clicks must carry campaign identity or the booking is attributed to
 * "direct": the WanderOS lane drops marketing attribution across the
 * client→server boundary, and Meta's own custom conversions/pixel are scoped
 * by URL — both need the utm on the landing link. So we tag the destination at
 * push time rather than trusting each creative to be hand-tagged.
 *
 * Same convention as [[tracked-link]]: append only, never clobber a param an
 * operator already put on the URL, and no-op on a missing/relative link.
 *
 * Pure + client-safe (no server-only imports) so previews can show the exact
 * URL the ad will ship with.
 */

/** utm_source Amplitude/GA4 classify as social; single value across Meta placements. */
export const META_AD_UTM = {
  source: "facebook",
  medium: "paid_social",
} as const;

export type AdUtms = {
  source: string;
  medium: string;
  campaign?: string | null;
  content?: string | null;
};

/**
 * Return `linkUrl` with utm params appended. Existing params of the same key
 * are preserved. Returns the input unchanged when it is empty or not an
 * absolute URL (lead-gen ads carry no link; a relative link is left alone).
 */
export function withAdUtms(
  linkUrl: string | undefined | null,
  utms: AdUtms,
): string | undefined {
  if (!linkUrl) return linkUrl ?? undefined;
  let url: URL;
  try {
    url = new URL(linkUrl);
  } catch {
    return linkUrl;
  }
  const set = (key: string, value?: string | null) => {
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  };
  set("utm_source", utms.source);
  set("utm_medium", utms.medium);
  set("utm_campaign", utms.campaign);
  set("utm_content", utms.content);
  return url.toString();
}
