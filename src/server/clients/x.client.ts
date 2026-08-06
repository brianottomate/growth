import "server-only";

import { env } from "@/env";
import type { MediaItem, PostStats } from "@/server/db/content-schema";

/**
 * X (Twitter) API v2 client — app-only Bearer auth. This is the PRIMARY source
 * for Wander's X content (Zernio can't mirror X history; Apify scraping is the
 * fallback). Official, structured, and free for our own timeline reads.
 *
 * `GET /2/users/:id/tweets` returns the most recent ~3200 tweets, 100/page.
 * `exclude=retweets,replies` filters amplification/noise at the source.
 *
 * @see https://docs.x.com/x-api  (v2 reference)
 */
const X_API_BASE = "https://api.x.com/2";

export const isXConfigured = Boolean(env.X_BEARER_TOKEN);

async function xFetch<T>(path: string): Promise<T> {
  if (!env.X_BEARER_TOKEN) throw new Error("X_BEARER_TOKEN is not configured");
  const res = await fetch(`${X_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export type XUser = {
  id: string;
  username: string;
  name: string;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
  };
};

export async function getXUserByUsername(username: string): Promise<XUser> {
  const data = await xFetch<{ data: XUser }>(
    `/users/by/username/${encodeURIComponent(username.replace(/^@/, ""))}?user.fields=public_metrics`,
  );
  return data.data;
}

export type XPublicMetrics = {
  retweet_count?: number;
  reply_count?: number;
  like_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  impression_count?: number;
};

export type XMedia = {
  media_key: string;
  type: string; // photo | video | animated_gif
  url?: string; // photos
  preview_image_url?: string; // video poster
  width?: number;
  height?: number;
  duration_ms?: number;
  variants?: Array<{ bit_rate?: number; content_type?: string; url?: string }>;
};

export type XTweet = {
  id: string;
  text: string;
  created_at?: string;
  lang?: string;
  public_metrics?: XPublicMetrics;
  attachments?: { media_keys?: string[] };
  referenced_tweets?: Array<{ type: string; id: string }>;
  entities?: Record<string, unknown>;
};

const TWEET_FIELDS =
  "created_at,public_metrics,lang,entities,attachments,referenced_tweets";
const MEDIA_FIELDS =
  "type,url,preview_image_url,variants,width,height,duration_ms";

/** One page of a user's timeline, with media resolved by key. */
export async function getXUserTweets(options: {
  userId: string;
  maxResults?: number; // 5–100
  paginationToken?: string;
  sinceId?: string; // only tweets newer than this id (incremental sync)
  excludeRetweets?: boolean;
  excludeReplies?: boolean;
}): Promise<{
  tweets: XTweet[];
  media: Map<string, XMedia>;
  nextToken?: string;
}> {
  const exclude = [
    options.excludeRetweets !== false ? "retweets" : null,
    options.excludeReplies !== false ? "replies" : null,
  ]
    .filter(Boolean)
    .join(",");

  const params = new URLSearchParams({
    max_results: String(options.maxResults ?? 100),
    "tweet.fields": TWEET_FIELDS,
    expansions: "attachments.media_keys",
    "media.fields": MEDIA_FIELDS,
  });
  if (exclude) params.set("exclude", exclude);
  if (options.paginationToken)
    params.set("pagination_token", options.paginationToken);
  if (options.sinceId) params.set("since_id", options.sinceId);

  const data = await xFetch<{
    data?: XTweet[];
    includes?: { media?: XMedia[] };
    meta?: { next_token?: string; result_count?: number };
  }>(`/users/${options.userId}/tweets?${params}`);

  const media = new Map<string, XMedia>();
  for (const m of data.includes?.media ?? []) media.set(m.media_key, m);

  return {
    tweets: data.data ?? [],
    media,
    nextToken: data.meta?.next_token,
  };
}

/** Walk every page of a user's timeline (capped at ~3200 by the API). */
export async function getAllXUserTweets(options: {
  userId: string;
  sinceId?: string;
  excludeRetweets?: boolean;
  excludeReplies?: boolean;
  maxPages?: number;
}): Promise<{ tweets: XTweet[]; media: Map<string, XMedia> }> {
  const tweets: XTweet[] = [];
  const media = new Map<string, XMedia>();
  let token: string | undefined;
  const maxPages = options.maxPages ?? 35; // ~3500, above the 3200 cap

  for (let page = 0; page < maxPages; page++) {
    const res = await getXUserTweets({
      userId: options.userId,
      paginationToken: token,
      sinceId: options.sinceId,
      excludeRetweets: options.excludeRetweets,
      excludeReplies: options.excludeReplies,
    });
    tweets.push(...res.tweets);
    for (const [k, v] of res.media) media.set(k, v);
    if (!res.nextToken) break;
    token = res.nextToken;
  }

  return { tweets, media };
}

function xTweetMedia(tweet: XTweet, media: Map<string, XMedia>): MediaItem[] {
  const items: MediaItem[] = [];
  for (const key of tweet.attachments?.media_keys ?? []) {
    const m = media.get(key);
    if (!m) continue;
    if (m.type === "photo" && m.url) {
      items.push({
        url: m.url,
        type: "image",
        width: m.width,
        height: m.height,
      });
    } else if (m.type === "video" || m.type === "animated_gif") {
      const best = (m.variants ?? [])
        .filter((v) => v.content_type === "video/mp4" && v.url)
        .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0]?.url;
      if (best)
        items.push({
          url: best,
          type: "video",
          thumbnail: m.preview_image_url,
        });
    }
  }
  return items;
}

/**
 * Map an X tweet onto a `platform_post` insert (platform=x, source=scraped).
 * `username` is the handle (no '@'); pass the resolved channel when known.
 */
export function mapXTweetToPlatformPost(
  tweet: XTweet,
  media: Map<string, XMedia>,
  ctx: {
    brandId: string;
    channelId?: string;
    username?: string;
    scrapedAt?: Date;
  },
) {
  const pm = tweet.public_metrics ?? {};
  const stats: PostStats = {
    likes: pm.like_count,
    comments: pm.reply_count,
    shares: pm.retweet_count,
    views: pm.impression_count,
    saves: pm.bookmark_count,
  };

  return {
    brandId: ctx.brandId,
    channelId: ctx.channelId,
    platform: "x" as const,
    username: ctx.username,
    source: "scraped" as const,
    status: "published" as const,
    text: tweet.text,
    media: xTweetMedia(tweet, media),
    stats,
    externalId: tweet.id,
    externalUrl: ctx.username
      ? `https://x.com/${ctx.username}/status/${tweet.id}`
      : `https://x.com/i/status/${tweet.id}`,
    externalKind: "tweet",
    publishedAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
    scrapedAt: ctx.scrapedAt ?? new Date(),
    metadata: {
      lang: tweet.lang,
      quoteCount: pm.quote_count,
      referencedTweets: tweet.referenced_tweets,
    },
  };
}
