import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/brand-schema";
import { channelTable } from "@/server/db/channel-schema";
import type { PlatformPostInsert } from "@/server/db/content-schema";
import {
  getZernioAnalytics,
  isZernioConfigured,
  mapZernioPlatform,
  mapZernioPostToPlatformPosts,
  type ZernioAnalyticsPost,
} from "@/server/clients/zernio.client";
import {
  getAllXUserTweets,
  getXUserByUsername,
  isXConfigured,
  mapXTweetToPlatformPost,
} from "@/server/clients/x.client";
import { ingestPlatformPosts } from "./platform-post-ingest.service";

// Every organic social surface Zernio exposes. Official APIs can supplement
// the same canonical rows when configured; Meta Ads remains in the ads model.
const ZERNIO_PLATFORMS = new Set([
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "x",
]);

// Pull every Zernio analytics post for a platform over a window, walking pages
// until empty and de-duping by _id (pagination.total is unreliable).
async function pullZernioAccount(
  platform: string,
  profileId: string,
  accountId: string,
  fromDate: string,
  toDate: string,
): Promise<ZernioAnalyticsPost[]> {
  const byId = new Map<string, ZernioAnalyticsPost>();
  for (let page = 1; page <= 20; page++) {
    const { posts } = await getZernioAnalytics({
      platform,
      profileId,
      accountId,
      fromDate,
      toDate,
      source: "all",
      limit: 50,
      page,
    });
    if (posts.length === 0) break;
    for (const p of posts) if (p._id) byId.set(p._id, p);
    if (posts.length < 50) break;
  }
  return [...byId.values()];
}

/**
 * Pull a brand's published content from Zernio (IG/FB/LinkedIn) + the X API
 * and upsert it into `platform_post` (source=scraped, isSeed=false default).
 * Idempotent: skips rows whose externalId already exists for the brand.
 */
export async function syncBrandContent(options: {
  brandSlug?: string;
  brandId?: string;
  monthsBack?: number;
  /** If set, overrides monthsBack — pull only the last N days. */
  daysBack?: number;
}): Promise<{
  brandId: string;
  candidates: number;
  inserted: number;
  updated: number;
  rehosted: number;
  byPlatform: Record<string, number>;
  errors: string[];
}> {
  if (!options.brandSlug && !options.brandId) {
    throw new Error("brandSlug or brandId is required");
  }
  const monthsBack = options.monthsBack ?? 6;
  const errors: string[] = [];

  const brand = await db.query.brandTable.findFirst({
    where: options.brandId
      ? eq(brandTable.id, options.brandId)
      : eq(brandTable.slug, options.brandSlug!),
  });
  if (!brand)
    throw new Error(
      `Brand "${options.brandId ?? options.brandSlug}" not found`,
    );

  // Resolve exact connected accounts for this brand. Platform-only matching is
  // intentionally forbidden because one workspace contains several brands.
  const channels = await db.query.channelTable.findMany({
    where: eq(channelTable.brandId, brand.id),
  });
  const zernioChannels = channels.filter(
    (channel) => channel.defaultProvider === "zernio" && channel.externalId,
  );
  const channelByExternalId = new Map(
    zernioChannels.map((channel) => [channel.externalId!, channel]),
  );
  const resolveChannelId = (platform: string, accountId?: string) => {
    if (!accountId) return undefined;
    const channel = channelByExternalId.get(accountId);
    return channel?.platform === platform ? channel.id : undefined;
  };

  const toDate = new Date();
  const fromDate = new Date(toDate);
  if (options.daysBack != null) {
    fromDate.setUTCDate(fromDate.getUTCDate() - options.daysBack);
  } else {
    fromDate.setUTCMonth(fromDate.getUTCMonth() - monthsBack);
  }
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const zernioRows: PlatformPostInsert[] = [];
  const xRows: PlatformPostInsert[] = [];

  // --- Zernio (IG / FB / LinkedIn) ---
  if (isZernioConfigured) {
    if (!brand.zernioProfileId) {
      errors.push("zernio: brand has no assigned Zernio profile");
    }
    for (const channel of zernioChannels) {
      if (!brand.zernioProfileId || !ZERNIO_PLATFORMS.has(channel.platform))
        continue;
      try {
        const posts = await pullZernioAccount(
          channel.platform,
          brand.zernioProfileId,
          channel.externalId!,
          iso(fromDate),
          iso(toDate),
        );
        for (const post of posts) {
          const mapped = mapZernioPostToPlatformPosts(post, {
            brandId: brand.id,
            resolveChannelId,
          });
          // A multi-platform Zernio post can contain sibling account entries.
          // Keep only the exact account requested by this iteration.
          zernioRows.push(
            ...mapped
              .filter((row) => row.channelId === channel.id)
              .map((row) => ({ ...row, ingestProvider: "zernio" })),
          );
        }
      } catch (e) {
        errors.push(
          `zernio:${channel.platform}:${channel.externalId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  } else {
    errors.push("zernio: not configured");
  }

  // --- X / Twitter (direct API) ---
  if (isXConfigured) {
    const xChannels = channels.filter((channel) => channel.platform === "x");
    if (xChannels.length === 0)
      errors.push("x: no X channel is configured for this brand");
    for (const channel of xChannels) {
      try {
        const handle = channel.handle?.replace(/^@/, "");
        if (!handle) throw new Error("channel has no handle");
        const user = await getXUserByUsername(handle);
        const { tweets, media } = await getAllXUserTweets({ userId: user.id });
        for (const t of tweets) {
          const mapped = mapXTweetToPlatformPost(t, media, {
            brandId: brand.id,
            channelId: channel.id,
            username: user.username,
          });
          if (!mapped.publishedAt || mapped.publishedAt >= fromDate) {
            xRows.push({ ...mapped, ingestProvider: "x_api" });
          }
        }
      } catch (e) {
        errors.push(
          `x:${channel.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  } else {
    // Zernio remains a valid X history source. The official API is an optional
    // richer supplement, not a prerequisite for syncing the connected channel.
  }

  const zernioResult = await ingestPlatformPosts({
    brandId: brand.id,
    ingestProvider: "zernio",
    rows: zernioRows,
  });
  const xResult = await ingestPlatformPosts({
    brandId: brand.id,
    ingestProvider: "x_api",
    rows: xRows,
  });
  const allRows = [...zernioRows, ...xRows];
  const byPlatform: Record<string, number> = {};
  for (const row of allRows)
    byPlatform[row.platform] = (byPlatform[row.platform] ?? 0) + 1;

  return {
    brandId: brand.id,
    candidates: zernioResult.candidates + xResult.candidates,
    inserted: zernioResult.inserted + xResult.inserted,
    updated: zernioResult.updated + xResult.updated,
    rehosted: zernioResult.rehosted + xResult.rehosted,
    byPlatform,
    errors,
  };
}

// Re-export so callers can map platforms consistently if needed.
export { mapZernioPlatform };
