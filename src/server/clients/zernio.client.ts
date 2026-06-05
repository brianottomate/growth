import "server-only";

import { env } from "@/env";
import type { MediaItem, PostStats } from "@/server/db/content-schema";

const ZERNIO_API_BASE = "https://zernio.com/api/v1";

export const isZernioConfigured = Boolean(env.ZERNIO_API_KEY);

export type ZernioAccount = {
  _id?: string;
  id?: string;
  platform: string;
  name?: string;
  username?: string;
  displayName?: string;
  profilePictureUrl?: string;
  isActive?: boolean;
  connectedAt?: string;
  [key: string]: unknown;
};

async function zernioFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.ZERNIO_API_KEY) {
    throw new Error("ZERNIO_API_KEY is not configured");
  }

  const response = await fetch(`${ZERNIO_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.ZERNIO_API_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zernio ${path} failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}

function unwrapList<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

export async function listZernioAccounts(): Promise<ZernioAccount[]> {
  const data = await zernioFetch<unknown>("/accounts");
  return unwrapList<ZernioAccount>(data, "accounts", "data");
}

// Zernio platform strings → our `channelPlatformEnum` values. Most are 1:1;
// the renames are verified against live /accounts data (twitter→x, metaads→meta_ads).
const ZERNIO_PLATFORM_MAP: Record<string, string> = {
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  twitter: "x",
  x: "x",
  youtube: "youtube",
  tiktok: "tiktok",
  threads: "threads",
  reddit: "reddit",
  pinterest: "pinterest",
  metaads: "meta_ads",
  meta_ads: "meta_ads",
  googleads: "google_ads",
  google_ads: "google_ads",
};

// Normalize a Zernio platform string to our channel_platform enum; unknowns → "other".
export function mapZernioPlatform(platform?: string): string {
  if (!platform) return "other";
  return ZERNIO_PLATFORM_MAP[platform.toLowerCase()] ?? "other";
}

// ---- PROFILES ------------------------------------------------------
// NOTE: a Zernio "profile" is a WORKSPACE / grouping (name + color), NOT a
// connected social account. Connected accounts come from `listZernioAccounts`
// (GET /v1/accounts). https://docs.zernio.com/profiles/list-profiles
export type ZernioProfile = {
  _id?: string;
  name?: string;
  color?: string;
  isDefault?: boolean;
  isOverLimit?: boolean;
  [key: string]: unknown;
};

export async function listZernioProfiles(
  options: { includeOverLimit?: boolean } = {},
): Promise<ZernioProfile[]> {
  const params = new URLSearchParams();
  if (options.includeOverLimit) params.set("includeOverLimit", "true");
  const qs = params.toString();
  const data = await zernioFetch<unknown>(`/profiles${qs ? `?${qs}` : ""}`);
  return unwrapList<ZernioProfile>(data, "profiles", "data");
}

// ---- POSTS (scheduled / published, multi-platform fan-out) ---------
// One Zernio post fans out to N platforms via `platforms[]`; each entry maps to
// one of our `platform_post` rows. https://docs.zernio.com/posts/list-posts

// Per-platform target inside a post. `accountId` is populated (the connected
// account object), matching a `channel.externalId`.
export type ZernioPostPlatform = {
  platform?: string;
  accountId?:
    | string
    | {
        _id?: string;
        platform?: string;
        username?: string;
        displayName?: string;
        isActive?: boolean;
        [key: string]: unknown;
      };
  status?: string; // pending | published | failed
  platformPostUrl?: string; // published posts only
  [key: string]: unknown;
};

export type ZernioPost = {
  _id?: string;
  title?: string;
  content?: string;
  status?: string; // draft | scheduled | published | failed
  scheduledFor?: string;
  timezone?: string;
  platforms?: ZernioPostPlatform[];
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  // Media fields are undocumented; left open so the dump captures real shapes.
  [key: string]: unknown;
};

export async function listZernioPosts(
  options: {
    page?: number;
    limit?: number;
    status?: "draft" | "scheduled" | "published" | "failed";
    platform?: string;
    profileId?: string;
    accountId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    includeHidden?: boolean;
    sortBy?:
      | "scheduled-desc"
      | "scheduled-asc"
      | "created-desc"
      | "created-asc"
      | "status"
      | "platform";
  } = {},
): Promise<{
  posts: ZernioPost[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> {
  const params = new URLSearchParams();
  params.set("page", String(options.page ?? 1));
  params.set("limit", String(Math.min(options.limit ?? 10, 100)));
  if (options.status) params.set("status", options.status);
  if (options.platform) params.set("platform", options.platform);
  if (options.profileId) params.set("profileId", options.profileId);
  if (options.accountId) params.set("accountId", options.accountId);
  if (options.dateFrom) params.set("dateFrom", options.dateFrom);
  if (options.dateTo) params.set("dateTo", options.dateTo);
  if (options.search) params.set("search", options.search);
  if (options.includeHidden) params.set("includeHidden", "true");
  if (options.sortBy) params.set("sortBy", options.sortBy);

  const data = await zernioFetch<unknown>(`/posts?${params.toString()}`);
  const posts = unwrapList<ZernioPost>(data, "posts", "data");

  let pagination = {
    page: options.page ?? 1,
    limit: options.limit ?? 10,
    total: posts.length,
    pages: 1,
  };
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (obj.pagination && typeof obj.pagination === "object") {
      const p = obj.pagination as Record<string, unknown>;
      pagination = {
        page: typeof p.page === "number" ? p.page : pagination.page,
        limit: typeof p.limit === "number" ? p.limit : pagination.limit,
        total: typeof p.total === "number" ? p.total : pagination.total,
        pages: typeof p.pages === "number" ? p.pages : pagination.pages,
      };
    }
  }

  return { posts, pagination };
}

export async function getZernioPost(postId: string): Promise<ZernioPost | null> {
  const data = await zernioFetch<unknown>(
    `/posts/${encodeURIComponent(postId)}`,
  );
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (obj.post && typeof obj.post === "object") {
      return obj.post as ZernioPost;
    }
    // Some endpoints return the post directly without a wrapper.
    if (obj._id) return obj;
  }
  return null;
}

// Real metrics shape verified against /analytics (IG + LinkedIn, 2026-06).
export type ZernioAnalyticsMetrics = {
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  views?: number;
  saves?: number;
  sends?: number;
  reactions?: number;
  engagementRate?: number;
  igReelsAvgWatchTime?: number;
  igReelsVideoViewTotalTime?: number;
  lastUpdated?: string;
  [key: string]: unknown;
};

// A media attachment on an analytics post. `type` is per-item (image | video);
// the post-level `mediaType` may also be "carousel".
export type ZernioMediaItem = {
  type?: string; // image | video
  url?: string;
  thumbnail?: string;
  [key: string]: unknown;
};

// Per-platform delivery + metrics record nested inside an analytics post.
export type ZernioAnalyticsPostPlatform = {
  platform?: string;
  status?: string;
  platformPostId?: string; // the platform's own id / urn — our externalId
  accountId?: string;
  accountUsername?: string;
  analytics?: ZernioAnalyticsMetrics;
  syncStatus?: string;
  platformPostUrl?: string;
  errorMessage?: string | null;
  [key: string]: unknown;
};

/**
 * A post returned by GET /analytics. NOTE: for Wander these are `isExternal:
 * true` posts — published NATIVELY on the platform and mirrored by Zernio for
 * analytics, NOT authored through Zernio's composer (GET /posts is empty). This
 * is the real source for mapping published content → `platform_post`.
 * Shape verified against IG + LinkedIn live data (2026-06).
 */
export type ZernioAnalyticsPost = {
  _id?: string;
  id?: string;
  postId?: string;
  latePostId?: string | null;
  urn?: string;
  platform?: string;
  accountId?: string;
  profileId?: string;
  content?: string;
  status?: string; // "published"
  isExternal?: boolean;
  publishedAt?: string;
  scheduledFor?: string;
  postedAt?: string;
  createdAt?: string;
  url?: string;
  permalink?: string;
  platformPostUrl?: string;
  mediaType?: string; // image | video | carousel
  thumbnailUrl?: string;
  mediaItems?: ZernioMediaItem[];
  platforms?: ZernioAnalyticsPostPlatform[];
  analytics?: ZernioAnalyticsMetrics;
  metrics?: ZernioAnalyticsMetrics;
  [key: string]: unknown;
};

/**
 * GET /analytics — despite the name, this is Zernio's list-published-posts
 * endpoint: it returns FULL post objects (content, media, urls, platformPostId)
 * WITH metrics, for both Zernio-native and externally/natively-published posts.
 * This is the real source for the content Feed — `/posts` only has composer
 * drafts (empty for Wander).
 *
 * `source`: "external" = posts published natively + synced (Wander's IG/LinkedIn
 * history), "late" = published through Zernio, "all" = both (default).
 * Dates default server-side to last 90 days; max range 366 days. Paginated.
 * NOTE: LinkedIn *personal* accounts only expose analytics for Zernio-published
 * posts — Wander's LinkedIn is an Org, so its external history comes through.
 */
export async function getZernioAnalytics(options: {
  platform?: string;
  fromDate?: string;
  toDate?: string;
  source?: "external" | "late" | "all";
  accountId?: string;
  profileId?: string;
  postId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
}): Promise<{
  posts: ZernioAnalyticsPost[];
  pagination?: { page: number; limit: number; total: number; pages: number };
}> {
  const params = new URLSearchParams();
  if (options.platform) params.set("platform", options.platform);
  if (options.fromDate) params.set("fromDate", options.fromDate);
  if (options.toDate) params.set("toDate", options.toDate);
  if (options.source) params.set("source", options.source);
  if (options.accountId) params.set("accountId", options.accountId);
  if (options.profileId) params.set("profileId", options.profileId);
  if (options.postId) params.set("postId", options.postId);
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(Math.min(options.limit, 100)));
  if (options.sortBy) params.set("sortBy", options.sortBy);

  const qs = params.toString();
  const data = await zernioFetch<unknown>(`/analytics${qs ? `?${qs}` : ""}`);
  const posts = unwrapList<ZernioAnalyticsPost>(data, "posts", "data");

  let pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  } | undefined;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (obj.pagination && typeof obj.pagination === "object") {
      const p = obj.pagination as Record<string, unknown>;
      pagination = {
        page: typeof p.page === "number" ? p.page : (options.page ?? 1),
        limit: typeof p.limit === "number" ? p.limit : (options.limit ?? 50),
        total: typeof p.total === "number" ? p.total : posts.length,
        pages: typeof p.pages === "number" ? p.pages : 1,
      };
    }
  }

  return { posts, pagination };
}

// Per docs (https://docs.zernio.com/comments/list-inbox-comments) this endpoint
// returns POSTS with comment counts, not individual comments — aggregated across
// all connected accounts. Per-post comment listing is a separate endpoint
// (GET /v1/inbox/comments/{postId}) we'd add later.
export type ZernioCommentedPost = {
  id?: string;
  platform?: string;
  accountId?: string;
  accountUsername?: string;
  content?: string;
  picture?: string;
  permalink?: string;
  createdTime?: string;
  commentCount?: number;
  likeCount?: number;
  cid?: string;
  subreddit?: string;
  isAd?: boolean;
  adId?: string;
  placement?: string;
  [key: string]: unknown;
};

export async function listZernioCommentedPosts(
  options: {
    sortBy?: "date" | "comments";
    sortOrder?: "asc" | "desc";
    minComments?: number;
    limit?: number;
    platform?: string;
    accountId?: string;
    since?: string;
  } = {},
): Promise<{
  posts: ZernioCommentedPost[];
  hasMore: boolean;
  nextCursor?: string;
}> {
  const params = new URLSearchParams();
  params.set("sortBy", options.sortBy ?? "date");
  params.set("sortOrder", options.sortOrder ?? "desc");
  params.set("limit", String(Math.min(options.limit ?? 50, 100)));
  if (options.minComments !== undefined)
    params.set("minComments", String(options.minComments));
  if (options.platform) params.set("platform", options.platform);
  if (options.accountId) params.set("accountId", options.accountId);
  if (options.since) params.set("since", options.since);

  const data = await zernioFetch<unknown>(`/inbox/comments?${params.toString()}`);
  const posts = unwrapList<ZernioCommentedPost>(data, "data", "posts");

  let hasMore = false;
  let nextCursor: string | undefined;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (obj.pagination && typeof obj.pagination === "object") {
      const p = obj.pagination as Record<string, unknown>;
      hasMore = Boolean(p.hasMore);
      if (typeof p.nextCursor === "string") nextCursor = p.nextCursor;
    }
  }

  return { posts, hasMore, nextCursor };
}

export type ZernioCreative = {
  effectiveObjectStoryId?: string;
  effectiveInstagramMediaId?: string;
  instagramUserId?: string;
  instagramPermalinkUrl?: string;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  videoId?: string | null;
  videoUrl?: string | null;
  mediaUrls?: string[];
  body?: string | null;
  linkUrl?: string | null;
  [key: string]: unknown;
};

export type ZernioAd = {
  id?: string;
  _id?: string;
  platformAdId?: string;
  platformAdSetId?: string;
  platformCampaignId?: string;
  platformAdAccountId?: string;
  platformAdAccountName?: string;
  platformId?: string;
  name?: string;
  status?: string;
  platform?: string;
  effectiveObjectStoryId?: string;
  effectiveStoryId?: string;
  creative?: ZernioCreative;
  budget?: { amount?: number; type?: string };
  platformObjective?: string;
  optimizationGoal?: string;
  bidStrategy?: string;
  createdAt?: string;
  updatedAt?: string;
  platformCreatedAt?: string;
  campaignStatus?: string;
  adSetStatus?: string;
  isExternal?: boolean;
  [key: string]: unknown;
};

export type ZernioAdSet = {
  id?: string;
  _id?: string;
  name?: string;
  status?: string;
  ads?: ZernioAd[];
  [key: string]: unknown;
};

export type ZernioAdsTreeCampaign = {
  id?: string;
  _id?: string;
  name?: string;
  status?: string;
  platform?: string;
  adSets?: ZernioAdSet[];
  [key: string]: unknown;
};

// Paginates per docs: page (1-based), limit max 100, paginated at campaign level.
// https://docs.zernio.com/ad-campaigns/get-ad-tree
export async function getZernioAdsTree(): Promise<ZernioAdsTreeCampaign[]> {
  const all: ZernioAdsTreeCampaign[] = [];
  const limit = 100;
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page++) {
    const data = await zernioFetch<unknown>(
      `/ads/tree?source=all&page=${page}&limit=${limit}`,
    );

    let pageItems: ZernioAdsTreeCampaign[] = [];
    let totalPages = 1;

    if (Array.isArray(data)) {
      pageItems = data as ZernioAdsTreeCampaign[];
    } else if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      pageItems = Array.isArray(obj.campaigns)
        ? (obj.campaigns as ZernioAdsTreeCampaign[])
        : Array.isArray(obj.data)
          ? (obj.data as ZernioAdsTreeCampaign[])
          : [];
      if (obj.pagination && typeof obj.pagination === "object") {
        const p = obj.pagination as Record<string, unknown>;
        if (typeof p.pages === "number") totalPages = p.pages;
      }
    }

    all.push(...pageItems);
    if (pageItems.length === 0 || page >= totalPages) break;
  }

  return all;
}

export type AdWithContext = ZernioAd & {
  campaignId?: string;
  campaignName?: string;
  campaignStatus?: string;
  adSetId?: string;
  adSetName?: string;
  adSetStatus?: string;
  currency?: string;
};

export type AdWithComments = AdWithContext & {
  comments: ZernioAdComment[];
  commentError?: string;
};

export async function listAllZernioAdsWithComments(
  options: {
    maxAds?: number;
    perAdLimit?: number;
    excludeStatuses?: string[];
    includeOnlyStatuses?: string[];
  } = {},
): Promise<{
  ads: AdWithComments[];
  totalAds: number;
  filteredCount: number;
  truncated: boolean;
  campaignCount: number;
  adSetCount: number;
  statusCounts: Record<string, number>;
}> {
  const allAds = await listAllZernioAds();

  // Stats from raw tree (re-derive campaign/adset counts)
  const campaignIds = new Set<string>();
  const adSetIds = new Set<string>();
  const statusCounts: Record<string, number> = {};
  for (const ad of allAds) {
    if (ad.campaignId) campaignIds.add(ad.campaignId);
    if (ad.adSetId) adSetIds.add(ad.adSetId);
    const s = (ad.status ?? "unknown").toLowerCase();
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const exclude = new Set(
    (options.excludeStatuses ?? []).map((s) => s.toLowerCase()),
  );
  const include = options.includeOnlyStatuses
    ? new Set(options.includeOnlyStatuses.map((s) => s.toLowerCase()))
    : null;

  const filtered = allAds.filter((ad) => {
    const s = (ad.status ?? "").toLowerCase();
    if (include && !include.has(s)) return false;
    if (exclude.has(s)) return false;
    return true;
  });

  const maxAds = options.maxAds ?? 200;
  const slice = filtered.slice(0, maxAds);

  const results = await Promise.all(
    slice.map(async (ad): Promise<AdWithComments> => {
      const id = ad._id ?? ad.id ?? ad.platformAdId;
      if (typeof id !== "string" || id.length === 0) {
        return { ...ad, comments: [] };
      }
      const res = await getZernioAdComments(id, {
        limit: options.perAdLimit ?? 25,
      });
      return { ...ad, comments: res.comments, commentError: res.error };
    }),
  );

  return {
    ads: results,
    totalAds: allAds.length,
    filteredCount: filtered.length,
    truncated: filtered.length > maxAds,
    campaignCount: campaignIds.size,
    adSetCount: adSetIds.size,
    statusCounts,
  };
}

export async function listAllZernioAds(): Promise<AdWithContext[]> {
  const tree = await getZernioAdsTree();
  const ads: AdWithContext[] = [];
  for (const campaign of tree) {
    const cid = campaign.id ?? campaign._id;
    const currency =
      typeof (campaign as Record<string, unknown>).currency === "string"
        ? ((campaign as Record<string, unknown>).currency as string)
        : undefined;
    for (const adSet of campaign.adSets ?? []) {
      const asid = adSet.id ?? adSet._id;
      for (const ad of adSet.ads ?? []) {
        ads.push({
          ...ad,
          campaignId: typeof cid === "string" ? cid : undefined,
          campaignName: campaign.name,
          campaignStatus: campaign.status,
          adSetId: typeof asid === "string" ? asid : undefined,
          adSetName: adSet.name,
          adSetStatus: adSet.status,
          platform: ad.platform ?? campaign.platform,
          currency,
        });
      }
    }
  }
  return ads;
}

export type ZernioAdComment = {
  id?: string;
  _id?: string;
  message?: string;
  content?: string;
  from?: {
    id?: string;
    name?: string;
    [key: string]: unknown;
  };
  createdTime?: string;
  created_time?: string;
  createdAt?: string;
  commentCount?: number;
  parent?: { id?: string };
  permalink?: string;
  [key: string]: unknown;
};

export type ZernioAdCommentsResponse = {
  comments: ZernioAdComment[];
  platform?: string;
  effectiveStoryId?: string;
  error?: string;
};

export async function getZernioAdComments(
  adId: string,
  options: { limit?: number } = {},
): Promise<ZernioAdCommentsResponse> {
  const limit = options.limit ?? 50;
  try {
    const data = await zernioFetch<unknown>(
      `/ads/${encodeURIComponent(adId)}/comments?limit=${limit}`,
    );
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      const rawComments = Array.isArray(obj.comments)
        ? (obj.comments as unknown[])
        : Array.isArray(obj.data)
          ? (obj.data as unknown[])
          : [];
      const comments = rawComments as ZernioAdComment[];
      const meta =
        obj.meta && typeof obj.meta === "object"
          ? (obj.meta as Record<string, unknown>)
          : {};
      return {
        comments,
        platform:
          typeof meta.platform === "string" ? meta.platform : undefined,
        effectiveStoryId:
          typeof meta.effectiveStoryId === "string"
            ? meta.effectiveStoryId
            : undefined,
      };
    }
    return { comments: [] };
  } catch (error) {
    return {
      comments: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type AdCommentWithContext = ZernioAdComment & {
  adId: string;
  adName?: string;
  platform?: string;
};

export async function listAllZernioAdComments(options: {
  perAdLimit?: number;
  maxAds?: number;
}): Promise<{
  comments: AdCommentWithContext[];
  errors: Array<{ adId: string; adName?: string; message: string }>;
  totalAds: number;
}> {
  const tree = await getZernioAdsTree();

  const ads: Array<{ id: string; name?: string; platform?: string }> = [];
  for (const campaign of tree) {
    for (const adSet of campaign.adSets ?? []) {
      for (const ad of adSet.ads ?? []) {
        const id =
          ad.id ?? ad._id ?? ad.platformAdId ?? ad.platformId ?? undefined;
        if (typeof id === "string" && id.length > 0) {
          ads.push({
            id,
            name: ad.name,
            platform: ad.platform ?? campaign.platform,
          });
        }
      }
    }
  }

  const maxAds = options.maxAds ?? 30;
  const slice = ads.slice(0, maxAds);

  const results = await Promise.all(
    slice.map(async (ad) => {
      const res = await getZernioAdComments(ad.id, {
        limit: options.perAdLimit ?? 25,
      });
      return { ad, res };
    }),
  );

  const comments: AdCommentWithContext[] = [];
  const errors: Array<{ adId: string; adName?: string; message: string }> = [];
  for (const { ad, res } of results) {
    if (res.error) {
      errors.push({ adId: ad.id, adName: ad.name, message: res.error });
      continue;
    }
    for (const c of res.comments) {
      comments.push({
        ...c,
        adId: ad.id,
        adName: ad.name,
        platform: ad.platform ?? res.platform,
      });
    }
  }

  return { comments, errors, totalAds: ads.length };
}

// ---- ANALYTICS POST → platform_post MAPPING ------------------------
// See docs/zernio-platform-post-mapping.md. One row per `platforms[]` entry
// (a post fans out to N platforms); falls back to the denormalized top-level
// fields when `platforms[]` is absent.

function zernioMediaItems(post: ZernioAnalyticsPost): MediaItem[] {
  const items: MediaItem[] = [];
  for (const m of post.mediaItems ?? []) {
    if (!m.url) continue;
    const type = m.type === "video" ? "video" : "image";
    items.push({ url: m.url, type, thumbnail: m.thumbnail });
  }
  return items;
}

function zernioStats(metrics?: ZernioAnalyticsMetrics): PostStats {
  return {
    likes: metrics?.likes,
    comments: metrics?.comments,
    shares: metrics?.shares,
    views: metrics?.views,
    impressions: metrics?.impressions,
    saves: metrics?.saves,
    clicks: metrics?.clicks,
  };
}

/**
 * Map a Zernio analytics post onto `platform_post` insert rows — one per
 * platform delivery. `resolveChannelId` attaches a connected channel when the
 * Zernio accountId matches a `channel.externalId`.
 */
export function mapZernioPostToPlatformPosts(
  post: ZernioAnalyticsPost,
  ctx: {
    brandId: string;
    resolveChannelId?: (platform: string, accountId?: string) => string | undefined;
    scrapedAt?: Date;
  },
) {
  const media = zernioMediaItems(post);
  const publishedAt = post.publishedAt ? new Date(post.publishedAt) : undefined;
  const scrapedAt = ctx.scrapedAt ?? new Date();
  const source = post.isExternal === false ? "owned" : "scraped";

  const entries =
    post.platforms && post.platforms.length > 0
      ? post.platforms
      : [
          {
            platform: post.platform,
            platformPostId: undefined,
            platformPostUrl: post.platformPostUrl,
            accountId: post.accountId,
            accountUsername: undefined,
            analytics: post.analytics,
          } as ZernioAnalyticsPostPlatform,
        ];

  return entries.map((pe) => {
    const platform = mapZernioPlatform(pe.platform ?? post.platform);
    return {
      brandId: ctx.brandId,
      channelId: ctx.resolveChannelId?.(platform, pe.accountId),
      platform: platform as "x", // enum-validated string; cast for insert type
      username: pe.accountUsername,
      source: source as "scraped",
      status: "published" as const,
      provider: "zernio" as const,
      text: post.content,
      media,
      stats: zernioStats(pe.analytics ?? post.analytics),
      externalId: pe.platformPostId ?? post._id,
      externalUrl: pe.platformPostUrl ?? post.platformPostUrl,
      externalKind: post.mediaType,
      publishedAt,
      scrapedAt,
      metadata: {
        zernioId: post._id,
        profileId: post.profileId,
        syncStatus: pe.syncStatus,
        engagementRate: (pe.analytics ?? post.analytics)?.engagementRate,
      },
    };
  });
}
