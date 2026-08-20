export const ZERNIO_AD_PLATFORMS = ["meta", "google"] as const;
export type ZernioAdPlatform = (typeof ZERNIO_AD_PLATFORMS)[number];

export function normalizeAdAccountId(
  platform: ZernioAdPlatform,
  value: string,
): string {
  const trimmed = value.trim();
  if (platform === "meta") return trimmed.replace(/^act_/i, "");
  return trimmed.replace(/-/g, "");
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
  return platform === "meta"
    ? normalized === "facebook" || normalized === "metaads"
    : normalized === "googleads";
}

export function allowlistPlatform(platform: ZernioAdPlatform): string {
  return platform === "meta" ? "facebook" : "google";
}

export function metaDraftProviderControls(validateOnly?: boolean) {
  return {
    status: "PAUSED" as const,
    validateOnly,
  };
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
