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
