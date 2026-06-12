import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/brand-schema";
import { channelTable } from "@/server/db/channel-schema";
import {
  platformPostTable,
  type MediaItem,
} from "@/server/db/content-schema";
import {
  needsRehost,
  r2BuildPosterKey,
  r2PutFromUrl,
} from "@/server/clients/r2.client";
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

// Platforms we can mirror from Zernio (X comes from the X API; Meta Ads is ads).
const ZERNIO_PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok"] as const;

type PlatformPostInsert = typeof platformPostTable.$inferInsert;

// Copy posters off expiring/blocked CDNs (TikTok signed URLs, Facebook fbcdn)
// into R2 so feed thumbnails don't 404. Returns the rewritten media + how many
// items were re-hosted. On failure we keep the original URL (displayPoster
// nulls blocked hosts anyway) rather than failing the whole sync.
async function rehostPosters(
  media: MediaItem[] | null | undefined,
  brandId: string,
  externalId: string,
): Promise<{ media: MediaItem[] | null | undefined; n: number }> {
  if (!media?.length) return { media, n: 0 };
  let n = 0;
  const out = await Promise.all(
    media.map(async (m, i) => {
      const src = m.thumbnail ?? m.url;
      if (!src || !needsRehost(src)) return m;
      try {
        const key = r2BuildPosterKey(brandId, `${externalId}-${i}`);
        const url = await r2PutFromUrl(key, src);
        n++;
        // displayPoster reads `thumbnail ?? url`, so a poster here is enough.
        return { ...m, thumbnail: url };
      } catch {
        return m;
      }
    }),
  );
  return { media: out, n };
}

// Pull every Zernio analytics post for a platform over a window, walking pages
// until empty and de-duping by _id (pagination.total is unreliable).
async function pullZernioPlatform(
  platform: string,
  fromDate: string,
  toDate: string,
): Promise<ZernioAnalyticsPost[]> {
  const byId = new Map<string, ZernioAnalyticsPost>();
  for (let page = 1; page <= 20; page++) {
    const { posts } = await getZernioAnalytics({
      platform,
      fromDate,
      toDate,
      source: "external",
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
 * Pull Wander's real published content from Zernio (IG/FB/LinkedIn) + the X API
 * and upsert it into `platform_post` (source=scraped, isSeed=false default).
 * Idempotent: skips rows whose externalId already exists for the brand.
 */
export async function syncWanderContent(options?: {
  brandSlug?: string;
  monthsBack?: number;
  /** If set, overrides monthsBack — pull only the last N days. */
  daysBack?: number;
}): Promise<{
  brandId: string;
  candidates: number;
  inserted: number;
  skipped: number;
  rehosted: number;
  byPlatform: Record<string, number>;
  errors: string[];
}> {
  const brandSlug = options?.brandSlug ?? "wander";
  const monthsBack = options?.monthsBack ?? 6;
  const errors: string[] = [];

  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.slug, brandSlug),
  });
  if (!brand) throw new Error(`Brand "${brandSlug}" not found`);

  // Resolve channels for this brand → match by platform (+ externalId when set).
  const channels = await db.query.channelTable.findMany({
    where: eq(channelTable.brandId, brand.id),
  });
  const channelByPlatform = new Map<string, string>();
  for (const c of channels) {
    if (!channelByPlatform.has(c.platform)) channelByPlatform.set(c.platform, c.id);
  }
  const resolveChannelId = (platform: string) => channelByPlatform.get(platform);

  const toDate = new Date();
  const fromDate = new Date(toDate);
  if (options?.daysBack != null) {
    fromDate.setUTCDate(fromDate.getUTCDate() - options.daysBack);
  } else {
    fromDate.setUTCMonth(fromDate.getUTCMonth() - monthsBack);
  }
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const rows: PlatformPostInsert[] = [];

  // --- Zernio (IG / FB / LinkedIn) ---
  if (isZernioConfigured) {
    for (const platform of ZERNIO_PLATFORMS) {
      try {
        const posts = await pullZernioPlatform(platform, iso(fromDate), iso(toDate));
        for (const post of posts) {
          rows.push(
            ...mapZernioPostToPlatformPosts(post, {
              brandId: brand.id,
              resolveChannelId: (p) => resolveChannelId(p),
            }),
          );
        }
      } catch (e) {
        errors.push(`zernio:${platform}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    errors.push("zernio: not configured");
  }

  // --- X / Twitter (direct API) ---
  if (isXConfigured) {
    try {
      const handle = channels.find((c) => c.platform === "x")?.handle?.replace(/^@/, "") ?? "wander";
      const user = await getXUserByUsername(handle);
      const { tweets, media } = await getAllXUserTweets({ userId: user.id });
      for (const t of tweets) {
        rows.push(
          mapXTweetToPlatformPost(t, media, {
            brandId: brand.id,
            channelId: resolveChannelId("x"),
            username: user.username,
          }),
        );
      }
    } catch (e) {
      errors.push(`x: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    errors.push("x: not configured");
  }

  // --- Dedupe vs already-synced rows (by externalId for this brand) ---
  const candidateIds = rows.map((r) => r.externalId).filter((x): x is string => !!x);
  const existing = candidateIds.length
    ? await db
        .select({ externalId: platformPostTable.externalId })
        .from(platformPostTable)
        .where(
          and(
            eq(platformPostTable.brandId, brand.id),
            inArray(platformPostTable.externalId, candidateIds),
          ),
        )
    : [];
  const seen = new Set(existing.map((r) => r.externalId));

  const toInsert = rows.filter((r) => r.externalId && !seen.has(r.externalId));

  const byPlatform: Record<string, number> = {};
  for (const r of toInsert) byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + 1;

  // Re-host expiring/blocked posters → R2 (only the new rows we're inserting).
  // Bounded concurrency so a big backfill doesn't open hundreds of sockets.
  let rehosted = 0;
  for (let i = 0; i < toInsert.length; i += 8) {
    const batch = toInsert.slice(i, i + 8);
    await Promise.all(
      batch.map(async (row) => {
        const ext = row.externalId ?? row.id ?? row.platform;
        const r = await rehostPosters(row.media, brand.id, ext);
        row.media = r.media;
        rehosted += r.n;
      }),
    );
  }

  if (toInsert.length) {
    // Batch inserts to keep parameter counts sane.
    for (let i = 0; i < toInsert.length; i += 200) {
      await db.insert(platformPostTable).values(toInsert.slice(i, i + 200));
    }
  }

  return {
    brandId: brand.id,
    candidates: rows.length,
    inserted: toInsert.length,
    skipped: rows.length - toInsert.length,
    rehosted,
    byPlatform,
    errors,
  };
}

// Re-export so callers can map platforms consistently if needed.
export { mapZernioPlatform };
