import { PlatformCampaignView } from "../../_views/PlatformCampaignView";

export const dynamic = "force-dynamic";

/**
 * One campaign as it exists in an ad account — synced, or created by our push.
 * It renders here whether or not it belongs to a first-party campaign: sync
 * legitimately pulls campaigns nobody here authored, and attaching one later
 * should not move its URL.
 */
export default async function PlatformCampaignPage({
  params,
}: {
  params: Promise<{ brandSlug: string; platformCampaignId: string }>;
}) {
  const { brandSlug, platformCampaignId } = await params;
  return (
    <PlatformCampaignView
      brandSlug={brandSlug}
      platformCampaignId={platformCampaignId}
    />
  );
}
