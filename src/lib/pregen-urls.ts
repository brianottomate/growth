/**
 * The two addresses a pregen preview is reachable at, derived from one stored URL.
 *
 * `lead_domain.pregenSiteUrl` holds the renderer's own address, which is the
 * only one the build webhook writes:
 *   https://<label>.wanderforoperators.com/?t=<token>
 *
 * The wander.com wrapper is a mechanical transform of it, same label and same
 * token, never minted or stored separately:
 *   https://www.wander.com/os/<label>?t=<token>
 *
 * Client-safe on purpose. The review card and the sequence generator both need
 * to name the link a prospect will open, and two implementations of that
 * transform is two answers to "which page did we actually send them".
 */

/**
 * The wander.com pitch wrapper for a preview URL, or null when the URL is not
 * shaped like one (no token, unparseable). Null means "no wrapper exists",
 * which callers should treat as a reason to fall back, not as an error.
 */
export function osPitchUrl(previewUrl: string): string | null {
  try {
    const parsed = new URL(previewUrl);
    const label = parsed.hostname.split(".")[0];
    const token = parsed.searchParams.get("t");
    if (!label || !token) return null;
    return `https://www.wander.com/os/${label}?t=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

/**
 * Per-company attribution, carried over from the retired Instantly generator.
 * Without it the link reaches Amplitude with no way to tell which company
 * opened it, which is the only conversion signal this motion produces before a
 * reply.
 *
 * Edits the query rather than concatenating, because the URL is signed and
 * already carries a token, and returns the original untouched if it will not
 * parse — an unattributed link beats a corrupted signed one.
 */
export function trackedUrl(
  url: string,
  domain: string,
  campaign = "pregen_sites",
): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("utm_source", "hubspot_sequence");
    parsed.searchParams.set("utm_medium", "outbound");
    parsed.searchParams.set("utm_campaign", campaign);
    parsed.searchParams.set("utm_content", domain);
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * The link that goes in the email.
 *
 * The wander.com wrapper, not the bare renderer address: it puts the preview
 * behind Wander's own domain, which is the name the recipient has a reason to
 * trust, and wraps it in the pitch context. `wanderforoperators.com` in an
 * unsolicited email is a domain nobody has heard of.
 *
 * Falls back to the tracked preview when no wrapper can be derived, so a
 * malformed stored URL costs attribution rather than the whole email.
 */
export function outreachLinkFor(
  previewUrl: string,
  domain: string,
  options: {
    /**
     * `pregen_sites` is the bespoke-sequence arm; `pregen_blast` is the
     * one-template arm. Distinct on purpose, so when both run, clicks and
     * replies separate by arm in analytics and the comparison is a
     * measurement rather than an argument.
     */
    campaign?: string;
  } = {},
): string {
  return trackedUrl(
    osPitchUrl(previewUrl) ?? previewUrl,
    domain,
    options.campaign ?? "pregen_sites",
  );
}
