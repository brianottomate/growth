import "server-only";

import { unstable_cache } from "next/cache";

import {
  type AdCommentWithContext,
  getZernioPostComments,
  listAllZernioAdComments,
  listZernioCommentedPosts,
  type ZernioCommentedPost,
  type ZernioPostComment,
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
    const inWindow = res.comments.filter((c) => {
      const t = commentTimeMs(c);
      return t === null || t >= cutoff;
    });

    // The same underlying FB/IG comment surfaces once per ad creative that
    // points at its post (multiple ads can share one post), so the ad tree
    // returns duplicate comment ids. Dedup by comment id — keep the first
    // occurrence (its adName is as good as any). Comments without an id are
    // kept as-is (each is a distinct object).
    const seen = new Set<string>();
    const comments = inWindow.filter((c) => {
      const id = c.id ?? c._id;
      if (id == null) return true;
      const key = String(id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { ...res, comments, recentCount: comments.length };
  },
  ["zernio-recent-ad-comments-v1"],
  { revalidate: CACHE_TTL_SECONDS, tags: [ZERNIO_INBOX_CACHE_TAG] },
);

// ---- Organic comments, eager ------------------------------------------------
// We pull every commented post's actual comments up front (not lazily on
// expand) so the whole set can be triaged and given a needs-reply lens. Per-post
// `getZernioPostComments` is the FAST path — do NOT swap it for the unscoped
// `/inbox/comments` aggregation (the 90–127s timeout documented above).

/** A single top-level organic comment with its post context + reply state. */
export interface OrganicCommentItem {
  comment: ZernioPostComment;
  post: ZernioCommentedPost;
  needsReply: boolean;
}

const COMMENT_FETCH_CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function commentCreatedMs(c: ZernioPostComment): number {
  const t = c.createdTime ? new Date(c.createdTime).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Every recent organic comment across owned posts, flattened to one item per
 * top-level non-owner comment, with `needsReply` derived from whether we've
 * already replied (an owner reply nested under it). Sorted needs-reply first.
 */
export const getRecentOrganicComments = unstable_cache(
  async (): Promise<{ comments: OrganicCommentItem[] }> => {
    const { posts } = await getRecentCommentedPosts();
    const drillable = posts.filter((p) => p.id && p.accountId);

    const perPost = await mapWithConcurrency(
      drillable,
      COMMENT_FETCH_CONCURRENCY,
      async (post) => {
        try {
          const { comments } = await getZernioPostComments(String(post.id), {
            accountId: String(post.accountId),
            limit: 50,
          });
          return { post, comments };
        } catch (error) {
          console.warn(`[listen] comments for post ${post.id} failed:`, error);
          return { post, comments: [] as ZernioPostComment[] };
        }
      },
    );

    const items: OrganicCommentItem[] = [];
    for (const { post, comments } of perPost) {
      for (const comment of comments) {
        if (comment.from?.isOwner) continue; // our own comment — context, not an item
        const repliedByUs = (comment.replies ?? []).some(
          (r) => r.from?.isOwner === true,
        );
        items.push({ comment, post, needsReply: !repliedByUs });
      }
    }

    items.sort((a, b) => {
      if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
      return commentCreatedMs(b.comment) - commentCreatedMs(a.comment);
    });

    return { comments: items };
  },
  ["zernio-organic-comments-v1"],
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
