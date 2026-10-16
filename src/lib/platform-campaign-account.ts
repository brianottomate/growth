/**
 * The Meta ad account a platform campaign runs in: the destination the
 * plan chose, or the act= of the Ads Manager link a push or sync recorded.
 * The push does not write the destination, so a pushed campaign only has
 * the link.
 */
export function platformCampaignAdAccount(pc: {
  settings?: {
    meta?: { destination?: { adAccountId?: string } | null } | null;
  } | null;
  manageUrl: string | null;
}): string | null {
  return pc.settings?.meta?.destination?.adAccountId ?? actOf(pc.manageUrl);
}

function actOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("act");
  } catch {
    return null;
  }
}
