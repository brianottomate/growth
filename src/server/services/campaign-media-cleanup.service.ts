import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { mediaAssetTable } from "@/server/db/schema";
import { deleteMedia } from "./media.service";

/** Provenance must identify an export owned by the deleted campaign, never a source photo. */
export function campaignOwnsExport(
  metadata: unknown,
  campaignId: string,
  adIds: string[],
): boolean {
  if (!metadata || typeof metadata !== "object" || !("adApproval" in metadata))
    return false;
  const approval = metadata.adApproval;
  if (!approval || typeof approval !== "object") return false;
  return (
    ("campaignId" in approval && approval.campaignId === campaignId) ||
    ("adId" in approval &&
      typeof approval.adId === "string" &&
      adIds.includes(approval.adId))
  );
}

export async function campaignExportCandidates(
  brandId: string,
  campaignId: string,
  adIds: string[],
) {
  const assets = await db.query.mediaAssetTable.findMany({
    where: and(
      eq(mediaAssetTable.brandId, brandId),
      sql`${mediaAssetTable.metadata}->'adApproval' is not null`,
    ),
  });
  return assets.filter((asset) =>
    campaignOwnsExport(asset.metadata, campaignId, adIds),
  );
}

/** The ad owns generated exports; supplied artwork has no matching provenance. */
export async function purgeAdExports(input: { adId: string; brandId: string }) {
  const assets = await db.query.mediaAssetTable.findMany({
    where: and(
      eq(mediaAssetTable.brandId, input.brandId),
      sql`${mediaAssetTable.metadata}->'adApproval'->>'adId' = ${input.adId}`,
    ),
  });
  return cleanupUnusedExports(assets);
}

export async function cleanupUnusedExports(
  assets: Awaited<ReturnType<typeof campaignExportCandidates>>,
) {
  let deleted = 0;
  let kept = 0;
  const errors: string[] = [];
  for (const asset of assets) {
    try {
      // Check after the owner clears its references. Retained platform media and source assets still count.
      // Text scanning also covers embedded JSON documents and direct URL reuse across brands.
      const references = await db.execute(sql`
        select 1 from (
          select to_jsonb(p)::text as payload from ad p
          union all select to_jsonb(p)::text from platform_ad p
          union all select to_jsonb(p)::text from platform_ad_set p
          union all select to_jsonb(p)::text from platform_campaign p
          union all select to_jsonb(p)::text from campaign p
          union all select to_jsonb(p)::text from content_post p
          union all select to_jsonb(p)::text from platform_post p
          union all select to_jsonb(p)::text from home p
          union all select to_jsonb(p)::text from home_media p
          union all select to_jsonb(p)::text from brand p
          union all select to_jsonb(p)::text from media_asset p where p.id <> ${asset.id}
        ) refs where position(${asset.id} in payload) > 0 or position(${asset.url} in payload) > 0
          or (${asset.r2Key ?? ""} <> '' and position(${asset.r2Key ?? ""} in payload) > 0) limit 1
      `);
      if (references.rows.length) {
        kept++;
        continue;
      }
      await deleteMedia(asset.id);
      deleted++;
    } catch (error) {
      kept++;
      errors.push(
        `Could not clean up ${asset.id}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      console.error("Export cleanup failed", asset.id, error);
    }
  }
  return { deleted, kept, errors };
}
