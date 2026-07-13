import "server-only";

import { and, count, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  audienceTargetTable,
  brandInspirationTable,
  cadenceTargetTable,
  channelTable,
  contentPostTable,
  contentSuggestionTable,
  mediaAssetTable,
  mixTargetTable,
  platformPostTable,
  seriesTable,
  webPageTable,
} from "@/server/db/schema";

export type BrandSurfaceSummary = {
  channels: number;
  audienceTargets: number;
  webPages: number;
  blogPosts: number;
  mediaAssets: number;
  contentIdeas: number;
  series: number;
  pendingReviews: number;
  peers: number;
  hasStrategyTargets: boolean;
};

const countValue = (rows: { value: number }[]) => rows[0]?.value ?? 0;

/** Shared headline model for the visual Brand Map and assistant context. */
export async function getBrandSurfaceSummary(
  brandId: string,
  overrides: Partial<
    Pick<BrandSurfaceSummary, "peers" | "hasStrategyTargets">
  > = {},
): Promise<BrandSurfaceSummary> {
  const counts = await Promise.all([
    db
      .select({ value: count() })
      .from(channelTable)
      .where(
        and(eq(channelTable.brandId, brandId), isNull(channelTable.deletedAt)),
      ),
    db
      .select({ value: count() })
      .from(audienceTargetTable)
      .where(eq(audienceTargetTable.brandId, brandId)),
    db
      .select({ value: count() })
      .from(webPageTable)
      .where(
        and(eq(webPageTable.brandId, brandId), eq(webPageTable.isActive, true)),
      ),
    db
      .select({ value: count() })
      .from(platformPostTable)
      .where(
        and(
          eq(platformPostTable.brandId, brandId),
          eq(platformPostTable.externalKind, "blog_article"),
        ),
      ),
    db
      .select({ value: count() })
      .from(mediaAssetTable)
      .where(
        and(
          eq(mediaAssetTable.brandId, brandId),
          isNull(mediaAssetTable.deletedAt),
        ),
      ),
    db
      .select({ value: count() })
      .from(contentPostTable)
      .where(
        and(
          eq(contentPostTable.brandId, brandId),
          isNull(contentPostTable.deletedAt),
        ),
      ),
    db
      .select({ value: count() })
      .from(seriesTable)
      .where(
        and(eq(seriesTable.brandId, brandId), isNull(seriesTable.deletedAt)),
      ),
    db
      .select({ value: count() })
      .from(contentSuggestionTable)
      .where(
        and(
          eq(contentSuggestionTable.brandId, brandId),
          eq(contentSuggestionTable.kind, "grouping"),
          eq(contentSuggestionTable.status, "pending"),
        ),
      ),
    db
      .select({ value: count() })
      .from(brandInspirationTable)
      .where(eq(brandInspirationTable.brandId, brandId)),
    db
      .select({ value: count() })
      .from(cadenceTargetTable)
      .where(
        and(
          eq(cadenceTargetTable.brandId, brandId),
          eq(cadenceTargetTable.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(mixTargetTable)
      .where(
        and(
          eq(mixTargetTable.brandId, brandId),
          eq(mixTargetTable.isActive, true),
        ),
      ),
  ]);

  return {
    channels: countValue(counts[0]),
    audienceTargets: countValue(counts[1]),
    webPages: countValue(counts[2]),
    blogPosts: countValue(counts[3]),
    mediaAssets: countValue(counts[4]),
    contentIdeas: countValue(counts[5]),
    series: countValue(counts[6]),
    pendingReviews: countValue(counts[7]),
    peers: overrides.peers ?? countValue(counts[8]),
    hasStrategyTargets:
      overrides.hasStrategyTargets ??
      countValue(counts[9]) + countValue(counts[10]) > 0,
  };
}
