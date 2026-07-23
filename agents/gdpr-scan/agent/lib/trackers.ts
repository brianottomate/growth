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
  // — Meta
  { host: "connect.facebook.net", vendor: "Meta Pixel", category: "advertising" },
  { host: "facebook.com", vendor: "Meta (fb tr endpoint)", category: "advertising" },
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

/** Inline-JS fingerprints worth flagging even without a script src. */
export const INLINE_SIGNATURES: { pattern: RegExp; vendor: string; note: string }[] = [
  { pattern: /\bgtag\s*\(/, vendor: "Google gtag", note: "gtag() call in inline script" },
  { pattern: /\bfbq\s*\(/, vendor: "Meta Pixel", note: "fbq() call in inline script" },
  { pattern: /GTM-[A-Z0-9]{4,}/, vendor: "Google Tag Manager", note: "GTM container id in markup" },
  { pattern: /\bOptanonWrapper\b/, vendor: "OneTrust", note: "OneTrust callback present" },
  { pattern: /\bosano\b/i, vendor: "Osano", note: "Osano reference present" },
];

/** Markers that the Wander consent architecture is present on the page. */
export const CONSENT_MARKERS: { pattern: RegExp; meaning: string }[] = [
  { pattern: /__wanderConsent/, meaning: "WanderOS consent bootstrap (chokepoint 1)" },
  { pattern: /wos_consent/, meaning: "wos_consent cookie handling" },
  { pattern: /wander_consent/, meaning: "wander.com consent record handling" },
  { pattern: /__bootOnInteraction/, meaning: "interaction-gated tracker boot" },
];

export function matchTracker(host: string): TrackerSignature | null {
  const h = host.toLowerCase();
  for (const sig of KNOWN_TRACKERS) {
    if (h === sig.host || h.endsWith("." + sig.host)) return sig;
  }
  return null;
}
