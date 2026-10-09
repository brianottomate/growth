import type { ChannelPlatform } from "@/server/db/schema";

// ---- THE AD PLATFORM TABLE ---------------------------------------------
//
// One row per paid platform, and the only place that knows a platform's
// several names: the channel_platform value we store, the strings Zernio uses
// for its connection, tree and status calls, and the value on ad_account rows.
// Services and UI look things up here instead of branching on literals, so a
// new platform is a row here plus whatever its compile genuinely needs.
//
// `stage` says how far growth's /ads workflow reaches on a platform:
//   catalog  labels and logos only; a channel can still be tracked by hand
//   plan     a campaign can plan it (draft platform_campaign rows), no push
//   push     compile + push through Zernio is wired
//
// This module is imported by client components: keep it free of server code.

export type AdPlatformStage = "catalog" | "plan" | "push";

export const AD_PUSH_GOALS = [
  "traffic",
  "engagement",
  "awareness",
  "video_views",
  "conversions",
] as const;
export type AdPushGoal = (typeof AD_PUSH_GOALS)[number];

export type AdPlatformZernio = {
  /** Lower-cased `account.platform` values Zernio uses for the ADS connection. */
  connectionPlatforms: readonly string[];
  /**
   * Older ads connections some brands still carry under the SOCIAL name.
   * The destination matcher accepts them; nothing maps them to a channel,
   * because the same string names the posting account.
   */
  connectionAliases?: readonly string[];
  /** The platform name in Zernio's tree, status and duplicate calls. */
  treePlatform: string;
  /** `GET /connect/{platform}/ads` target; null when connecting is not an OAuth link. */
  connectTarget: string | null;
  /** The value stored on `ad_account.platform`, the allowlist. */
  allowlistPlatform: string;
  /** Canonical spelling of a platform ad-account id, so allowlist rows compare. */
  normalizeAccountId: (value: string) => string;
};

export type AdPlatformSpec = {
  platform: ChannelPlatform;
  /** Short id the destinations API and AI tools use ("meta", "google", "linkedin"). */
  key: string;
  label: string;
  shortLabel: string;
  stage: AdPlatformStage;
  zernio: AdPlatformZernio | null;
  features: {
    /** Provider validate-only pass that creates nothing. */
    dryRun: boolean;
    /** N creatives in one ad set from one create call (Zernio `creatives[]`). */
    multiCreativeAdSet: boolean;
    /** Text-asset ads (headline / description pools) compile here. */
    textAds: boolean;
    /** Image and video creative ads compile here. */
    creativeAds: boolean;
    /** Targeting the compile can express; the rest is reported and left out. */
    targeting: { regions: boolean; age: boolean };
    /** Goals the push offers on this platform. */
    goals: readonly AdPushGoal[];
  };
  accountManageUrl: (accountId: string) => string | undefined;
  campaignManageUrl: (
    accountId: string,
    campaignId: string,
    /** The campaign's ad sets, when known: the link opens on their ads. */
    adSetIds?: string[],
  ) => string | undefined;
  /** One ad, opened in the platform's editor; only where it has a link. */
  adManageUrl?: (input: {
    accountId: string;
    campaignId: string;
    adSetId: string;
    adId: string;
  }) => string;
};

const identity = (value: string) => value;
const noManageUrl = () => undefined;

const NO_FEATURES: AdPlatformSpec["features"] = {
  dryRun: false,
  multiCreativeAdSet: false,
  textAds: false,
  creativeAds: false,
  targeting: { regions: false, age: false },
  goals: [],
};

const metaAccountUrl = (accountId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountId.replace(/^act_/i, "")}`;

// Campaign Manager's campaign-group deep link is not documented, so LinkedIn
// gets the account's campaigns view for both levels.
const linkedInAccountUrl = (accountId: string) =>
  `https://www.linkedin.com/campaignmanager/accounts/${accountId.replace(/^urn:li:sponsoredAccount:/i, "")}/campaigns`;

export const AD_PLATFORM_SPECS: readonly AdPlatformSpec[] = [
  {
    platform: "meta_ads",
    key: "meta",
    label: "Meta Ads",
    shortLabel: "Meta",
    stage: "push",
    zernio: {
      connectionPlatforms: ["metaads", "meta_ads"],
      connectionAliases: ["facebook"],
      treePlatform: "facebook",
      connectTarget: "facebook",
      allowlistPlatform: "facebook",
      normalizeAccountId: (value) => value.replace(/^act_/i, ""),
    },
    features: {
      dryRun: true,
      multiCreativeAdSet: true,
      textAds: false,
      creativeAds: true,
      targeting: { regions: true, age: true },
      goals: AD_PUSH_GOALS,
    },
    accountManageUrl: metaAccountUrl,
    // The Ads view, filtered to the campaign and its ad sets: the level an
    // operator reviews a push at.
    adManageUrl: ({ accountId, campaignId, adSetId, adId }) =>
      `https://adsmanager.facebook.com/adsmanager/manage/ads/edit/standalone?act=${accountId.replace(/^act_/i, "")}&selected_campaign_ids=${campaignId}&selected_adset_ids=${adSetId}&selected_ad_ids=${adId}&current_step=0`,
    campaignManageUrl: (accountId, campaignId, adSetIds) =>
      `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountId.replace(/^act_/i, "")}&selected_campaign_ids=${campaignId}${
        adSetIds?.length ? `&selected_adset_ids=${adSetIds.join(",")}` : ""
      }`,
  },
  {
    platform: "google_ads",
    key: "google",
    label: "Google Ads",
    shortLabel: "Google",
    stage: "push",
    zernio: {
      connectionPlatforms: ["googleads", "google_ads"],
      treePlatform: "google",
      connectTarget: "googleads",
      allowlistPlatform: "google",
      // Customer ids are shown as 123-456-7890 and stored bare.
      normalizeAccountId: (value) => value.replace(/-/g, ""),
    },
    features: {
      dryRun: false,
      multiCreativeAdSet: false,
      textAds: true,
      creativeAds: true,
      targeting: { regions: true, age: true },
      goals: ["traffic", "engagement", "awareness", "conversions"],
    },
    // Google uses an opaque browser `ocid`, distinct from the customer CID.
    // A verified scoped URL belongs on platform_campaign.manageUrl. Returning
    // undefined here keeps sync from replacing that URL with the generic list.
    accountManageUrl: () => "https://ads.google.com/aw/campaigns",
    campaignManageUrl: () => undefined,
  },
  {
    platform: "linkedin_ads",
    key: "linkedin",
    label: "LinkedIn Ads",
    shortLabel: "LinkedIn",
    stage: "push",
    zernio: {
      connectionPlatforms: ["linkedinads", "linkedin_ads"],
      treePlatform: "linkedin",
      connectTarget: "linkedin",
      allowlistPlatform: "linkedin",
      // Sponsored accounts are numeric on the live API; the URN form appears
      // in some docs and is accepted here so both spellings match.
      normalizeAccountId: (value) =>
        value.replace(/^urn:li:sponsoredAccount:/i, ""),
    },
    features: {
      dryRun: false,
      multiCreativeAdSet: false,
      textAds: false,
      creativeAds: true,
      // Zernio's LinkedIn create honours country-level targeting only.
      targeting: { regions: false, age: false },
      goals: ["engagement", "traffic", "awareness", "video_views"],
    },
    accountManageUrl: linkedInAccountUrl,
    campaignManageUrl: (accountId) => linkedInAccountUrl(accountId),
  },
  {
    platform: "openai_ads",
    key: "openai",
    label: "OpenAI Ads",
    shortLabel: "OpenAI",
    stage: "plan",
    zernio: {
      connectionPlatforms: ["openaiads", "openai_ads"],
      treePlatform: "openai",
      // Connected with an API key (POST /connect/openai-ads/credentials).
      connectTarget: null,
      allowlistPlatform: "openai",
      normalizeAccountId: identity,
    },
    features: NO_FEATURES,
    accountManageUrl: () => "https://platform.openai.com",
    campaignManageUrl: () => "https://platform.openai.com",
  },
  {
    platform: "reddit_ads",
    key: "reddit",
    label: "Reddit Ads",
    shortLabel: "Reddit",
    stage: "catalog",
    zernio: null,
    features: NO_FEATURES,
    accountManageUrl: noManageUrl,
    campaignManageUrl: noManageUrl,
  },
  {
    platform: "x_ads",
    key: "x",
    label: "X Ads",
    shortLabel: "X",
    stage: "catalog",
    zernio: {
      connectionPlatforms: ["xads", "x_ads", "twitterads"],
      treePlatform: "twitter",
      connectTarget: "twitter",
      allowlistPlatform: "x",
      normalizeAccountId: identity,
    },
    features: NO_FEATURES,
    accountManageUrl: noManageUrl,
    campaignManageUrl: noManageUrl,
  },
  {
    platform: "tiktok_ads",
    key: "tiktok",
    label: "TikTok Ads",
    shortLabel: "TikTok",
    stage: "catalog",
    zernio: {
      connectionPlatforms: ["tiktokads", "tiktok_ads"],
      treePlatform: "tiktok",
      connectTarget: "tiktok",
      allowlistPlatform: "tiktok",
      normalizeAccountId: identity,
    },
    features: NO_FEATURES,
    accountManageUrl: noManageUrl,
    campaignManageUrl: noManageUrl,
  },
  {
    platform: "pinterest_ads",
    key: "pinterest",
    label: "Pinterest Ads",
    shortLabel: "Pinterest",
    stage: "catalog",
    zernio: {
      connectionPlatforms: ["pinterestads", "pinterest_ads"],
      treePlatform: "pinterest",
      connectTarget: "pinterest",
      allowlistPlatform: "pinterest",
      normalizeAccountId: identity,
    },
    features: NO_FEATURES,
    accountManageUrl: noManageUrl,
    campaignManageUrl: noManageUrl,
  },
];

// ---- LITERAL TUPLES ----------------------------------------------------
//
// Zod enums and Record keys need literal types, which a table cannot hand
// out. These tuples restate the table's subsets; ad-platforms.test.ts fails
// the moment they drift from it.

/** Platforms a campaign can plan (stage plan or push). */
export const PLANNABLE_AD_PLATFORMS = [
  "meta_ads",
  "google_ads",
  "linkedin_ads",
  "openai_ads",
] as const satisfies readonly ChannelPlatform[];
export type PlannableAdPlatform = (typeof PLANNABLE_AD_PLATFORMS)[number];

/** Platforms the push compiles to (stage push). */
export const PUSHABLE_AD_PLATFORMS = [
  "meta_ads",
  "google_ads",
  "linkedin_ads",
] as const satisfies readonly PlannableAdPlatform[];
export type PushableAdPlatform = (typeof PUSHABLE_AD_PLATFORMS)[number];

/** The pushable platforms by their short key: the destinations vocabulary. */
export const ZERNIO_AD_PLATFORMS = ["meta", "google", "linkedin"] as const;
export type ZernioAdPlatform = (typeof ZERNIO_AD_PLATFORMS)[number];

/** `ad_account.platform` values the allowlist UI can decide on. */
export const AD_ACCOUNT_PLATFORMS = ["facebook", "google", "linkedin"] as const;
export type AdAccountPlatform = (typeof AD_ACCOUNT_PLATFORMS)[number];

// ---- LOOKUPS -----------------------------------------------------------

export function adPlatformSpec(
  platform: string | null | undefined,
): AdPlatformSpec | undefined {
  return AD_PLATFORM_SPECS.find((spec) => spec.platform === platform);
}

export function requireAdPlatformSpec(platform: string): AdPlatformSpec {
  const spec = adPlatformSpec(platform);
  if (!spec) throw new Error(`Unknown ad platform: ${platform}`);
  return spec;
}

export function adPlatformByKey(key: string): AdPlatformSpec | undefined {
  return AD_PLATFORM_SPECS.find((spec) => spec.key === key);
}

export function adPlatformByAllowlistPlatform(
  value: string,
): AdPlatformSpec | undefined {
  return AD_PLATFORM_SPECS.find(
    (spec) => spec.zernio?.allowlistPlatform === value,
  );
}

/** "meta_ads" → "meta": the channel platform as the destinations API names it. */
export function zernioAdPlatformKey(
  platform: PushableAdPlatform,
): ZernioAdPlatform {
  return requireAdPlatformSpec(platform).key as ZernioAdPlatform;
}

/** "meta" → "meta_ads". */
export function channelPlatformForZernioKey(
  key: ZernioAdPlatform,
): PushableAdPlatform {
  const spec = adPlatformByKey(key);
  if (!spec) throw new Error(`Unknown Zernio ad platform: ${key}`);
  return spec.platform as PushableAdPlatform;
}

/**
 * Any string Zernio uses for a paid platform (connection name, tree name, or
 * our own enum value) → the channel_platform we store. Undefined for social
 * names and unknowns, so callers can fall through to their social mapping.
 */
export function adPlatformFromZernioString(
  value: string | null | undefined,
): ChannelPlatform | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return AD_PLATFORM_SPECS.find(
    (spec) =>
      spec.platform === normalized ||
      spec.zernio?.treePlatform === normalized ||
      spec.zernio?.connectionPlatforms.includes(normalized),
  )?.platform;
}

export function isPlannableAdPlatform(
  platform: string,
): platform is PlannableAdPlatform {
  return (PLANNABLE_AD_PLATFORMS as readonly string[]).includes(platform);
}

export function isPushableAdPlatform(
  platform: string,
): platform is PushableAdPlatform {
  return (PUSHABLE_AD_PLATFORMS as readonly string[]).includes(platform);
}

// ---- CLIENT-SAFE CATALOG (kept for existing consumers) -----------------

export const AD_PLATFORM_OPTIONS = AD_PLATFORM_SPECS.map(
  ({ platform, label, shortLabel }) => ({ value: platform, label, shortLabel }),
) as readonly { value: ChannelPlatform; label: string; shortLabel: string }[];

export const AD_PLATFORM_VALUES = AD_PLATFORM_OPTIONS.map(
  ({ value }) => value,
) as [ChannelPlatform, ...ChannelPlatform[]];

export const AD_PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  AD_PLATFORM_OPTIONS.map(({ value, label }) => [value, label]),
);

export const AD_PLATFORM_SHORT_LABELS: Record<string, string> =
  Object.fromEntries(
    AD_PLATFORM_OPTIONS.map(({ value, shortLabel }) => [value, shortLabel]),
  );

/**
 * Whether an idea runs on a platform. No list means every planned platform
 * that can render it; the compile then decides by shape (text or creative).
 */
export function adRoutesTo(
  platforms: readonly ChannelPlatform[] | null | undefined,
  platform: ChannelPlatform,
) {
  return !platforms?.length || platforms.includes(platform);
}
