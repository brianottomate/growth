import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { platformCampaignTable } from "@/server/db/schema";

import { CampaignView } from "./CampaignView";
import { PlatformCampaignView } from "./PlatformCampaignView";

export const dynamic = "force-dynamic";

/**
 * One route for both halves of the ads model, dispatched on the id prefix
 * (`camp_` authored, `pcamp_` platform) — mirroring content, where
 * /app/content/[contentId] is the only detail route and a platform post is a
 * card on it. "Draft" is a status on the campaign, so it is not a path.
 *
 * A platform campaign that has a parent redirects to it: the card there is
 * the canonical view, and old links keep working. One without a parent still
 * renders on its own, because sync legitimately pulls campaigns we did not
 * author and they should not be homeless while they wait to be attached.
 */
export default async function AdsDetailPage({
  params,
}: {
  params: Promise<{ brandSlug: string; adsId: string }>;
}) {
  const { brandSlug, adsId } = await params;

  if (adsId.startsWith("camp_")) {
    return <CampaignView brandSlug={brandSlug} campaignId={adsId} />;
  }

  const parent = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, adsId),
    columns: { campaignId: true },
  });
  if (parent?.campaignId) {
    redirect(`/app/brands/${brandSlug}/ads/${parent.campaignId}`);
  }

  return (
    <PlatformCampaignView brandSlug={brandSlug} platformCampaignId={adsId} />
  );
}
