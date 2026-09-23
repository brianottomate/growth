import "server-only";

import { and, count, desc, eq, max, sql } from "drizzle-orm";

import { isApifyConfigured, runActor } from "@/server/clients/apify.client";
import {
  isBrightDataConfigured,
  runScrape,
} from "@/server/clients/brightdata.client";
import {
  getAllXUserTweets,
  getXUserByUsername,
  mapXTweetToPlatformPost,
} from "@/server/clients/x.client";
import { classify } from "@/server/content/classify";
import { classifyFormatFromFields } from "@/server/content/formats";
import { db } from "@/server/db";
import {
  channelTable,
  contentIngestRunTable,
  contentSuggestionTable,
  platformPostTable,
  type MediaItem,
  type PlatformPostInsert,
  type PostStats,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import {
  failContentIngestRun,
  finishContentIngestRun,
  ingestPlatformPosts,
  startContentIngestRun,
} from "./platform-post-ingest.service";

/**
 * Peer/own social scrape → platform_post → AI suggestions.
 *
 * Mappers turn raw Bright Data records into platform_post inserts (deterministic
 * format/archetype + amplification signal). `processRecords` then dedups, inserts
 * as `source="scraped"`, and — for each new post — writes PENDING
 * `content_suggestion` rows: a classification (template via classify()) and, for
 * reposts/quotes, an amplification edge resolved against existing platform_posts
 * (cross-brand: founder↔corporate). Nothing is auto-applied; a human confirms.
 *
 * Field shapes verified against docs/brightdata-peer-scraping.md + live dumps.
 */

// ---- raw record + mapping ------------------------------------------

/** Platforms with a Bright Data dataset mapper wired into this pipeline. */
export const SCRAPE_PLATFORMS = [
  "linkedin",
  "x",
  "instagram",
  "facebook",
] as const;
export type ScrapePlatform = (typeof SCRAPE_PLATFORMS)[number];
export type PeerScrapeProvider = "brightdata" | "apify";

type Raw = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === "number" ? v : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const urlOf = (v: unknown): string | undefined =>
  typeof v === "string" ? v : str((v as Raw)?.url);

/** A mapped insert kept alongside its raw record so we can classify it after. */
type Mapped = { insert: PlatformPostInsert; raw: Raw; cover?: string };

function linkedinMedia(rec: Raw): { media: MediaItem[]; cover?: string } {
  const media: MediaItem[] = [];
  for (const i of arr(rec.images)) {
    const url = urlOf(i);
    if (url) media.push({ url, type: "image" });
  }
  for (const v of arr(rec.videos)) {
    const url = urlOf(v);
    if (url)
      media.push({ url, type: "video", thumbnail: str(rec.video_thumbnail) });
  }
  const cover =
    media.find((m) => m.type === "image")?.url ?? str(rec.video_thumbnail);
  return { media, cover };
}

export function mapLinkedInRecord(rec: Raw, brandId: string): Mapped | null {
  // Discovery-error rows (record 0 is often {error, error_code}).
  if (rec.error || !str(rec.id)) return null;

  const { media, cover } = linkedinMedia(rec);
  const fmt = classifyFormatFromFields("linkedin", rec);
  const isRepost = rec.post_type === "repost";
  const repost = (rec.repost ?? {}) as Raw;

  const insert: PlatformPostInsert = {
    id: createId("pp"),
    brandId,
    platform: "linkedin",
    username: str(rec.user_id),
    source: "scraped",
    status: "published",
    format: fmt.format,
    archetype: fmt.archetype,
    text: str(rec.post_text) ?? str(rec.original_post_text),
    media: media.length ? media : undefined,
    stats: { likes: num(rec.num_likes), comments: num(rec.num_comments) },
    externalId: str(rec.id),
    externalUrl: str(rec.url),
    externalKind: isRepost ? "repost" : "post",
    amplifiedFrom: isRepost
      ? {
          externalId: str(repost.repost_id),
          externalUrl: str(repost.repost_url),
          // repost_user_id is often null on personal reposts; fall back to name.
          username: str(repost.repost_user_id) ?? str(repost.repost_user_name),
          platform: "linkedin",
        }
      : undefined,
    publishedAt: str(rec.date_posted)
      ? new Date(str(rec.date_posted)!)
      : undefined,
    scrapedAt: new Date(),
    metadata: { hashtags: rec.hashtags, taggedCompanies: rec.tagged_companies },
  };
  return { insert, raw: rec, cover };
}

export function mapXRecord(rec: Raw, brandId: string): Mapped | null {
  if (rec.error || !str(rec.id)) return null;

  const media: MediaItem[] = [];
  for (const p of arr(rec.photos)) {
    const url = urlOf(p);
    if (url) media.push({ url, type: "image" });
  }
  for (const v of arr(rec.videos)) {
    const url = urlOf((v as Raw)?.video_url ?? v);
    if (url) media.push({ url, type: "video" });
  }
  const fmt = classifyFormatFromFields("x", rec);
  const quoted = (rec.quoted_post ?? {}) as Raw;
  const isRepost = rec.is_repost === true;
  // BD returns an (empty) quoted_post object on every tweet — only a real quote
  // carries an id. (NB: BD X discovery is blind to reposts anyway; X
  // amplification comes from the X API via ingestXViaApi.)
  const isQuote = !isRepost && !!str(quoted.id);
  const externalKind = isRepost ? "repost" : isQuote ? "quote" : "tweet";

  const insert: PlatformPostInsert = {
    id: createId("pp"),
    brandId,
    platform: "x",
    username: str(rec.user_posted),
    source: "scraped",
    status: "published",
    format: fmt.format,
    archetype: fmt.archetype,
    text: str(rec.description),
    media: media.length ? media : undefined,
    stats: {
      likes: num(rec.likes),
      comments: num(rec.replies),
      shares: num(rec.reposts),
      views: num(rec.views),
      saves: num(rec.bookmarks),
    },
    externalId: str(rec.id),
    externalUrl: str(rec.url),
    externalKind,
    amplifiedFrom:
      isRepost || isQuote
        ? {
            externalId: str(quoted.id),
            externalUrl: str(quoted.url),
            username: str(quoted.user_posted) ?? str(rec.quoted_user),
            platform: "x",
          }
        : undefined,
    publishedAt: str(rec.date_posted)
      ? new Date(str(rec.date_posted)!)
      : undefined,
    scrapedAt: new Date(),
    metadata: { hashtags: rec.hashtags },
  };
  return {
    insert,
    raw: rec,
    cover: media.find((m) => m.type === "image")?.url,
  };
}

export function mapInstagramRecord(rec: Raw, brandId: string): Mapped | null {
  // Accept both Bright Data's nested profile-post shape and Apify's post shape.
  if (rec.error || !str(rec.id)) return null;

  const imageUrl = str(rec.image_url) ?? str(rec.displayUrl);
  const media: MediaItem[] = [];
  const childPosts = arr(rec.childPosts) as Raw[];
  const mediaRecords = childPosts.length ? childPosts : [rec];
  for (const item of mediaRecords) {
    const childImage =
      str(item.image_url) ?? str(item.displayUrl) ?? str(item.thumbnailUrl);
    const childVideo = str(item.video_url) ?? str(item.videoUrl);
    if (childVideo) {
      media.push({
        url: childVideo,
        type: "video",
        thumbnail: childImage,
        width: num(item.dimensionsWidth),
        height: num(item.dimensionsHeight),
      });
    } else if (childImage) {
      media.push({
        url: childImage,
        type: "image",
        width: num(item.dimensionsWidth),
        height: num(item.dimensionsHeight),
      });
    }
  }
  // Some Apify records expose carousel images as a flat images[] array.
  if (!childPosts.length) {
    for (const image of arr(rec.images)) {
      const url = urlOf(image);
      if (url && !media.some((item) => item.url === url)) {
        media.push({ url, type: "image" });
      }
    }
  }

  const fmt = classifyFormatFromFields("instagram", rec);
  const insert: PlatformPostInsert = {
    id: createId("pp"),
    brandId,
    platform: "instagram",
    username: str(rec.account) ?? str(rec.ownerUsername),
    source: "scraped",
    status: "published",
    format: fmt.format,
    archetype: fmt.archetype,
    text: str(rec.caption),
    media: media.length ? media : undefined,
    stats: {
      likes: num(rec.likes) ?? num(rec.likesCount),
      comments: num(rec.comments) ?? num(rec.commentsCount),
    },
    externalId: str(rec.id),
    externalUrl: str(rec.url) ?? str(rec.inputUrl),
    externalKind: "post",
    publishedAt: str(rec.datetime ?? rec.timestamp)
      ? new Date(str(rec.datetime ?? rec.timestamp)!)
      : undefined,
    scrapedAt: new Date(),
    metadata: {
      hashtags: rec.post_hashtags ?? rec.hashtags,
      contentType: rec.content_type ?? rec.type,
      location: rec.location,
    },
  };
  return {
    insert,
    raw: rec,
    cover: media.find((item) => item.type === "image")?.url ?? imageUrl,
  };
}

export function mapFacebookRecord(rec: Raw, brandId: string): Mapped | null {
  if (rec.error || !str(rec.post_id)) return null;

  const media: MediaItem[] = [];
  for (const a of arr(rec.attachments)) {
    const url = urlOf(a);
    if (url) {
      const type = (a as Raw)?.type === "Video" ? "video" : "image";
      media.push({ url, type });
    }
  }
  if (!media.length) {
    const img =
      str(rec.post_image) ??
      str(rec.post_external_image) ??
      str(rec.header_image);
    if (img) media.push({ url: img, type: "image" });
  }

  const fmt = classifyFormatFromFields("facebook", rec);
  const insert: PlatformPostInsert = {
    id: createId("pp"),
    brandId,
    platform: "facebook",
    username: str(rec.page_name) ?? str(rec.profile_handle),
    source: "scraped",
    status: "published",
    format: fmt.format,
    archetype: fmt.archetype,
    text: str(rec.content),
    media: media.length ? media : undefined,
    stats: {
      likes: num(rec.likes) ?? num((rec.num_likes_type as Raw)?.num),
      comments: num(rec.num_comments),
      shares: num(rec.num_shares),
      views: num(rec.video_view_count) ?? num(rec.play_count),
    },
    externalId: str(rec.post_id),
    externalUrl: str(rec.url),
    externalKind: "post",
    publishedAt: str(rec.date_posted)
      ? new Date(str(rec.date_posted)!)
      : undefined,
    scrapedAt: new Date(),
    metadata: {
      hashtags: rec.hashtags,
      reactions: rec.count_reactions_type,
      isSponsored: rec.is_sponsored,
    },
  };
  return {
    insert,
    raw: rec,
    cover: media.find((m) => m.type === "image")?.url,
  };
}

const MAPPERS: Record<
  ScrapePlatform,
  (rec: Raw, brandId: string) => Mapped | null
> = {
  linkedin: mapLinkedInRecord,
  x: mapXRecord,
  instagram: mapInstagramRecord,
  facebook: mapFacebookRecord,
};

// ---- process: dedup → insert → suggest -----------------------------

export type ProcessResult = {
  scanned: number;
  inserted: number;
  skippedExisting: number;
  updatedExisting: number;
  rehosted: number;
  classificationSuggestions: number;
  amplificationSuggestions: number;
  amplificationResolved: number;
};
export type PeerScrapeResult = ProcessResult & { provider: PeerScrapeProvider };

export async function processRecords(opts: {
  brandId: string;
  platform: ScrapePlatform;
  records: Raw[];
  skipTemplate?: boolean;
  /** Drop dated posts older than this — the hard 30-day bound. */
  cutoff?: Date;
  ingestProvider?: "brightdata" | "apify" | "x_api";
}): Promise<ProcessResult> {
  const map = MAPPERS[opts.platform];
  if (!map) throw new Error(`no mapper for ${opts.platform}`);
  let mapped = opts.records
    .map((r) => map(r, opts.brandId))
    .filter((m): m is Mapped => m !== null);
  if (opts.cutoff) {
    const c = opts.cutoff;
    mapped = mapped.filter(
      (m) => !m.insert.publishedAt || m.insert.publishedAt >= c,
    );
  }
  return processMapped({
    brandId: opts.brandId,
    platform: opts.platform,
    mapped,
    scanned: opts.records.length,
    skipTemplate: opts.skipTemplate,
    ingestProvider: opts.ingestProvider,
  });
}

/** Core: dedup → insert → pending suggestions, for already-mapped rows.
 *  Shared by the Bright Data path (processRecords) and the X API path. */
async function processMapped(opts: {
  brandId: string;
  platform: ScrapePlatform;
  mapped: Mapped[];
  scanned: number;
  skipTemplate?: boolean;
  ingestProvider?: "brightdata" | "apify" | "x_api";
}): Promise<ProcessResult> {
  const mapped = opts.mapped;

  const ingest = await ingestPlatformPosts({
    brandId: opts.brandId,
    ingestProvider: opts.ingestProvider ?? "brightdata",
    rows: mapped.map((m) => m.insert),
  });
  const insertedIds = new Set(ingest.insertedIds);
  const fresh = mapped.filter(
    (m) => m.insert.id && insertedIds.has(m.insert.id),
  );

  const result: ProcessResult = {
    scanned: opts.scanned,
    inserted: ingest.inserted,
    skippedExisting: 0,
    updatedExisting: ingest.updated,
    rehosted: ingest.rehosted,
    classificationSuggestions: 0,
    amplificationSuggestions: 0,
    amplificationResolved: 0,
  };
  if (!fresh.length) return result;

  for (const m of fresh) {
    const postId = m.insert.id!;

    // 1) classification suggestion (template is the AI judgment; format/
    //    archetype are already set deterministically on the post).
    const c = await classify({
      platform: opts.platform,
      fields: m.raw,
      imageUrl: m.cover,
      text: m.insert.text ?? undefined,
    });
    await db.insert(contentSuggestionTable).values({
      brandId: opts.brandId,
      kind: "classification",
      subjectPostId: postId,
      proposed: {
        format: c.format,
        archetype: c.archetype,
        template: c.template,
      },
      confidence: c.confidence,
      reasoning: `auto-classified (${c.source})`,
      source: "peer-scrape",
    });
    result.classificationSuggestions++;

    // 2) amplification suggestion (repost/quote → resolve original).
    const amp = m.insert.amplifiedFrom;
    if (amp?.externalId || amp?.username) {
      let targetPostId: string | undefined;
      if (amp.externalId) {
        const [hit] = await db
          .select({ id: platformPostTable.id })
          .from(platformPostTable)
          .where(eq(platformPostTable.externalId, amp.externalId))
          .limit(1);
        targetPostId = hit?.id;
      }
      const confidence = targetPostId ? 0.9 : 0.5;
      if (targetPostId) result.amplificationResolved++;
      await db.insert(contentSuggestionTable).values({
        brandId: opts.brandId,
        kind: "amplification",
        subjectPostId: postId,
        targetPostId,
        targetRef: amp,
        proposed: {
          linkKind: m.insert.externalKind === "quote" ? "quotes" : "reposts",
        },
        confidence,
        reasoning: `${opts.platform} ${m.insert.externalKind} of @${amp.username ?? "?"}${
          targetPostId ? " — matched an existing post" : " — original not in DB"
        }`,
        source: "peer-scrape",
      });
      result.amplificationSuggestions++;
    }
  }

  return result;
}

// ---- scrape + process ----------------------------------------------

const SCRAPER_KEY = {
  linkedin: "linkedinPosts",
  x: "xPosts",
  instagram: "instagramProfile",
  facebook: "facebookPosts",
} as const;

/** Pick the richest configured provider that supports this platform. */
export function peerScrapeProviderFor(
  platform: ScrapePlatform,
): PeerScrapeProvider | null {
  if (isBrightDataConfigured) return "brightdata";
  // The maintained Instagram actor returns post text, engagement, timestamps,
  // and every childPosts item for carousels, which our shared mapper preserves.
  if (isApifyConfigured && platform === "instagram") return "apify";
  return null;
}

/** Resolve a brand's profile URL for a platform from its channel row. */
export async function profileUrlForBrand(
  brandId: string,
  platform: ScrapePlatform,
): Promise<string | null> {
  const [chan] = await db
    .select({ url: channelTable.profileUrl, handle: channelTable.handle })
    .from(channelTable)
    .where(
      and(
        eq(channelTable.brandId, brandId),
        eq(channelTable.platform, platform),
      ),
    )
    .limit(1);
  return chan?.url ?? null;
}

export async function scrapeAndSuggest(opts: {
  brandId: string;
  platform: ScrapePlatform;
  profileUrl: string;
  limit?: number;
  /** How many days back to keep (hard bound, default 30). */
  sinceDays?: number;
  skipTemplate?: boolean;
  provider?: PeerScrapeProvider;
}): Promise<PeerScrapeResult> {
  const limit = opts.limit ?? 30;
  const sinceDays = opts.sinceDays ?? 30;
  const cutoff = new Date(Date.now() - sinceDays * 86_400_000);

  const provider = opts.provider ?? peerScrapeProviderFor(opts.platform);
  if (!provider) {
    throw new Error(
      `No configured scraper supports ${opts.platform}. Configure Bright Data${
        opts.platform === "instagram" ? " or Apify" : ""
      }.`,
    );
  }

  if (provider === "apify") {
    const records = await runActor<Raw>("apify/instagram-scraper", {
      directUrls: [opts.profileUrl],
      resultsType: "posts",
      resultsLimit: limit,
      onlyPostsNewerThan: `${sinceDays} days`,
      skipPinnedPosts: true,
    });
    return {
      ...(await processRecords({
        brandId: opts.brandId,
        platform: opts.platform,
        records,
        skipTemplate: opts.skipTemplate,
        cutoff,
        ingestProvider: "apify",
      })),
      provider: "apify",
    };
  }

  // LinkedIn posts dataset discovers by company_url by default; a personal
  // profile (/in/) needs discover_by=profile_url.
  const query =
    opts.platform === "linkedin" && opts.profileUrl.includes("/in/")
      ? { discover_by: "profile_url" }
      : undefined;

  // Caps are per-dataset: the LinkedIn/X post crawlers take `limit_per_input`;
  // Facebook caps via `num_of_posts` in the input row; the IG-profile dataset
  // takes NEITHER — passing limit_per_input returns 0 rows — it just yields the
  // profile's recent posts (≤12), which the cutoff filter then bounds.
  const usesLimitParam = opts.platform === "linkedin" || opts.platform === "x";
  const inputRow: Record<string, unknown> = { url: opts.profileUrl };
  if (opts.platform === "facebook") inputRow.num_of_posts = limit;

  let records: Raw[];
  try {
    records = (await runScrape(SCRAPER_KEY[opts.platform], [inputRow], {
      limitPerInput: usesLimitParam ? limit : undefined,
      query,
    })) as Raw[];
  } catch (error) {
    // Bright Data can have a valid API key while its customer is inactive.
    // For Instagram we have a maintained Apify fallback with an equivalent
    // enough post/media shape, so use it rather than presenting a dead button.
    const message = error instanceof Error ? error.message : String(error);
    if (
      opts.platform === "instagram" &&
      isApifyConfigured &&
      message.includes("Customer is not active")
    ) {
      const fallbackRecords = await runActor<Raw>("apify/instagram-scraper", {
        directUrls: [opts.profileUrl],
        resultsType: "posts",
        resultsLimit: limit,
        onlyPostsNewerThan: `${sinceDays} days`,
        skipPinnedPosts: true,
      });
      return {
        ...(await processRecords({
          brandId: opts.brandId,
          platform: opts.platform,
          records: fallbackRecords,
          skipTemplate: opts.skipTemplate,
          cutoff,
          ingestProvider: "apify",
        })),
        provider: "apify",
      };
    }
    throw error;
  }

  // The IG-profile dataset returns ONE profile object with a nested posts[];
  // flatten to per-post records and carry the profile handle onto each.
  if (opts.platform === "instagram") {
    records = records.flatMap((rec) => {
      const account = str(rec.account);
      return (arr(rec.posts) as Raw[]).map((p) => ({ account, ...p }));
    });
  }

  return {
    ...(await processRecords({
      brandId: opts.brandId,
      platform: opts.platform,
      records,
      skipTemplate: opts.skipTemplate,
      cutoff,
      ingestProvider: "brightdata",
    })),
    provider: "brightdata",
  };
}

/**
 * Re-read one public Instagram permalink to renew its short-lived media URLs.
 * This intentionally updates the same canonical `platform_post`; it is a
 * manual recovery action for an expired preview, not a scheduled refresh.
 */
export async function refreshInstagramPostMedia(opts: {
  brandId: string;
  postUrl: string;
}): Promise<PeerScrapeResult> {
  if (!isApifyConfigured) {
    throw new Error("Apify is not configured for Instagram media refresh");
  }
  const records = await runActor<Raw>("apify/instagram-scraper", {
    directUrls: [opts.postUrl],
    resultsType: "posts",
    resultsLimit: 1,
  });
  return {
    ...(await processRecords({
      brandId: opts.brandId,
      platform: "instagram",
      records,
      ingestProvider: "apify",
    })),
    provider: "apify",
  };
}

/**
 * Refresh the visible history of one owned Instagram profile without imposing a
 * date cutoff. Used only by the explicit owned-media recovery action, before
 * its newly issued URLs are copied into Blob.
 */
export async function refreshInstagramProfileMedia(opts: {
  brandId: string;
  profileUrl: string;
  limit?: number;
}): Promise<PeerScrapeResult> {
  if (!isApifyConfigured) {
    throw new Error("Apify is not configured for Instagram media refresh");
  }
  const records = await runActor<Raw>("apify/instagram-scraper", {
    directUrls: [opts.profileUrl],
    resultsType: "posts",
    resultsLimit: opts.limit ?? 30,
    skipPinnedPosts: false,
  });
  return {
    ...(await processRecords({
      brandId: opts.brandId,
      platform: "instagram",
      records,
      ingestProvider: "apify",
    })),
    provider: "apify",
  };
}

/** Resolve a brand's X handle from its channel row. */
export async function xHandleForBrand(brandId: string): Promise<string | null> {
  const [chan] = await db
    .select({ handle: channelTable.handle })
    .from(channelTable)
    .where(
      and(eq(channelTable.brandId, brandId), eq(channelTable.platform, "x")),
    )
    .limit(1);
  return chan?.handle ?? null;
}

// ---- X via the official API (amplification source) -----------------

/**
 * X amplification can't come from the Bright Data profile-discovery dataset —
 * it returns authored posts only (no retweets/quotes). The X API does: with
 * `excludeRetweets:false`, each tweet carries `referenced_tweets`
 * (retweeted | quoted | replied_to). We turn retweets/quotes into amplifiedFrom
 * (externalId = the original tweet's id), which resolves against our existing
 * platform_posts (e.g. a founder retweeting @wander → the Wander tweet in DB).
 */
export async function ingestXViaApi(opts: {
  brandId: string;
  handle: string;
  maxPages?: number;
  skipTemplate?: boolean;
}): Promise<ProcessResult> {
  const user = await getXUserByUsername(opts.handle);
  // KEEP replies — self-replies are how THREADS chain (referenced_tweets
  // type=replied_to). We reconstruct the chain below and drop only
  // conversational replies to OTHER accounts.
  const { tweets, media } = await getAllXUserTweets({
    userId: user.id,
    excludeRetweets: false, // retweets carry the amplification edge
    excludeReplies: false, // replies carry the thread chain
    maxPages: opts.maxPages ?? 3,
  });

  // Pre-assign ids so a self-reply can point at its parent in the same run.
  const idByTweet = new Map<string, string>();
  for (const t of tweets) idByTweet.set(t.id, createId("pp"));

  const threadLinks: { childId: string; parentId: string }[] = [];
  const mapped: Mapped[] = [];

  for (const tweet of tweets) {
    const refs = tweet.referenced_tweets ?? [];
    const ampRef = refs.find(
      (r) => r.type === "retweeted" || r.type === "quoted",
    );
    const replyRef = refs.find((r) => r.type === "replied_to");
    const selfReply = replyRef && idByTweet.has(replyRef.id);

    // Drop conversational replies to others (a reply whose parent isn't ours
    // and which isn't a retweet/quote) — that's noise, not content.
    if (replyRef && !selfReply && !ampRef) continue;

    const base = mapXTweetToPlatformPost(tweet, media, {
      brandId: opts.brandId,
      username: user.username,
    });
    const mediaItems = base.media ?? [];
    const hasVideo = mediaItems.some((m) => m.type === "video");
    const externalKind =
      ampRef?.type === "retweeted"
        ? "repost"
        : ampRef?.type === "quoted"
          ? "quote"
          : "tweet";
    const id = idByTweet.get(tweet.id)!;
    if (selfReply) {
      threadLinks.push({ childId: id, parentId: idByTweet.get(replyRef.id)! });
    }
    const insert: PlatformPostInsert = {
      ...base,
      id,
      format: hasVideo ? "x.video" : "x.tweet",
      archetype: hasVideo ? "video_short" : "text",
      externalKind,
      amplifiedFrom: ampRef
        ? { externalId: ampRef.id, platform: "x" }
        : undefined,
    };
    mapped.push({
      insert,
      raw: { videos: hasVideo ? [{}] : [], text: tweet.text },
      cover: mediaItems.find((m) => m.type === "image")?.url,
    });
  }

  const result = await processMapped({
    brandId: opts.brandId,
    platform: "x",
    mapped,
    scanned: tweets.length,
    skipTemplate: opts.skipTemplate,
    ingestProvider: "x_api",
  });

  // Link threads AFTER insert (rows exist now → no self-FK ordering issue).
  for (const { childId, parentId } of threadLinks) {
    await db
      .update(platformPostTable)
      .set({ parentPlatformPostId: parentId })
      .where(eq(platformPostTable.id, childId));
  }

  return result;
}

// ---- one brand × platform pull, with run bookkeeping ------------------------

/** Setup problems a caller can explain to the operator (vs. provider failures). */
export class ScrapeSetupError extends Error {
  constructor(
    message: string,
    public readonly code: "missing_profile_url" | "no_provider",
  ) {
    super(message);
    this.name = "ScrapeSetupError";
  }
}

export type ScrapeBrandChannelResult = PeerScrapeResult & {
  runId: string;
  platform: ScrapePlatform;
  limit: number;
  sinceDays: number;
};

/**
 * The single entry point for an on-demand pull of one brand's posts on one
 * platform. The oRPC mutation, the agent tool and the probe all go through
 * here so the durable `content_ingest_run` row is written the same way.
 *
 * `limit` is the sample size: 5 confirms a channel is wired up and costs a
 * handful of records, 30+ is a real backfill. Instagram's profile dataset
 * ignores it and returns the latest ~12 posts regardless.
 */
export async function scrapeBrandChannel(opts: {
  brandId: string;
  platform: ScrapePlatform;
  sinceDays?: number;
  limit?: number;
  requestedById?: string;
  skipTemplate?: boolean;
}): Promise<ScrapeBrandChannelResult> {
  const sinceDays = opts.sinceDays ?? 30;
  const limit = opts.limit ?? 30;

  const profileUrl = await profileUrlForBrand(opts.brandId, opts.platform);
  if (!profileUrl) {
    throw new ScrapeSetupError(
      `No ${opts.platform} page link on this brand — add the channel's page URL first.`,
      "missing_profile_url",
    );
  }
  const provider = peerScrapeProviderFor(opts.platform);
  if (!provider) {
    throw new ScrapeSetupError(
      `No available scraper supports ${opts.platform}. Configure Bright Data${
        opts.platform === "instagram" ? " or Apify" : ""
      }.`,
      "no_provider",
    );
  }

  const requestedTo = new Date();
  const requestedFrom = new Date(
    requestedTo.getTime() - sinceDays * 86_400_000,
  );
  const runId = await startContentIngestRun({
    brandId: opts.brandId,
    requestedById: opts.requestedById,
    mode: "peer_scrape",
    provider,
    requestedFrom,
    requestedTo,
    // Written up front so a failed run is still attributable to its platform.
    result: { platform: opts.platform, limit, sinceDays },
  });
  try {
    const result = await scrapeAndSuggest({
      brandId: opts.brandId,
      platform: opts.platform,
      profileUrl,
      sinceDays,
      limit,
      provider,
      skipTemplate: opts.skipTemplate,
    });
    // The run row has no platform column; keeping platform + sample size in
    // the result lets the brand page show "latest pull" per channel.
    await finishContentIngestRun(
      runId,
      { platform: opts.platform, limit, sinceDays, ...result },
      result.provider,
    );
    return { runId, platform: opts.platform, limit, sinceDays, ...result };
  } catch (error) {
    await failContentIngestRun(runId, error);
    throw error;
  }
}

// ---- what has been pulled so far, per channel ------------------------------

export type ChannelBackfillRun = {
  status: string;
  provider: string;
  startedAt: string;
  completedAt: string | null;
  inserted: number | null;
  limit: number | null;
  sinceDays: number | null;
  error: string | null;
};

/** One pulled post, trimmed to what a preview card needs. */
export type ChannelBackfillPost = {
  id: string;
  text: string | null;
  media: MediaItem[];
  externalUrl: string | null;
  publishedAt: string | null;
  stats: PostStats | null;
  username: string | null;
};

export type ChannelBackfillState = {
  platform: string;
  profileUrl: string | null;
  profileImageUrl: string | null;
  handle: string | null;
  /** A mapper + configured provider exist, and the channel has a page link. */
  scrapable: boolean;
  posts: number;
  lastScrapedAt: string | null;
  lastRun: ChannelBackfillRun | null;
  /** Newest few posts in the store, so a sample pull can be eyeballed. */
  recentPosts: ChannelBackfillPost[];
};

const RECENT_POSTS_PER_PLATFORM = 4;

/**
 * Per-platform ingest facts for one brand: how many posts are in the store,
 * when the newest was pulled, and the latest run that targeted the platform.
 * Read by the brand page so an operator can confirm a backfill worked without
 * opening the timeline.
 */
export async function backfillStateForBrand(
  brandId: string,
): Promise<Record<string, ChannelBackfillState>> {
  const [channels, rollup, runs, recent] = await Promise.all([
    db
      .select({
        platform: channelTable.platform,
        profileUrl: channelTable.profileUrl,
        profileImageUrl: channelTable.profileImageUrl,
        handle: channelTable.handle,
      })
      .from(channelTable)
      .where(
        and(
          eq(channelTable.brandId, brandId),
          eq(channelTable.kind, "social"),
          eq(channelTable.isActive, true),
        ),
      ),
    db
      .select({
        platform: platformPostTable.platform,
        posts: count(),
        lastScrapedAt: max(platformPostTable.scrapedAt),
      })
      .from(platformPostTable)
      .where(
        and(
          eq(platformPostTable.brandId, brandId),
          eq(platformPostTable.isSeed, false),
        ),
      )
      .groupBy(platformPostTable.platform),
    db
      .select({
        status: contentIngestRunTable.status,
        provider: contentIngestRunTable.provider,
        startedAt: contentIngestRunTable.startedAt,
        completedAt: contentIngestRunTable.completedAt,
        error: contentIngestRunTable.error,
        result: contentIngestRunTable.result,
        platform: sql<
          string | null
        >`${contentIngestRunTable.result} ->> 'platform'`,
      })
      .from(contentIngestRunTable)
      .where(eq(contentIngestRunTable.brandId, brandId))
      .orderBy(desc(contentIngestRunTable.startedAt))
      .limit(60),
    // Newest posts across platforms; grouped per platform below. 60 covers
    // four per platform for every platform we can scrape, with headroom.
    db
      .select({
        id: platformPostTable.id,
        platform: platformPostTable.platform,
        text: platformPostTable.text,
        media: platformPostTable.media,
        externalUrl: platformPostTable.externalUrl,
        publishedAt: platformPostTable.publishedAt,
        stats: platformPostTable.stats,
        username: platformPostTable.username,
      })
      .from(platformPostTable)
      .where(
        and(
          eq(platformPostTable.brandId, brandId),
          eq(platformPostTable.isSeed, false),
        ),
      )
      .orderBy(sql`${platformPostTable.publishedAt} desc nulls last`)
      .limit(60),
  ]);

  const out: Record<string, ChannelBackfillState> = {};
  for (const c of channels) {
    const roll = rollup.find((r) => r.platform === c.platform);
    const run = runs.find((r) => r.platform === c.platform);
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    const isScrapePlatform = (SCRAPE_PLATFORMS as readonly string[]).includes(
      c.platform,
    );
    out[c.platform] = {
      platform: c.platform,
      profileUrl: c.profileUrl,
      profileImageUrl: c.profileImageUrl,
      handle: c.handle,
      scrapable:
        isScrapePlatform &&
        !!c.profileUrl &&
        peerScrapeProviderFor(c.platform as ScrapePlatform) != null,
      posts: roll?.posts ?? 0,
      lastScrapedAt: roll?.lastScrapedAt?.toISOString() ?? null,
      lastRun: run
        ? {
            status: run.status,
            provider: run.provider,
            startedAt: run.startedAt.toISOString(),
            completedAt: run.completedAt?.toISOString() ?? null,
            inserted: num(run.result?.inserted),
            limit: num(run.result?.limit),
            sinceDays: num(run.result?.sinceDays),
            error: run.error,
          }
        : null,
      recentPosts: recent
        .filter((p) => p.platform === c.platform)
        .slice(0, RECENT_POSTS_PER_PLATFORM)
        .map((p) => ({
          id: p.id,
          text: p.text,
          media: p.media ?? [],
          externalUrl: p.externalUrl,
          publishedAt: p.publishedAt?.toISOString() ?? null,
          stats: p.stats ?? null,
          username: p.username,
        })),
    };
  }
  return out;
}
