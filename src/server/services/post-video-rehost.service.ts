import "server-only";

import { and, desc, eq, isNotNull } from "drizzle-orm";

import { db } from "../db";
import { R2 } from "../clients/r2.client";
import {
  type ChannelPlatform,
  type MediaItem,
  platformPostTable,
} from "../db/schema";

/**
 * Copy reel/video bytes out of the provider CDN and into R2.
 *
 * Ingest already rehosts the poster, so a video post shows a durable thumbnail
 * and then fails the moment anyone presses play: `media[].url` still points at
 * `scontent.cdninstagram.com`, whose URLs are signed and expire in weeks. The
 * poster is regenerable from the provider, the video is not, so once that link
 * dies the only copy of what we published is on Instagram.
 *
 * Deliberately NOT part of `stabilizeMedia`. Posters are tens of KB and every
 * post gets one; videos are megabytes each and land in memory on the way
 * through, so this is a bounded pass over the newest posts rather than a step in
 * a sync that walks hundreds.
 */

const DEFAULT_LIMIT = 4;
const MAX_VIDEO_BYTES = 200_000_000;

function extensionFor(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = /\.(mp4|mov|m4v|webm)$/i.exec(path);
    return match ? match[1]!.toLowerCase() : "mp4";
  } catch {
    return "mp4";
  }
}

/** A video item still served from a host whose URLs expire or block embeds. */
function needsVideoRehost(item: MediaItem): boolean {
  return (
    item.type === "video" &&
    Boolean(item.url) &&
    !R2.isPublicUrl(item.url) &&
    R2.needsRehost(item.url)
  );
}

/**
 * Provider media URLs run to several hundred characters of signature. Logged
 * raw they bury the one thing worth reading, which is almost always that the
 * signature is stale rather than that anything is broken on our side.
 */
function compactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const stripped = message.replace(/https?:\/\/\S+/g, (url) => {
    try {
      return new URL(url).hostname;
    } catch {
      return "the source URL";
    }
  });
  if (/\b(403|410)\b/.test(message)) {
    return `${stripped} — the provider's signed URL has expired, so those bytes are no longer fetchable from here.`;
  }
  return stripped.slice(0, 200);
}

export async function rehostRecentPostVideos(input: {
  brandId: string;
  platform?: ChannelPlatform;
  limit?: number;
}): Promise<{
  scanned: number;
  rehosted: {
    platformPostId: string;
    externalUrl: string | null;
    videos: string[];
  }[];
  failed: { platformPostId: string; error: string }[];
}> {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const posts = await db
    .select({
      id: platformPostTable.id,
      externalId: platformPostTable.externalId,
      externalUrl: platformPostTable.externalUrl,
      media: platformPostTable.media,
      publishedAt: platformPostTable.publishedAt,
    })
    .from(platformPostTable)
    .where(
      and(
        eq(platformPostTable.brandId, input.brandId),
        input.platform
          ? eq(platformPostTable.platform, input.platform)
          : undefined,
        isNotNull(platformPostTable.publishedAt),
      ),
    )
    .orderBy(desc(platformPostTable.publishedAt));

  const candidates = posts
    .filter((post) => (post.media ?? []).some(needsVideoRehost))
    .slice(0, limit);

  const rehosted: {
    platformPostId: string;
    externalUrl: string | null;
    videos: string[];
  }[] = [];
  const failed: { platformPostId: string; error: string }[] = [];

  for (const post of candidates) {
    try {
      const moved: string[] = [];
      const media = await Promise.all(
        (post.media ?? []).map(async (item, index) => {
          if (!needsVideoRehost(item)) return item;
          const url = await R2.putFromUrl(
            R2.buildPostVideoKey(
              input.brandId,
              `${post.externalId ?? post.id}-${index}`,
              extensionFor(item.url),
            ),
            item.url,
            { fallbackContentType: "video/mp4", maxBytes: MAX_VIDEO_BYTES },
          );
          moved.push(url);
          return { ...item, url };
        }),
      );
      if (!moved.length) continue;
      await db
        .update(platformPostTable)
        .set({ media })
        .where(eq(platformPostTable.id, post.id));
      rehosted.push({
        platformPostId: post.id,
        externalUrl: post.externalUrl,
        videos: moved,
      });
    } catch (error) {
      // One oversized or expired video must not abort the rest of the batch.
      failed.push({ platformPostId: post.id, error: compactError(error) });
    }
  }

  return { scanned: candidates.length, rehosted, failed };
}
