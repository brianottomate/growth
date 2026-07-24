/**
 * Declared tracker catalogs — what each site is SUPPOSED to run.
 *
 * Spike: hardcoded. Production: read from the WanderOS merchant config
 * (website registry already stores googleAnalyticsId / googleTagManagerId /
 * metaPixelId per site — see wander-sites-website Trackers.astro) or a
 * dedicated catalog service.
 */
export interface SiteCatalog {
  /** Vendors the site has declared, by trackers.ts vendor name. */
  declaredVendors: string[];
  /** Cookies the site is expected to set pre-consent. */
  expectedCookies: string[];
  notes?: string;
}

export const CATALOGS: Record<string, SiteCatalog> = {
  "wander.com": {
    declaredVendors: [
      "Segment",
      "Amplitude",
      "Google (gtag/GTM)",
      "Google Analytics 4",
      "Google Ads",
      "Meta Pixel",
      "Reddit Ads",
      "LinkedIn Ads",
    ],
    expectedCookies: ["wander_regime", "wander_consent"],
    notes: "All consent-gated via @wandercom/tracking-web provider specs.",
  },
  // Merchant sites default: platform GA + optional merchant-declared IDs.
  "*.wanderos-default": {
    declaredVendors: ["Google Analytics 4", "Amplitude", "Meta Pixel"],
    expectedCookies: ["wos_consent", "wos_regime"],
    notes:
      "Per-merchant overrides come from the website registry (googleAnalyticsId, googleTagManagerId, metaPixelId).",
  },
};

/**
 * Resolve the catalog for a hostname.
 *
 * Deliberately not an exact-match lookup: wander.com 301s to www.wander.com, so
 * the host we actually scan is never the bare apex. Without the walk below every
 * declared wander.com vendor (Segment, Google Ads, Reddit, LinkedIn) came back as
 * an undeclared 🟠 on the primary site — a false positive on the one site whose
 * catalog we know for certain.
 *
 * Strategy: strip a leading `www.`, then walk parent domains, so `www.wander.com`
 * and `app.wander.com` both land on the `wander.com` catalog. Unknown hosts fall
 * through to the WanderOS merchant default.
 */
export function catalogFor(hostname: string): { key: string; catalog: SiteCatalog } {
  const host = hostname.toLowerCase().replace(/^www\./, "");

  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    if (candidate in CATALOGS) return { key: candidate, catalog: CATALOGS[candidate] };
  }

  return { key: "*.wanderos-default", catalog: CATALOGS["*.wanderos-default"] };
}
