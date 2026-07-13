import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db, withTransaction } from "@/server/db";
import {
  mediaAssetTable,
  mediaAssetTagTable,
  mediaTagTable,
} from "@/server/db/schema";
import { analyzeMediaImage } from "./media-analysis.service";

/** Shared persistence workflow used by the library UI, chat, and MCP. */
export async function analyzeStoredMediaAsset(input: {
  mediaId: string;
  brandName: string;
  steer?: string;
}) {
  const asset = await db.query.mediaAssetTable.findFirst({
    where: eq(mediaAssetTable.id, input.mediaId),
  });
  if (asset?.kind !== "image" || !asset.url) {
    throw new Error("Only ready images can be analyzed.");
  }
  const managedTags = await db.query.mediaTagTable.findMany({
    where: eq(mediaTagTable.brandId, asset.brandId),
    orderBy: [asc(mediaTagTable.name)],
  });
  const analysis = await analyzeMediaImage({
    url: asset.url,
    brandName: input.brandName,
    tags: managedTags.map((tag) => ({
      name: tag.name,
      description: tag.description,
    })),
    steer: input.steer,
  });
  const tagIdByName = new Map(
    managedTags.map((tag) => [tag.name.toLowerCase(), tag.id] as const),
  );
  const aiTagIds = analysis.tags
    .map((name) => tagIdByName.get(name.toLowerCase()))
    .filter((id): id is string => Boolean(id));
  const metadata =
    asset.metadata && typeof asset.metadata === "object"
      ? (asset.metadata as Record<string, unknown>)
      : {};

  await withTransaction(async (tx) => {
    await tx
      .delete(mediaAssetTagTable)
      .where(
        and(
          eq(mediaAssetTagTable.mediaAssetId, asset.id),
          eq(mediaAssetTagTable.source, "ai"),
        ),
      );
    if (aiTagIds.length > 0) {
      await tx.insert(mediaAssetTagTable).values(
        aiTagIds.map((tagId) => ({
          mediaAssetId: asset.id,
          tagId,
          source: "ai" as const,
        })),
      );
    }
    await tx
      .update(mediaAssetTable)
      .set({
        title: asset.title || analysis.name,
        alt: asset.alt || analysis.altText,
        metadata: { ...metadata, aiAnalysis: analysis },
      })
      .where(eq(mediaAssetTable.id, asset.id));
  });

  return analysis;
}
