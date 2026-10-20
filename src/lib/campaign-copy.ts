import type {
  Ad,
  Campaign,
  PlatformCampaign,
  PlatformDeliveryGroup,
} from "@/server/db/ads-schema";
import type {
  adTable,
  audienceTable,
  campaignAudienceAssetTable,
  campaignTable,
  platformCampaignTable,
  platformDeliveryGroupTable,
} from "@/server/db/ads-schema";

type Audience = typeof audienceTable.$inferSelect;
type AssetLink = typeof campaignAudienceAssetTable.$inferSelect;

export type CampaignCopySource = {
  campaign: Campaign;
  ads: Ad[];
  audiences: Audience[];
  assetLinks: AssetLink[];
  platformCampaigns: PlatformCampaign[];
  deliveryGroups: PlatformDeliveryGroup[];
};

export type CampaignCopyPlan = {
  campaign: typeof campaignTable.$inferInsert & { id: string };
  ads: (typeof adTable.$inferInsert)[];
  audiences: (typeof audienceTable.$inferInsert)[];
  assetLinks: (typeof campaignAudienceAssetTable.$inferInsert)[];
  platformCampaigns: (typeof platformCampaignTable.$inferInsert)[];
  deliveryGroups: (typeof platformDeliveryGroupTable.$inferInsert)[];
  /** Source id → copy id for every row the plan creates. */
  ids: Map<string, string>;
};

/**
 * Everything a campaign copy inserts, computed from the source rows. Pure:
 * ids come from the caller, so the plan can be checked without a database.
 *
 * What changes on the copy, and why:
 * - every row gets a fresh id, and the platform drafts' lists of ad ids are
 *   remapped so the copy never points at the source's ads;
 * - ads come back unpushed (`replacesAdId` null, no push record is copied)
 *   and keep their approval, since the creative is byte-identical to what a
 *   person already signed off; `businessKey` is unique per ad, so it is
 *   dropped;
 * - platform drafts and delivery groups lose everything the platform wrote
 *   (external ids, stats, spend, compiled targeting, an incomplete push) and
 *   keep what the operator set (budget, settings, configuration), so the
 *   copy is a draft the ordinary push creates afresh.
 * Media is referenced by asset id and URL inside content and placements and
 * is shared by reference; the plan writes no media.
 */
export function campaignCopyPlan(
  source: CampaignCopySource,
  options: { name?: string; id: (prefix: string) => string },
): CampaignCopyPlan {
  const ids = new Map<string, string>();
  const copyId = (prefix: string, sourceId: string) => {
    const id = options.id(prefix);
    ids.set(sourceId, id);
    return id;
  };
  const remap = (list: string[] | undefined) =>
    list?.map((id) => ids.get(id) ?? id);

  const campaignId = copyId("camp", source.campaign.id);
  const ads = source.ads.map((ad) => {
    const id = copyId("ad", ad.id);
    return {
      id,
      campaignId,
      brandId: ad.brandId,
      homeId: ad.homeId,
      bookingTargetId: ad.bookingTargetId,
      name: ad.name,
      type: ad.type,
      status: ad.status,
      content: ad.content,
      placements: ad.placements,
      platforms: ad.platforms,
      businessKey: null,
      readyAt: ad.readyAt,
      readyBy: ad.readyBy,
      approvedAt: ad.approvedAt,
      approvedBy: ad.approvedBy,
      replacesAdId: null,
    };
  });

  const audiences = source.audiences.map((audience) => ({
    id: copyId("aud", audience.id),
    campaignId,
    brandId: audience.brandId,
    personaId: audience.personaId,
    type: audience.type,
    name: audience.name,
    description: audience.description,
    geography: audience.geography,
    ageMin: audience.ageMin,
    ageMax: audience.ageMax,
  }));
  const assetLinks = source.assetLinks.flatMap((link) => {
    const audienceId = ids.get(link.audienceId);
    if (!audienceId) return [];
    return [
      {
        id: options.id("caasset"),
        audienceId,
        platformAudienceId: link.platformAudienceId,
        platform: link.platform,
      },
    ];
  });

  const platformCampaigns = source.platformCampaigns.map((row) => {
    const { incompletePush: _dropped, ...settings } = row.settings ?? {};
    return {
      id: copyId("pcamp", row.id),
      channelId: row.channelId,
      platform: row.platform,
      brandId: row.brandId,
      campaignId,
      performanceCycleId: null,
      name: row.name,
      objective: row.objective,
      startAt: row.startAt,
      endAt: row.endAt,
      budget: row.budget,
      budgetType: row.budgetType,
      spend: null,
      adCount: 0,
      status: "draft" as const,
      settings: {
        ...settings,
        selectedAdIds: remap(settings.selectedAdIds),
        previewAdIds: remap(settings.previewAdIds),
      },
      stats: null,
      heroThumbnailUrl: null,
      externalId: null,
      manageUrl: null,
    };
  });
  const deliveryGroups = source.deliveryGroups.flatMap((group) => {
    const platformCampaignId = ids.get(group.platformCampaignId);
    if (!platformCampaignId) return [];
    return [
      {
        id: options.id("pdg"),
        platformCampaignId,
        brandId: group.brandId,
        audienceId: group.audienceId
          ? (ids.get(group.audienceId) ?? null)
          : null,
        name: group.name,
        status: null,
        configuration: group.configuration,
        targetingSpec: null,
        budget: group.budget,
        budgetType: group.budgetType,
        optimizationGoal: group.optimizationGoal,
        externalId: null,
        stats: null,
      },
    ];
  });

  const campaign = {
    id: campaignId,
    brandId: source.campaign.brandId,
    name: options.name?.trim() || `${source.campaign.name} copy`,
    slug: null,
    goal: source.campaign.goal,
    landingUrl: source.campaign.landingUrl,
    bookingTargetId: source.campaign.bookingTargetId,
    description: source.campaign.description,
    color: source.campaign.color,
    creativePool: source.campaign.creativePool,
    // Retired: nothing reads a homes run any more.
    homesRun: null,
    budget: source.campaign.budget,
    performanceCycleId: null,
    status: "planned" as const,
    startAt: source.campaign.startAt,
    endAt: source.campaign.endAt,
    deletedAt: null,
  };

  return {
    campaign,
    ads,
    audiences,
    assetLinks,
    platformCampaigns,
    deliveryGroups,
    ids,
  };
}
