import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { adGoneOnPlatform } from "@/lib/platform-ad-plan";
import { deleteZernioAd } from "@/server/clients/zernio.client";
import { db, withTransaction } from "@/server/db";
import { brandTable } from "@/server/db/brand-schema";
import { platformAdTable, platformCampaignTable } from "@/server/db/ads-schema";

/**
 * Cancel one ad on its platform and mark its mirror row deleted. The row
 * stays as the record of what ran, with its stats. An ad the platform no
 * longer has is the outcome wanted, so a 404 counts as done.
 */
export async function cancelPlatformAd(row: {
  id: string;
  externalId: string;
  platformCampaignId: string;
}) {
  // Zernio takes the platform's own ad id here and deletes it there.
  await deleteZernioAd(row.externalId).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!/\b404\b|not found/i.test(message)) throw error;
  });
  return withTransaction(async (tx) => {
    const removed = await tx
      .update(platformAdTable)
      .set({ status: "deleted" })
      .where(
        and(
          eq(platformAdTable.id, row.id),
          sql`lower(coalesce(${platformAdTable.status}, '')) not in ('deleted','removed','cancelled','canceled')`,
        ),
      )
      .returning({ id: platformAdTable.id });
    if (!removed.length) return false;
    await tx
      .update(platformCampaignTable)
      .set({
        adCount: sql`greatest(${platformCampaignTable.adCount} - 1, 0)`,
      })
      .where(eq(platformCampaignTable.id, row.platformCampaignId));
    return true;
  });
}

/**
 * Take one ad out of a platform campaign, by its platform_ad id: the inverse
 * of adsWrite.pushAd. The plan ad and the rest of the campaign are untouched.
 */
export async function removePlatformAd(input: {
  platformAdId: string;
  organizationId: string;
}) {
  const row = await db.query.platformAdTable.findFirst({
    where: eq(platformAdTable.id, input.platformAdId),
    columns: {
      id: true,
      brandId: true,
      platformCampaignId: true,
      platform: true,
      externalId: true,
      status: true,
    },
  });
  const brand = row
    ? await db.query.brandTable.findFirst({
        where: eq(brandTable.id, row.brandId),
        columns: { organizationId: true },
      })
    : null;
  if (!row || brand?.organizationId !== input.organizationId)
    throw new Error("Platform ad not found");
  if (!row.externalId)
    throw new Error("This ad was never created on the platform");
  if (row.platform !== "meta_ads")
    throw new Error(
      "Removing one ad works on Meta only. Delete it in the platform, or delete the plan ad with adsWrite.deleteAdDraft.",
    );
  if (adGoneOnPlatform(row.status))
    return {
      platformAdId: row.id,
      externalAdId: row.externalId,
      removed: false,
    };
  const removed = await cancelPlatformAd({
    id: row.id,
    externalId: row.externalId,
    platformCampaignId: row.platformCampaignId,
  });
  return { platformAdId: row.id, externalAdId: row.externalId, removed };
}
