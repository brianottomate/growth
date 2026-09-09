import {
  adPlatformByKey,
  ZERNIO_AD_PLATFORMS,
  type AdPushGoal,
  type ZernioAdPlatform,
} from "@/lib/ad-platforms";

export { ZERNIO_AD_PLATFORMS, type ZernioAdPlatform };

function zernioSpec(platform: ZernioAdPlatform) {
  const spec = adPlatformByKey(platform);
  if (!spec?.zernio) {
    throw new Error(`${platform} is not reachable through Zernio`);
  }
  return spec;
}

export function normalizeAdAccountId(
  platform: ZernioAdPlatform,
  value: string,
): string {
  return zernioSpec(platform).zernio!.normalizeAccountId(value.trim());
}

export function sameAdAccountId(
  platform: ZernioAdPlatform,
  left: string,
  right: string,
): boolean {
  return (
    normalizeAdAccountId(platform, left) ===
    normalizeAdAccountId(platform, right)
  );
}

export function zernioConnectionMatchesPlatform(
  platform: ZernioAdPlatform,
  connectionPlatform: string,
): boolean {
  const normalized = connectionPlatform.toLowerCase().replaceAll("_", "");
  const { connectionPlatforms, connectionAliases = [] } =
    zernioSpec(platform).zernio!;
  return [...connectionPlatforms, ...connectionAliases].some(
    (candidate) => candidate.replaceAll("_", "") === normalized,
  );
}

export function allowlistPlatform(platform: ZernioAdPlatform): string {
  return zernioSpec(platform).zernio!.allowlistPlatform;
}

export function metaDraftProviderControls(validateOnly?: boolean) {
  return {
    status: "PAUSED" as const,
    validateOnly,
  };
}

/**
 * LinkedIn pauses the whole campaign group → campaign → creative hierarchy on
 * `status: PAUSED`. Zernio documents validate-only for Meta alone, so a
 * LinkedIn push never sends it.
 */
export function linkedInDraftProviderControls() {
  return { status: "PAUSED" as const };
}

export function googleCreativeRequirement(input: {
  campaignType: "search" | "display";
  keywords?: string[];
  images?: { landscape: string; square: string };
}): string | null {
  if (input.campaignType === "search" && !input.keywords?.length) {
    return "Google Search creation requires at least one keyword";
  }
  if (input.campaignType === "display" && !input.images) {
    return "Google Display creation requires landscape and square images";
  }
  return null;
}

// ---- LINKEDIN ----------------------------------------------------------
//
// From-scratch LinkedIn ads through Zernio are Direct Sponsored Content
// ("dark posts") authored by a Company Page: a single image or a single video
// per creative, country-level targeting, four goals. Conversion campaigns are
// only reachable by boosting an existing post.
// https://docs.zernio.com/platforms/linkedin-ads/create-ads

export const LINKEDIN_PUSH_GOALS = [
  "engagement",
  "traffic",
  "awareness",
  "video_views",
] as const satisfies readonly AdPushGoal[];

/**
 * Zernio requires a call to action on every Meta ad. Ours carry one when the
 * operator chose it; this is the neutral fallback so a carousel or a static
 * without a choice still compiles instead of failing at the provider.
 */
export const META_DEFAULT_CALL_TO_ACTION = "LEARN_MORE";

export const LINKEDIN_CALL_TO_ACTIONS = [
  "LEARN_MORE",
  "SIGN_UP",
  "DOWNLOAD",
  "SUBSCRIBE",
  "REGISTER",
  "JOIN",
  "ATTEND",
  "REQUEST_DEMO",
  "VIEW_QUOTE",
  "APPLY",
  "SEE_MORE",
  "SHOP_NOW",
  "BUY_NOW",
] as const;
export type LinkedInCallToAction = (typeof LINKEDIN_CALL_TO_ACTIONS)[number];

export const LINKEDIN_COST_TYPES = ["CPM", "CPC", "CPV"] as const;
export type LinkedInCostType = (typeof LINKEDIN_COST_TYPES)[number];

/** LinkedIn's flat floors; the account-specific one comes from bid pricing. */
export const LINKEDIN_MIN_DAILY_BUDGET = 10;
export const LINKEDIN_MIN_LIFETIME_BUDGET = 100;
export const LINKEDIN_HEADLINE_MAX = 400;
export const LINKEDIN_CAROUSEL_CARDS = { min: 2, max: 10 };

export function linkedInCreativeRequirement(input: {
  goal: string;
  hasVideo: boolean;
  linkUrl?: string | null;
}): string | null {
  if (!(LINKEDIN_PUSH_GOALS as readonly string[]).includes(input.goal)) {
    return `LinkedIn creates ${LINKEDIN_PUSH_GOALS.join(", ")} campaigns through Zernio; a ${input.goal} campaign needs a boosted Company Page post instead`;
  }
  if (input.goal === "video_views" && !input.hasVideo) {
    return "LinkedIn video_views needs a video creative";
  }
  if (input.goal === "traffic" && !input.linkUrl) {
    return "LinkedIn traffic ads need a link URL";
  }
  return null;
}

/**
 * Idempotency key for a provider write.
 *
 * `businessKey` is the caller's own identity for the thing being created — for
 * deal-driven automation, the closed deal plus the PM plus the campaign type.
 * It is the only thing that makes a retry safe across separate runs: keying on
 * the assistant `runId` alone protects retries inside one run, so a later run
 * for the same deal would create a second campaign and a second budget.
 *
 * A business key deliberately ignores the payload. A re-run that corrects the
 * budget for a deal should replay the original create, not open a second
 * campaign; adjustments belong in a follow-up update. Without a business key
 * the payload hash stays in the key, so an operator who changes their mind
 * mid-conversation still gets a distinct create.
 */
export function adWriteIdempotencyKey(input: {
  action: string;
  runId: string;
  payloadHash: string;
  businessKey?: string | null;
}): string {
  const business = input.businessKey?.trim();
  return business
    ? `growth:biz:${business}:${input.action}`
    : `growth:run:${input.runId}:${input.action}:${input.payloadHash}`;
}

/**
 * Canonical business key for a List+ style campaign: one campaign per deal, per
 * PM, per campaign type. Lower-cased and colon-delimited so the same deal
 * reached from different surfaces produces byte-identical keys.
 */
export function campaignBusinessKey(input: {
  dealId: string;
  pmId: string;
  campaignType: string;
}): string {
  return [input.dealId, input.pmId, input.campaignType]
    .map((part) => part.trim().toLowerCase())
    .join(":");
}
