import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  initiativeTable,
  brandTable,
  campaignTable,
  platformCampaignTable,
  homeTable,
  performanceAccountTable,
} from "@/server/db/schema";
import { assistantPageRoute } from "@/lib/assistant-page-route";

export async function resolvePageContext(
  pagePath: string,
  organizationId: string,
) {
  const route = assistantPageRoute(pagePath);
  const initiative = route.initiativeId
    ? await db.query.initiativeTable.findFirst({
        where: and(
          eq(initiativeTable.id, route.initiativeId),
          eq(initiativeTable.organizationId, organizationId),
        ),
        columns: { id: true, name: true, leadBrandId: true },
      })
    : undefined;
  const account = route.accountId
    ? await db.query.performanceAccountTable.findFirst({
        where: and(
          eq(performanceAccountTable.id, route.accountId),
          eq(performanceAccountTable.organizationId, organizationId),
          isNull(performanceAccountTable.deletedAt),
        ),
        columns: { id: true, name: true, brandId: true, status: true },
      })
    : undefined;
  const brand =
    route.brandSlug || account?.brandId || initiative?.leadBrandId
      ? await db.query.brandTable.findFirst({
          where: and(
            eq(brandTable.organizationId, organizationId),
            isNull(brandTable.deletedAt),
            route.brandSlug
              ? or(
                  eq(brandTable.slug, route.brandSlug),
                  eq(brandTable.id, route.brandSlug),
                )
              : eq(
                  brandTable.id,
                  (account?.brandId ?? initiative!.leadBrandId)!,
                ),
          ),
          columns: {
            id: true,
            name: true,
            slug: true,
            featuredListingUrl: true,
          },
        })
      : undefined;
  // Brand pages under /app/performance carry the slug, not the account id.
  // Resolve the brand's account here so the agent is not left listing every
  // account to find it. Kept out of `label`, which names what the URL names.
  const brandAccount =
    !account && brand
      ? await db.query.performanceAccountTable.findFirst({
          where: and(
            eq(performanceAccountTable.brandId, brand.id),
            eq(performanceAccountTable.organizationId, organizationId),
            isNull(performanceAccountTable.deletedAt),
          ),
          columns: { id: true, name: true, brandId: true, status: true },
        })
      : undefined;
  const platformCampaign =
    brand && route.platformCampaignId
      ? await db.query.platformCampaignTable.findFirst({
          where: and(
            eq(platformCampaignTable.brandId, brand.id),
            eq(platformCampaignTable.id, route.platformCampaignId),
          ),
          columns: { id: true, campaignId: true, name: true },
        })
      : undefined;
  const campaignId = route.campaignId ?? platformCampaign?.campaignId;
  const campaign =
    brand && campaignId
      ? await db.query.campaignTable.findFirst({
          where: and(
            eq(campaignTable.id, campaignId),
            eq(campaignTable.brandId, brand.id),
          ),
          columns: { id: true, name: true },
        })
      : undefined;
  const home =
    brand && route.homeId
      ? await db.query.homeTable.findFirst({
          where: and(
            eq(homeTable.brandId, brand.id),
            or(
              eq(homeTable.id, route.homeId),
              eq(homeTable.externalId, route.homeId),
              eq(homeTable.propertyId, route.homeId),
            ),
          ),
          columns: { id: true, name: true },
        })
      : undefined;
  return {
    initiative: initiative ?? null,
    brand: brand ?? null,
    campaign: campaign ?? null,
    platformCampaign: platformCampaign ?? null,
    home: home ?? null,
    account: account ?? brandAccount ?? null,
    label:
      [
        initiative?.name,
        brand?.name,
        campaign?.name,
        platformCampaign?.name,
        home?.name,
        account?.name,
      ]
        .filter(Boolean)
        .join(" · ") || null,
  };
}
