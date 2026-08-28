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
  profileId?: string | { _id?: string; name?: string };
  profileUrl?: string;
  profilePicture?: string;
  followersCount?: number;
  enabled?: boolean;
  platformStatus?: string;
  profilePictureUrl?: string;
  isActive?: boolean;
  connectedAt?: string;
  [key: string]: unknown;
};

async function zernioFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
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
  accountUsernames?: string[];
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

/**
 * Create a Zernio profile (workspace grouping). Names must be unique within
 * the team. NOT idempotent — callers must check for an existing profile first
 * and must never auto-retry a create.
 */
export async function createZernioProfile(input: {
  name: string;
  description?: string;
}): Promise<ZernioProfile> {
  const data = await zernioFetch<ZernioProfile & { profile?: ZernioProfile }>(
    `/profiles`,
    { method: "POST", body: JSON.stringify(input) },
  );
  const profile = data.profile ?? data;
  if (!profile._id) {
    throw new Error("Zernio profile create returned no id");
  }
  return profile;
}

// ---- CONNECT (client-facing OAuth links) ----------------------------
// GET /v1/connect/{platform} returns an authUrl to send the end-user to. In
// the standard (non-headless) flow Zernio hosts any selection screens and
// then redirects the browser to `redirectUrl` with `connected=<platform>`
// query params. Ads platforms use /v1/connect/{platform}/ads instead — for
// Meta that skips the Page picker entirely.
// https://docs.zernio.com/connect

export type ZernioConnectPlatform =
  | { kind: "posting"; platform: string }
  | { kind: "ads"; platform: string };

export async function getZernioConnectUrl(input: {
  target: ZernioConnectPlatform;
  profileId: string;
  redirectUrl: string;
}): Promise<string> {
  const params = new URLSearchParams({
    profileId: input.profileId,
    redirect_url: input.redirectUrl,
  });
  const path =
    input.target.kind === "ads"
      ? `/connect/${input.target.platform}/ads`
      : `/connect/${input.target.platform}`;
  const data = await zernioFetch<{
    authUrl?: string;
    url?: string;
    alreadyConnected?: boolean;
  }>(`${path}?${params.toString()}`);
  const authUrl = data.authUrl ?? data.url;
  if (!authUrl) {
    if (data.alreadyConnected) {
      throw new Error("already_connected");
    }
    throw new Error("Zernio connect returned no authUrl");
  }
  return authUrl;
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
  platformPostId?: string;
  platformPostUrl?: string; // published posts only
  error?: string;
  errorCategory?: string;
  errorMessage?: string;
  errorSource?: string;
  customContent?: string;
  platformSpecificData?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ZernioPost = {
  _id?: string;
  title?: string;
  content?: string;
  status?: string; // draft | scheduled | published | failed
  scheduledFor?: string;
  timezone?: string;
  mediaItems?: Array<{ type?: "image" | "video"; url?: string }>;
  platforms?: ZernioPostPlatform[];
  metadata?: Record<string, unknown>;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  // Media fields are undocumented; left open so the dump captures real shapes.
  [key: string]: unknown;
};

export type CreateZernioPostInput = {
  title?: string;
  content?: string;
  mediaItems?: Array<{
    type: "image" | "video";
    url: string;
  }>;
  platforms: Array<{
    platform: string;
    accountId: string;
    customContent?: string;
    platformSpecificData?: Record<string, unknown>;
  }>;
  scheduledFor?: string;
  publishNow?: boolean;
  timezone?: string;
  metadata?: Record<string, unknown>;
};

/** Create a Zernio composer post. Supplying `scheduledFor` queues it for the
 * future; `publishNow` hands it to the platform immediately. */
export async function createZernioPost(
  input: CreateZernioPostInput,
  options: { requestId?: string } = {},
): Promise<ZernioPost> {
  const data = await zernioFetch<unknown>("/posts", {
    method: "POST",
    headers: options.requestId
      ? { "x-request-id": options.requestId }
      : undefined,
    body: JSON.stringify(input),
  });
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (obj.post && typeof obj.post === "object") {
      return obj.post as ZernioPost;
    }
    // Idempotent retries return the original under `existingPost`.
    if (obj.existingPost && typeof obj.existingPost === "object") {
      return obj.existingPost as ZernioPost;
    }
  }
  throw new Error("Zernio created the post but returned no post object");
}

/** Replace one draft/scheduled composer job with a complete payload. */
export async function updateZernioPost(
  postId: string,
  input: CreateZernioPostInput,
): Promise<ZernioPost> {
  const data = await zernioFetch<unknown>(
    `/posts/${encodeURIComponent(postId)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
  if (data && typeof data === "object") {
    const object = data as Record<string, unknown>;
    if (object.post && typeof object.post === "object") {
      return object.post as ZernioPost;
    }
    if (typeof object._id === "string") return object;
  }
  throw new Error("Zernio updated the post but returned no post object");
}

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

export async function getZernioPost(
  postId: string,
): Promise<ZernioPost | null> {
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

/** Retry only the failed platform targets on an existing Zernio post. */
export async function retryZernioPost(postId: string): Promise<ZernioPost> {
  const data = await zernioFetch<unknown>(
    `/posts/${encodeURIComponent(postId)}/retry`,
    { method: "POST" },
  );
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (obj.post && typeof obj.post === "object") {
      return obj.post as ZernioPost;
    }
    if (obj._id) return obj;
  }
  throw new Error("Zernio retried the post but returned no post object");
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

  let pagination:
    | {
        page: number;
        limit: number;
        total: number;
        pages: number;
      }
    | undefined;
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

  const data = await zernioFetch<unknown>(
    `/inbox/comments?${params.toString()}`,
  );
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

// ---- DM INBOX (conversations + messages) ---------------------------
// Verified live 2026-06-05. Conversation list is fast (~650ms); messages need
// `accountId` (400 without). DMs flow on Instagram + Facebook for Wander.

export type ZernioConversation = {
  id?: string;
  accountId?: string;
  accountUsername?: string;
  platform?: string;
  participantId?: string;
  participantName?: string;
  participantUsername?: string;
  participantPicture?: string | null;
  lastMessage?: string; // text preview ("[Attachment]" for media)
  updatedTime?: string;
  status?: string;
  unreadCount?: number;
  url?: string; // native deep-link to the IG/FB thread
  instagramProfile?: {
    isFollower?: boolean;
    isFollowing?: boolean;
    followerCount?: number;
    isVerified?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export async function listZernioConversations(
  options: {
    platform?: string;
    profileId?: string;
    accountId?: string;
    limit?: number;
  } = {},
): Promise<{ conversations: ZernioConversation[] }> {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(options.limit ?? 50, 100)));
  if (options.platform) params.set("platform", options.platform);
  if (options.profileId) params.set("profileId", options.profileId);
  if (options.accountId) params.set("accountId", options.accountId);

  const data = await zernioFetch<unknown>(
    `/inbox/conversations?${params.toString()}`,
  );
  const conversations = unwrapList<ZernioConversation>(
    data,
    "data",
    "conversations",
  );
  return { conversations };
}

// DM-capable platforms with inbox sync connected. Zernio's unfiltered
// conversation list is recency-capped, so older-but-active channels (X DMs lag
// IG by weeks) drop off the end. Query each explicitly to guarantee coverage.
export const DM_PLATFORMS = ["instagram", "facebook", "twitter"] as const;

/**
 * Conversations across every DM platform, fanned out per platform (so X isn't
 * crowded out by recent IG), de-duped by id and merged newest-first. A failure
 * on one platform degrades to skipping it rather than failing the whole load.
 */
export async function listAllDmConversations(
  options: { perPlatformLimit?: number } = {},
): Promise<{ conversations: ZernioConversation[] }> {
  const limit = options.perPlatformLimit ?? 50;
  const perPlatform = await Promise.all(
    DM_PLATFORMS.map((platform) =>
      listZernioConversations({ platform, limit })
        .then((r) => r.conversations)
        .catch((error) => {
          console.warn(`[zernio] DM conversations ${platform} failed:`, error);
          return [] as ZernioConversation[];
        }),
    ),
  );

  const byId = new Map<string, ZernioConversation>();
  for (const c of perPlatform.flat()) {
    if (typeof c.id === "string" && !byId.has(c.id)) byId.set(c.id, c);
  }
  const conversations = [...byId.values()].sort((a, b) => {
    const ta = a.updatedTime ? new Date(a.updatedTime).getTime() : 0;
    const tb = b.updatedTime ? new Date(b.updatedTime).getTime() : 0;
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
  return { conversations };
}

export type ZernioMessage = {
  id?: string;
  conversationId?: string;
  accountId?: string;
  platform?: string;
  message?: string;
  senderId?: string;
  senderName?: string;
  direction?: string; // "incoming" | "outgoing"
  createdAt?: string;
  sentAt?: string;
  isStoryMention?: boolean;
  attachments?: Array<{ type?: string; url?: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

// `accountId` is REQUIRED (400 without). Returns messages oldest→newest by
// default; pass sortOrder="desc" for newest-first.
export async function getZernioConversationMessages(
  conversationId: string,
  options: { accountId: string; limit?: number; sortOrder?: "asc" | "desc" },
): Promise<{ messages: ZernioMessage[] }> {
  const params = new URLSearchParams();
  params.set("accountId", options.accountId);
  params.set("limit", String(Math.min(options.limit ?? 50, 100)));
  if (options.sortOrder) params.set("sortOrder", options.sortOrder);

  const data = await zernioFetch<unknown>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
  );
  const messages = unwrapList<ZernioMessage>(data, "messages", "data");
  return { messages };
}

// Individual comments on a single post (the organic drill-down). Verified live
// 2026-06-05: `postId` is the row's `id` verbatim (native platform post id);
// `accountId` REQUIRED. `from.isOwner` flags our own comments/replies.
export type ZernioPostComment = {
  id?: string;
  message?: string;
  from?: {
    id?: string;
    name?: string;
    username?: string;
    isOwner?: boolean;
    [key: string]: unknown;
  };
  createdTime?: string;
  likeCount?: number;
  replyCount?: number;
  isHidden?: boolean;
  url?: string;
  replies?: ZernioPostComment[];
  [key: string]: unknown;
};

export async function getZernioPostComments(
  postId: string,
  options: { accountId: string; limit?: number },
): Promise<{ comments: ZernioPostComment[] }> {
  const params = new URLSearchParams();
  params.set("accountId", options.accountId);
  params.set("limit", String(Math.min(options.limit ?? 50, 100)));

  const data = await zernioFetch<unknown>(
    `/inbox/comments/${encodeURIComponent(postId)}?${params.toString()}`,
  );
  const comments = unwrapList<ZernioPostComment>(data, "comments", "data");
  return { comments };
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

// Rolled-up per-ad metrics from the ad tree (verified live 2026-06-05). The
// `actions` map holds per-action-type counts — `actions.comment` is the comment
// count, which lets us find ads-with-comments WITHOUT fetching every thread.
export type ZernioAdMetrics = {
  spend?: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  engagement?: number;
  conversions?: number;
  actions?: Record<string, number>;
  [key: string]: unknown;
};

export type ZernioAd = {
  id?: string;
  _id?: string;
  metrics?: ZernioAdMetrics;
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

export type ZernioAdAccount = {
  id: string;
  name?: string;
  currency?: string;
  status?: string;
  approvalStatus?: string;
  minimumDailyBudget?: number;
  selectable?: boolean;
  unusableReason?: string;
  [key: string]: unknown;
};

/**
 * Enumerate the platform ad accounts one connected Zernio account can reach.
 * Callers must still apply Growth's brand-scoped default-deny allowlist.
 * https://docs.zernio.com/ad-accounts/list-ad-accounts
 */
export async function listZernioAdAccounts(options: {
  accountId: string;
  adAccountId?: string;
  limit?: number;
}): Promise<ZernioAdAccount[]> {
  const params = new URLSearchParams({ accountId: options.accountId });
  if (options.adAccountId) params.set("adAccountId", options.adAccountId);
  if (options.limit) params.set("limit", String(options.limit));
  const data = await zernioFetch<unknown>(`/ads/accounts?${params.toString()}`);
  return unwrapList<ZernioAdAccount>(data, "accounts", "data");
}

/**
 * Pause or resume one campaign — the platform's own on/off switch, cascaded
 * by the platform to its ad sets and ads. `updated: 0` is a normal success
 * (it counts only ads whose stored status changed alongside the switch).
 * NOTE (Meta): a campaign created paused may ALSO need its ad set resumed;
 * the echoed `status` is the confirmation the switch landed.
 * https://docs.zernio.com/ads/campaign-status
 */
export async function setZernioCampaignStatus(input: {
  platformCampaignId: string;
  status: "active" | "paused";
  platform?: string;
}): Promise<{
  status?: string;
  updated?: number;
  skipped?: number;
  skippedReasons?: Record<string, unknown>;
  message?: string;
}> {
  return zernioFetch(`/ads/campaigns/${input.platformCampaignId}/status`, {
    method: "PUT",
    body: JSON.stringify({
      status: input.status,
      ...(input.platform ? { platform: input.platform } : {}),
    }),
  });
}

export type ZernioAdTargeting = {
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  languages?: string[];
  audienceId?: string;
};

/**
 * One hand-built carousel card (Meta). Cards render in the order given —
 * deterministic, unlike Zernio's auto-optimizing dynamicCreative pool.
 * Card-level linkUrl/callToAction fall back to the ad-level values.
 * https://docs.zernio.com/ad-campaigns/create-standalone-ad#carousel-ads
 */
export type ZernioCarouselCard = {
  imageUrl: string;
  headline?: string;
  description?: string;
  linkUrl?: string;
  callToAction?: string;
};

export type CreateZernioStandaloneAdInput = {
  accountId: string;
  adAccountId: string;
  name: string;
  goal:
    | "engagement"
    | "traffic"
    | "awareness"
    | "video_views"
    | "lead_generation"
    | "lead_conversion"
    | "conversions"
    | "app_promotion"
    | "catalog_sales";
  budgetAmount: number;
  budgetType: "daily" | "lifetime";
  headline: string;
  body: string;
  linkUrl: string;
  imageUrl?: string;
  images?: { landscape: string; square: string };
  /** Meta only: 2–10 cards; mutually exclusive with imageUrl/images. */
  carouselCards?: ZernioCarouselCard[];
  /**
   * Meta only: multi-creative shape — ONE ad set with N ads sharing budget and
   * targeting. Mutually exclusive with imageUrl/images/carouselCards. The 201
   * response carries { ads, platformCampaignId, platformAdSetId }.
   */
  creatives?: {
    name: string;
    headline?: string;
    body?: string;
    imageUrl: string;
    linkUrl?: string;
    callToAction?: string;
  }[];
  campaignName?: string;
  adSetName?: string;
  adName?: string;
  description?: string;
  callToAction?: string;
  campaignType?: "search" | "display";
  leadGenFormId?: string;
  keywords?: string[];
  negativeKeywords?: string[];
  additionalHeadlines?: string[];
  additionalDescriptions?: string[];
  businessName?: string;
  targeting?: ZernioAdTargeting;
  startDate?: string;
  endDate?: string;
  status?: "PAUSED";
  validateOnly?: boolean;
  promotedObject?: {
    pixelId?: string;
    customEventType?: string;
    customConversionId?: string;
    productSetId?: string;
    pageId?: string;
    applicationId?: string;
    objectStoreUrl?: string;
  };
};

export type ZernioAdWriteResponse = {
  ad?: ZernioAd;
  /** Multi-creative shape: the N ads of the single ad set that was created. */
  ads?: ZernioAd[];
  platformCampaignId?: string;
  platformAdSetId?: string;
  validateOnly?: boolean;
  results?: Array<{
    node?: string;
    status?: string;
    reason?: string;
  }>;
  message?: string;
  [key: string]: unknown;
};

/**
 * Create one campaign tree through Zernio's normalized Meta/Google endpoint.
 * The idempotency key is mandatory here because a blind retry duplicates spend.
 * https://docs.zernio.com/ad-campaigns/create-standalone-ad
 */
export async function createZernioStandaloneAd(
  input: CreateZernioStandaloneAdInput,
  options: { idempotencyKey: string },
): Promise<ZernioAdWriteResponse> {
  return zernioFetch<ZernioAdWriteResponse>("/ads/create", {
    method: "POST",
    headers: { "Idempotency-Key": options.idempotencyKey },
    body: JSON.stringify(input),
  });
}

export type BoostZernioMetaPostInput = {
  accountId: string;
  adAccountId: string;
  name: string;
  goal:
    | "engagement"
    | "traffic"
    | "awareness"
    | "video_views"
    | "lead_generation"
    | "conversions"
    | "app_promotion";
  postId?: string;
  platformPostId?: string;
  budget: { amount: number; type: "daily" | "lifetime" };
  schedule?: { startDate?: string; endDate?: string };
  targeting?: ZernioAdTargeting;
};

/** Boosts launch active on Meta, so this client is only called by an approved capability. */
export async function boostZernioMetaPost(
  input: BoostZernioMetaPostInput,
  options: { idempotencyKey: string },
): Promise<ZernioAdWriteResponse> {
  return zernioFetch<ZernioAdWriteResponse>("/ads/boost", {
    method: "POST",
    headers: { "Idempotency-Key": options.idempotencyKey },
    body: JSON.stringify(input),
  });
}

export type DuplicateZernioMetaCampaignResponse = {
  copiedCampaignId?: string;
  discovery?: unknown;
  raw?: unknown;
  [key: string]: unknown;
};

/** Deep-copy a Meta campaign in PAUSED state. */
export async function duplicateZernioMetaCampaign(
  platformCampaignId: string,
  input: {
    renameSuffix?: string;
    syncAfter?: boolean;
  },
  options: { idempotencyKey: string },
): Promise<DuplicateZernioMetaCampaignResponse> {
  return zernioFetch<DuplicateZernioMetaCampaignResponse>(
    `/ads/campaigns/${encodeURIComponent(platformCampaignId)}/duplicate`,
    {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey },
      body: JSON.stringify({
        platform: "facebook",
        deepCopy: true,
        statusOption: "PAUSED",
        renameStrategy: "DEEP_RENAME",
        renameSuffix: input.renameSuffix ?? " (copy)",
        syncAfter: input.syncAfter ?? true,
      }),
    },
  );
}

// ---- AD AUDIENCES ----------------------------------------------------------
//
// POST /v1/ads/audiences is discriminated by `type`. We type the two shapes we
// use: `customer_list` (created empty, filled via addUsersToZernioAdAudience)
// and Meta-only `lookalike` (fills itself from sourceAudienceId; no upload).
// Reference the resulting id via ZernioAdTargeting.audienceId on ad create.
// https://docs.zernio.com/ad-audiences/create-audience

export type ZernioAdAudience = {
  id?: string;
  _id?: string;
  name?: string;
  type?: string;
  status?: string; // pending | processing | ready — platform-dependent
  platform?: string;
  platformAudienceId?: string;
  approximateCount?: number;
  [key: string]: unknown;
};

export type CreateZernioAdAudienceInput = {
  accountId: string;
  adAccountId: string;
  type: "customer_list" | "lookalike";
  name: string;
  description?: string;
  /** lookalike only: the existing audience to seed from. */
  sourceAudienceId?: string;
  /** lookalike only: ISO country code, e.g. "US". */
  country?: string;
  /** lookalike only: 0.01–0.20 (1%–20% of the country). */
  ratio?: number;
};

/**
 * Create a custom audience. Zernio documents this endpoint as NOT idempotent
 * with no Idempotency-Key support — a blind retry creates a duplicate
 * platform audience, so callers must never auto-retry (zernioFetch does one
 * fetch, no retry loop; keep it that way for this path).
 */
export async function createZernioAdAudience(
  input: CreateZernioAdAudienceInput,
): Promise<{ audience?: ZernioAdAudience; [key: string]: unknown }> {
  return zernioFetch("/ads/audiences", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type ZernioAudienceUser = { email?: string; phone?: string };

// The documented per-request ceiling on POST /v1/ads/audiences/{id}/users.
export const ZERNIO_AUDIENCE_USERS_MAX_PER_REQUEST = 10_000;

/**
 * Upload members to a customer_list audience (422 for other types). Plaintext
 * in — Zernio SHA-256 hashes server-side. Email matches on every platform;
 * phone is Meta-only. Max 10,000 users per request; batching across requests
 * is the caller's job so a mid-batch failure is visible, not swallowed here.
 * https://docs.zernio.com/ad-audiences/add-users
 */
export async function addUsersToZernioAdAudience(
  audienceId: string,
  users: ZernioAudienceUser[],
): Promise<Record<string, unknown>> {
  if (users.length === 0) {
    throw new Error("Audience upload requires at least one user");
  }
  if (users.length > ZERNIO_AUDIENCE_USERS_MAX_PER_REQUEST) {
    throw new Error(
      `Audience upload exceeds Zernio's ${ZERNIO_AUDIENCE_USERS_MAX_PER_REQUEST}-user request limit; chunk before calling`,
    );
  }
  return zernioFetch(`/ads/audiences/${encodeURIComponent(audienceId)}/users`, {
    method: "POST",
    body: JSON.stringify({ users }),
  });
}

/** Local audience record plus fresh platform data (Meta) when available. */
export async function getZernioAdAudience(
  audienceId: string,
): Promise<{ audience?: ZernioAdAudience; [key: string]: unknown }> {
  return zernioFetch(`/ads/audiences/${encodeURIComponent(audienceId)}`);
}

// Paginates per docs: page (1-based), limit max 100, paginated at campaign level.
// https://docs.zernio.com/ad-campaigns/get-ad-tree
//
// `metrics` default to the LAST 90 DAYS unless an explicit window is passed
// (fromDate/toDate, YYYY-MM-DD, max 730d). Existing callers (sync, comment
// fetch) omit the window and keep the 90d default; the analytics layer passes a
// real window to rank "previous campaigns".
export async function getZernioAdsTree(
  options: { fromDate?: string; toDate?: string; status?: string } = {},
): Promise<ZernioAdsTreeCampaign[]> {
  const all: ZernioAdsTreeCampaign[] = [];
  const limit = 100;
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      source: "all",
      page: String(page),
      limit: String(limit),
    });
    if (options.fromDate) params.set("fromDate", options.fromDate);
    if (options.toDate) params.set("toDate", options.toDate);
    if (options.status) params.set("status", options.status);

    const data = await zernioFetch<unknown>(`/ads/tree?${params.toString()}`);

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
  platformCampaignId?: string;
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
    if (ad.platformCampaignId) campaignIds.add(ad.platformCampaignId);
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
          platformCampaignId: typeof cid === "string" ? cid : undefined,
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
  url?: string; // deep-link to the comment (e.g. instagram.com/p/…?comment_id=…)
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
        platform: typeof meta.platform === "string" ? meta.platform : undefined,
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
  adUrl?: string; // link to the ad's underlying post (IG permalink / FB story)
};

// Best public link to an ad's underlying post: IG permalink, else build a
// Facebook URL from the creative's effectiveObjectStoryId.
function adPostUrl(ad: ZernioAd): string | undefined {
  const ig = ad.creative?.instagramPermalinkUrl;
  if (typeof ig === "string" && ig.length > 0) return ig;
  const story =
    ad.creative?.effectiveObjectStoryId ?? ad.effectiveObjectStoryId;
  if (typeof story === "string" && story.length > 0)
    return `https://www.facebook.com/${story}`;
  return undefined;
}

export async function listAllZernioAdComments(options: {
  perAdLimit?: number;
  maxAds?: number;
}): Promise<{
  comments: AdCommentWithContext[];
  errors: Array<{ adId: string; adName?: string; message: string }>;
  totalAds: number;
  adsWithComments: number;
}> {
  const tree = await getZernioAdsTree();

  // Only fetch threads for ads the tree reports as having comments — the
  // rolled-up `metrics.actions.comment` count (verified live 2026-06-05). This
  // skips the ~1700 ads with zero comments AND covers EVERY commented ad rather
  // than blindly slicing the first N. The count is the tree's window (~90d); the
  // fetched comments are filtered to the listening window upstream.
  const ads: Array<{
    id: string;
    name?: string;
    platform?: string;
    url?: string;
  }> = [];
  let totalAds = 0;
  for (const campaign of tree) {
    for (const adSet of campaign.adSets ?? []) {
      for (const ad of adSet.ads ?? []) {
        totalAds++;
        const id =
          ad.id ?? ad._id ?? ad.platformAdId ?? ad.platformId ?? undefined;
        const commentCount = ad.metrics?.actions?.comment ?? 0;
        if (typeof id === "string" && id.length > 0 && commentCount > 0) {
          ads.push({
            id,
            name: ad.name,
            platform: ad.platform ?? campaign.platform,
            url: adPostUrl(ad),
          });
        }
      }
    }
  }

  // Safety cap (rarely binds now that we've filtered to commented ads only).
  const candidates = options.maxAds ? ads.slice(0, options.maxAds) : ads;

  // Fetch threads with bounded concurrency to stay clear of Zernio rate limits.
  const CONCURRENCY = 8;
  const perAdLimit = options.perAdLimit ?? 25;
  const fetched: Array<{
    ad: (typeof candidates)[number];
    res: Awaited<ReturnType<typeof getZernioAdComments>>;
  }> = [];
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const batchRes = await Promise.all(
      batch.map(async (ad) => ({
        ad,
        res: await getZernioAdComments(ad.id, { limit: perAdLimit }),
      })),
    );
    fetched.push(...batchRes);
  }

  const comments: AdCommentWithContext[] = [];
  const errors: Array<{ adId: string; adName?: string; message: string }> = [];
  for (const { ad, res } of fetched) {
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
        adUrl: ad.url,
      });
    }
  }

  return { comments, errors, totalAds, adsWithComments: ads.length };
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
    resolveChannelId?: (
      platform: string,
      accountId?: string,
    ) => string | undefined;
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
