import "server-only";

import { runActor, isApifyConfigured } from "@/server/clients/apify.client";
import type { MediaItem, PostStats } from "@/server/db/content-schema";

/**
 * Twitter/X scraping via the Apify `apidojo/tweet-scraper` actor — the fallback
 * for X history that Zernio can't mirror (X read access is API-tier gated; see
 * docs/zernio-platform-post-mapping.md).
 *
 * ⚠️ Plan constraint: this actor is **API-blocked for Apify Free accounts**
 * (console/demo-mode only, 10-item cap). `scrapeTweets` will only work once the
 * org's Apify plan is upgraded. `isTweetScrapingAvailable` guards the feature.
 *
 * Actor: https://apify.com/apidojo/tweet-scraper  ($0.40/1k tweets, min 50/query)
 */
export const isTweetScrapingAvailable = isApifyConfigured;

const TWEET_SCRAPER_ACTOR = "apidojo/tweet-scraper";

// Shape verified against a real `from:wander` run (2026-06). Only the fields we
// map are typed; the actor returns much more (author profile, entities, etc.).
type ApifyTweetMedia = {
  type?: string; // photo | video | animated_gif
  media_url_https?: string;
  url?: string;
  video_info?: {
    variants?: Array<{ bitrate?: number; content_type?: string; url?: string }>;
  };
  original_info?: { width?: number; height?: number };
};

export type ApifyTweet = {
  type?: string;
  id?: string;
  url?: string;
  twitterUrl?: string;
  text?: string;
  fullText?: string;
  createdAt?: string; // "Wed May 27 21:32:22 +0000 2026"
  lang?: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
  viewCount?: number;
  bookmarkCount?: number;
  isReply?: boolean;
  isRetweet?: boolean;
  isQuote?: boolean;
  conversationId?: string;
  author?: { userName?: string; id?: string; name?: string };
  extendedEntities?: { media?: ApifyTweetMedia[] };
  entities?: { media?: ApifyTweetMedia[] };
  retweet?: ApifyTweet;
  [key: string]: unknown;
};

/**
 * Scrape a handle's tweets. Builds a Twitter advanced-search query and runs the
 * actor to completion. Defaults exclude retweets so you get the account's OWN
 * content (RTs are amplification, not authored posts).
 *
 * The actor requires ≥50 results per query — narrow `since`/`until` windows that
 * return fewer may come back short (it returns raw data as Twitter serves it).
 */
export async function scrapeTweets(options: {
  handle: string; // without the @
  since?: string; // YYYY-MM-DD
  until?: string; // YYYY-MM-DD
  maxItems?: number;
  includeRetweets?: boolean;
  includeReplies?: boolean;
  sort?: "Latest" | "Top";
}): Promise<ApifyTweet[]> {
  const filters: string[] = [`from:${options.handle.replace(/^@/, "")}`];
  if (!options.includeRetweets) filters.push("-filter:retweets");
  if (!options.includeReplies) filters.push("-filter:replies");
  if (options.since) filters.push(`since:${options.since}`);
  if (options.until) filters.push(`until:${options.until}`);

  return runActor<ApifyTweet>(TWEET_SCRAPER_ACTOR, {
    searchTerms: [filters.join(" ")],
    sort: options.sort ?? "Latest",
    ...(options.maxItems ? { maxItems: options.maxItems } : {}),
  });
}

// Pick the highest-bitrate mp4 for a video; fall back to the poster image.
function tweetMedia(tweet: ApifyTweet): MediaItem[] {
  const raw = tweet.extendedEntities?.media ?? tweet.entities?.media ?? [];
  const items: MediaItem[] = [];
  for (const m of raw) {
    if (m.type === "photo") {
      if (m.media_url_https)
        items.push({
          url: m.media_url_https,
          type: "image",
          width: m.original_info?.width,
          height: m.original_info?.height,
        });
    } else if (m.type === "video" || m.type === "animated_gif") {
      const mp4s = (m.video_info?.variants ?? [])
        .filter((v) => v.content_type === "video/mp4" && v.url)
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const best = mp4s[0]?.url;
      if (best)
        items.push({ url: best, type: "video", thumbnail: m.media_url_https });
    }
  }
  return items;
}

/**
 * Map a scraped tweet onto a `platform_post` insert (source=scraped). For
 * retweets the original content lives under `tweet.retweet`; callers usually
 * filter RTs out via the default query, but if one slips through we surface the
 * RT's text so the row isn't a truncated "RT @x …".
 */
export function mapTweetToPlatformPost(
  tweet: ApifyTweet,
  ctx: { brandId: string; channelId?: string; scrapedAt?: Date },
): {
  brandId: string;
  channelId?: string;
  platform: "x";
  username?: string;
  source: "scraped";
  status: "published";
  text?: string;
  media?: MediaItem[];
  stats?: PostStats;
  externalId?: string;
  externalUrl?: string;
  externalKind: string;
  publishedAt?: Date;
  scrapedAt: Date;
  metadata: Record<string, unknown>;
} {
  const original = tweet.isRetweet && tweet.retweet ? tweet.retweet : tweet;
  const publishedAt = tweet.createdAt ? new Date(tweet.createdAt) : undefined;

  const stats: PostStats = {
    likes: tweet.likeCount,
    comments: tweet.replyCount,
    shares: tweet.retweetCount,
    views: tweet.viewCount,
    saves: tweet.bookmarkCount,
  };

  return {
    brandId: ctx.brandId,
    channelId: ctx.channelId,
    platform: "x",
    username: tweet.author?.userName,
    source: "scraped",
    status: "published",
    text: original.fullText ?? original.text ?? tweet.text,
    media: tweetMedia(original),
    stats,
    externalId: tweet.id,
    externalUrl: tweet.url ?? tweet.twitterUrl,
    externalKind: tweet.isRetweet
      ? "retweet"
      : tweet.isQuote
        ? "quote"
        : "tweet",
    publishedAt,
    scrapedAt: ctx.scrapedAt ?? new Date(),
    metadata: {
      lang: tweet.lang,
      quoteCount: tweet.quoteCount,
      conversationId: tweet.conversationId,
      isReply: tweet.isReply,
      isRetweet: tweet.isRetweet,
      isQuote: tweet.isQuote,
      scraper: TWEET_SCRAPER_ACTOR,
    },
  };
}
