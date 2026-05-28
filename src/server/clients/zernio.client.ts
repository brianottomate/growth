import "server-only";

import { env } from "@/env";

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
  [key: string]: unknown;
};

export type ZernioAnalyticsPost = {
  _id?: string;
  id?: string;
  postId?: string;
  urn?: string;
  platform?: string;
  accountId?: string;
  content?: string;
  publishedAt?: string;
  postedAt?: string;
  createdAt?: string;
  url?: string;
  permalink?: string;
  mediaItems?: Array<{ type: string; url: string }>;
  analytics?: ZernioAnalyticsMetrics;
  metrics?: ZernioAnalyticsMetrics;
  [key: string]: unknown;
};

export async function getZernioAnalytics(options: {
  platform: string;
  fromDate: string;
  toDate: string;
}): Promise<ZernioAnalyticsPost[]> {
  const params = new URLSearchParams({
    platform: options.platform,
    fromDate: options.fromDate,
    toDate: options.toDate,
  });
  const data = await zernioFetch<unknown>(`/analytics?${params.toString()}`);
  return unwrapList<ZernioAnalyticsPost>(data, "posts", "data");
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
