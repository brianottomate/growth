import "server-only";

import { unstable_cache } from "next/cache";

import {
  type AdCommentWithContext,
  listAllZernioAdComments,
  listZernioCommentedPosts,
  type ZernioCommentedPost,
} from "@/server/clients/zernio.client";

/**
 * Inbox listening is scoped to a rolling window so the surface stays "what's
 * happening lately" and the upstream cost stays bounded. 14 days is the
 * practical horizon for acting on a comment.
 *
 * NOTE (probed 2026-06): `/inbox/comments?since=` filters on POST createdTime,
 * NOT comment activity. For ORGANIC this is a good proxy — engagement decays
 * fast (Zernio content-decay: ~78% within 24h), so a 14-day post window catches
 * essentially all recent organic comment volume. For ADS the proxy is wrong
 * (creatives run for months), so ad comments are filtered by the comment's own
 * timestamp client-side below.
 */
export const LISTENING_WINDOW_DAYS = 14;
const WINDOW_MS = LISTENING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Short TTL — fresh enough for a listening glance, cheap enough to survive a
// page load without hammering Zernio's rate limits. Bust with the tag below.
const CACHE_TTL_SECONDS = 300;
export const ZERNIO_INBOX_CACHE_TAG = "zernio-inbox";

export function commentTimeMs(c: AdCommentWithContext): number | null {
  const raw = c.createdTime ?? c.created_time ?? c.createdAt;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Organic platforms we list comments for. We deliberately DO NOT call
 * `/inbox/comments` unscoped: probed 2026-06-05, the unscoped aggregation folds
 * in Meta-ad comment-counts across every ad (1700+) and takes 90–127s, blowing
 * the gateway timeout → 500 (reproducible on zernio.com's own dashboard too).
 * Per-platform organic calls return in ~2s each. Ads have their own section
 * (`getRecentAdComments`, via the fast ads-tree path), so scoping loses nothing.
 */
const ORGANIC_COMMENT_PLATFORMS = ["facebook", "instagram", "linkedin"] as const;

/**
 * Recent commented posts across the organic platforms — fanned out in parallel
 * (one fast call each) and merged, newest first. `since` is computed inside the
 * cached fn — a few minutes of drift on a 14-day window is irrelevant, and it
 * keeps the cache key stable.
 */
export const getRecentCommentedPosts = unstable_cache(
  async () => {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const perPlatform = await Promise.all(
      ORGANIC_COMMENT_PLATFORMS.map((platform) =>
        listZernioCommentedPosts({
          platform,
          sortBy: "date",
          sortOrder: "desc",
          minComments: 1,
          since,
          limit: 50,
        })
          .then((r) => r.posts)
          .catch((error) => {
            console.warn(`[listen] commented posts ${platform} failed:`, error);
            return [] as ZernioCommentedPost[];
          }),
      ),
    );

    const byId = new Map<string, ZernioCommentedPost>();
    for (const post of perPlatform.flat()) {
      const key = String(post.id ?? `${post.platform}:${post.permalink}`);
      if (!byId.has(key)) byId.set(key, post);
    }
    const posts = [...byId.values()].sort(
      (a, b) =>
        (b.createdTime ? new Date(b.createdTime).getTime() : 0) -
        (a.createdTime ? new Date(a.createdTime).getTime() : 0),
    );
    return { posts };
  },
  ["zernio-recent-commented-posts-v2-organic"],
  { revalidate: CACHE_TTL_SECONDS, tags: [ZERNIO_INBOX_CACHE_TAG] },
);

/**
 * Recent ad-creative comments. We walk the ad tree and fetch per-ad comments,
 * then keep only those within the window (post-time filter would be wrong here).
 * Comments with no parseable timestamp are kept rather than silently dropped.
 */
export const getRecentAdComments = unstable_cache(
  async () => {
    // No maxAds cap — listAllZernioAdComments now fetches threads only for ads
    // the tree flags as having comments, so this covers every commented ad.
    const res = await listAllZernioAdComments({ perAdLimit: 25 });
    const cutoff = Date.now() - WINDOW_MS;
    const comments = res.comments.filter((c) => {
      const t = commentTimeMs(c);
      return t === null || t >= cutoff;
    });
    return { ...res, comments, recentCount: comments.length };
  },
  ["zernio-recent-ad-comments-v1"],
  { revalidate: CACHE_TTL_SECONDS, tags: [ZERNIO_INBOX_CACHE_TAG] },
);

// ---- Context builders (for "Copy context" / "Open in Claude/ChatGPT") -------
// Plain strings assembled server-side and handed to the client action buttons.
// No write-back to any platform — the rep takes the context to their own tool.

export function buildAdCommentContext(c: AdCommentWithContext): string {
  const body = (c.message ?? c.content ?? "").trim();
  const author = c.from?.name ?? "Unknown commenter";
  const lines = [
    "A user left this comment on one of Wander's paid social ads. Help me read the intent and draft a warm, non-salesy reply (2 options).",
    "",
    `Platform: ${c.platform ?? "meta ads"} (ad)`,
    `Ad: ${c.adName ?? c.adId}`,
    `Commenter: ${author}`,
    `Comment: "${body || "(no text)"}"`,
  ];
  if (c.permalink) lines.push(`Link: ${c.permalink}`);
  return lines.join("\n");
}

export function buildPostContext(p: ZernioCommentedPost): string {
  const body = (p.content ?? "").trim();
  const count = p.commentCount ?? 0;
  const lines = [
    "This post on one of Wander's owned social accounts is drawing comments. Help me understand the engagement and decide how to respond (the actual comments are at the link).",
    "",
    `Platform: ${p.platform ?? "?"}${p.subreddit ? ` (r/${p.subreddit})` : ""}`,
    `Account: ${p.accountUsername ?? "(account)"}`,
    `Post: "${body || "(no text)"}"`,
    `Comments: ${count}${p.permalink ? " — read them at the link" : ""}`,
  ];
  if (p.permalink) lines.push(`Link: ${p.permalink}`);
  return lines.join("\n");
}
