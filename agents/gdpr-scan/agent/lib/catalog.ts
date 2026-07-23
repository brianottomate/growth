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

export function catalogFor(hostname: string): { key: string; catalog: SiteCatalog } {
  const key = hostname in CATALOGS ? hostname : "*.wanderos-default";
  return { key, catalog: CATALOGS[key] };
}
