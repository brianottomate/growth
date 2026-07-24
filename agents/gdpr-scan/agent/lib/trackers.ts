/**
 * Known tracker signatures — mirrors the provider set gated by
 * @wandercom/tracking-web's consent categories, plus the usual suspects a
 * merchant might inject. Host match is suffix-based (subdomains count).
 */
export type TrackerCategory = "analytics" | "advertising" | "functional" | "cmp";

export interface TrackerSignature {
  /** Host suffix, e.g. "google-analytics.com" */
  host: string;
  vendor: string;
  category: TrackerCategory;
}

export const KNOWN_TRACKERS: TrackerSignature[] = [
  // — Google
  { host: "googletagmanager.com", vendor: "Google (gtag/GTM)", category: "advertising" },
  { host: "google-analytics.com", vendor: "Google Analytics 4", category: "analytics" },
  { host: "googlesyndication.com", vendor: "Google Ads", category: "advertising" },
  { host: "googleadservices.com", vendor: "Google Ads", category: "advertising" },
  { host: "doubleclick.net", vendor: "Google DoubleClick", category: "advertising" },
  // — Meta. Note `facebook.com` is deliberately NOT a signature: it suffix-matches
  // www./web./m.facebook.com, so any share widget or social icon read as a pixel.
  // The tracking endpoint is matched by path in `matchTrackerUrl` instead.
  { host: "connect.facebook.net", vendor: "Meta Pixel", category: "advertising" },
  // — Wander's stack
  { host: "cdn.segment.com", vendor: "Segment", category: "analytics" },
  { host: "segment.io", vendor: "Segment", category: "analytics" },
  { host: "amplitude.com", vendor: "Amplitude", category: "analytics" },
  { host: "posthog.com", vendor: "PostHog", category: "analytics" },
  // — Other ad-tech / social
  { host: "ads-twitter.com", vendor: "X/Twitter Ads", category: "advertising" },
  { host: "redditstatic.com", vendor: "Reddit Ads", category: "advertising" },
  { host: "ads.linkedin.com", vendor: "LinkedIn Ads", category: "advertising" },
  { host: "licdn.com", vendor: "LinkedIn Insight", category: "advertising" },
  { host: "analytics.tiktok.com", vendor: "TikTok Pixel", category: "advertising" },
  { host: "snap.com", vendor: "Snap Pixel", category: "advertising" },
  { host: "criteo.com", vendor: "Criteo", category: "advertising" },
  { host: "criteo.net", vendor: "Criteo", category: "advertising" },
  { host: "taboola.com", vendor: "Taboola", category: "advertising" },
  { host: "outbrain.com", vendor: "Outbrain", category: "advertising" },
  { host: "hotjar.com", vendor: "Hotjar", category: "analytics" },
  { host: "clarity.ms", vendor: "MS Clarity", category: "analytics" },
  { host: "klaviyo.com", vendor: "Klaviyo", category: "advertising" },
  { host: "hs-scripts.com", vendor: "HubSpot", category: "advertising" },
  { host: "intercom.io", vendor: "Intercom", category: "functional" },
  { host: "intercomcdn.com", vendor: "Intercom", category: "functional" },
  // — CMPs (informational: presence of a CMP is not a violation)
  { host: "cdn.cookielaw.org", vendor: "OneTrust", category: "cmp" },
  { host: "onetrust.com", vendor: "OneTrust", category: "cmp" },
  { host: "cmp.osano.com", vendor: "Osano", category: "cmp" },
];

/**
 * Inline-JS fingerprints worth flagging even without a script src.
 *
 * Patterns must match *code*, not prose — a bare /osano/i also matched our own
 * CMP-evaluation copy, which turned every blog post about consent vendors into
 * a finding. Anchor on syntax (a call, an assignment, a container id).
 */
export const INLINE_SIGNATURES: { pattern: RegExp; vendor: string; note: string }[] = [
  { pattern: /\bgtag\s*\(/, vendor: "Google gtag", note: "gtag() call in inline script" },
  { pattern: /\bfbq\s*\(/, vendor: "Meta Pixel", note: "fbq() call in inline script" },
  { pattern: /GTM-[A-Z0-9]{4,}/, vendor: "Google Tag Manager", note: "GTM container id in markup" },
  { pattern: /\bOptanonWrapper\b/, vendor: "OneTrust", note: "OneTrust callback present" },
  {
    pattern: /\bOsano\s*[.(]|cmp\.osano\.com/i,
    vendor: "Osano",
    note: "Osano CMP script or Osano.cm API call",
  },
];

/** Markers that the Wander consent architecture is present on the page. */
export const CONSENT_MARKERS: { pattern: RegExp; meaning: string }[] = [
  { pattern: /__wanderConsent/, meaning: "WanderOS consent bootstrap (chokepoint 1)" },
  { pattern: /wos_consent/, meaning: "wos_consent cookie handling" },
  { pattern: /wander_consent/, meaning: "wander.com consent record handling" },
  { pattern: /__bootOnInteraction/, meaning: "interaction-gated tracker boot" },
];

/**
 * First-party reverse-proxy paths that front a third-party tracker.
 *
 * Host matching alone is blind on our own estate: wander.com routes most vendors
 * through same-origin rewrites (ad-blocker evasion), so the request never carries
 * the vendor's hostname. These mirror the matchers in wander.com's
 * `tests/e2e/consent-preconsent-leak.spec.ts` — keep the two lists in step.
 */
export const PROXY_PATH_SIGNATURES: { pattern: RegExp; vendor: string; category: TrackerCategory }[] =
  [
    { pattern: /\/amp\//, vendor: "Amplitude", category: "analytics" },
    { pattern: /\/rdt\//, vendor: "Reddit Ads", category: "advertising" },
    { pattern: /\/li\//, vendor: "LinkedIn Ads", category: "advertising" },
    { pattern: /\/bp\//, vendor: "bidr", category: "advertising" },
    { pattern: /\/pp\//, vendor: "PebblePost", category: "advertising" },
    { pattern: /\/tvs\//, vendor: "TVSquared/Innovid", category: "advertising" },
    { pattern: /\/oai\/|oaiq/, vendor: "OpenAI Ads", category: "advertising" },
    { pattern: /\/gtag\/js|[?&]gtag=/, vendor: "Google (gtag/GTM)", category: "advertising" },
    { pattern: /facebook\.com\/tr|fbevents/, vendor: "Meta Pixel", category: "advertising" },
  ];

export function matchTracker(host: string): TrackerSignature | null {
  const h = host.toLowerCase();
  for (const sig of KNOWN_TRACKERS) {
    if (h === sig.host || h.endsWith("." + sig.host)) return sig;
  }
  return null;
}

/**
 * Match a full URL: third-party host first, then first-party proxy path. Use this
 * rather than `matchTracker` wherever the whole URL is available — on Wander
 * surfaces the proxy path is usually the only signal there is.
 */
export function matchTrackerUrl(url: string): TrackerSignature | null {
  try {
    const parsed = new URL(url);
    const byHost = matchTracker(parsed.hostname);
    if (byHost) return byHost;

    const target = parsed.pathname + parsed.search;
    for (const sig of PROXY_PATH_SIGNATURES) {
      if (sig.pattern.test(target)) {
        return { host: parsed.hostname, vendor: sig.vendor, category: sig.category };
      }
    }
  } catch {
    /* unparsable URL — no match */
  }
  return null;
}
