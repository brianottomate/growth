import "server-only";

import { eq, inArray } from "drizzle-orm";

import { db, withTransaction } from "@/server/db";
import {
  adTable,
  audienceTable,
  campaignAudienceAssetTable,
  campaignTable,
  platformCampaignTable,
  platformDeliveryGroupTable,
} from "@/server/db/ads-schema";
import { createId } from "@/server/db/utils";
import { requireOwnedCampaign } from "./ads-draft.service";
import { campaignCopyPlan } from "@/lib/campaign-copy";

/**
 * A local copy of a campaign: the campaign row, its ads, its audiences with
 * their platform-audience links, and its platform drafts with their delivery
 * groups, all under fresh ids. Media stays shared by reference and nothing
 * is pushed, so the copy is a draft the ordinary push takes to the platform.
 * Copied ads carry no push record, which is what makes them editable again.
 */
export async function duplicateCampaign(input: {
  organizationId: string;
  campaignId: string;
  name?: string;
}) {
  const { campaign, brand } = await requireOwnedCampaign(
    input.campaignId,
    input.organizationId,
  );
  const [ads, audiences, platformCampaigns] = await Promise.all([
    db.query.adTable.findMany({ where: eq(adTable.campaignId, campaign.id) }),
    db.query.audienceTable.findMany({
      where: eq(audienceTable.campaignId, campaign.id),
    }),
    db.query.platformCampaignTable.findMany({
      where: eq(platformCampaignTable.campaignId, campaign.id),
    }),
  ]);
  const [assetLinks, deliveryGroups] = await Promise.all([
    audiences.length
      ? db.query.campaignAudienceAssetTable.findMany({
          where: inArray(
            campaignAudienceAssetTable.audienceId,
            audiences.map((row) => row.id),
          ),
        })
      : [],
    platformCampaigns.length
      ? db.query.platformDeliveryGroupTable.findMany({
          where: inArray(
            platformDeliveryGroupTable.platformCampaignId,
            platformCampaigns.map((row) => row.id),
          ),
        })
      : [],
  ]);

  const plan = campaignCopyPlan(
    { campaign, ads, audiences, assetLinks, platformCampaigns, deliveryGroups },
    { name: input.name, id: createId },
  );

  await withTransaction(async (tx) => {
    await tx.insert(campaignTable).values(plan.campaign);
    if (plan.ads.length) await tx.insert(adTable).values(plan.ads);
    if (plan.audiences.length)
      await tx.insert(audienceTable).values(plan.audiences);
    if (plan.assetLinks.length)
      await tx.insert(campaignAudienceAssetTable).values(plan.assetLinks);
    if (plan.platformCampaigns.length)
      await tx.insert(platformCampaignTable).values(plan.platformCampaigns);
    if (plan.deliveryGroups.length)
      await tx.insert(platformDeliveryGroupTable).values(plan.deliveryGroups);
  });

  const created = await db.query.campaignTable.findFirst({
    where: eq(campaignTable.id, plan.campaign.id),
  });
  if (!created) throw new Error("Campaign copy was not saved");
  return {
    campaign: created,
    sourceCampaignId: campaign.id,
    brandSlug: brand.slug,
    counts: {
      ads: plan.ads.length,
      audiences: plan.audiences.length,
      platforms: plan.platformCampaigns.length,
    },
  };
}
