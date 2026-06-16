import "server-only";

/**
 * Reddit native feed endpoints — RSS (Atom) and JSON.
 *
 * These are Reddit's OWN first-party feeds: append `.rss` or `.json` to almost
 * any Reddit URL. Consuming them is far more defensible than third-party
 * scrapers (Apify / BrightData) since you're reading Reddit's published output,
 * not scraping HTML. It is NOT a contracted commercial API with an SLA, though
 * — for real volume the sanctioned path is the OAuth Data API (100 QPM free).
 *
 * Rate limiting (changed June 2026): anonymous RSS is throttled to ~1 req/min
 * and returns HTTP 429 when exceeded. The workaround is the per-account
 * `user=` + `feed=` tokens from https://www.reddit.com/prefs/feeds/ — pass them
 * via `RedditFeedTokens` and they apply to any public feed, including search.
 * (Plain cookie/login auth alone does NOT clear the 429 — it must be those
 * URL params.) JSON endpoints have their own anonymous limit (~10 req/min); use
 * OAuth there if you scale up.
 *
 * For comparison, the existing monitor (reddit-monitor.service.ts) polls the
 * native JSON listing `/r/{sub}/new.json` — same ToS posture as these helpers.
 */

export const REDDIT_BASE = "https://www.reddit.com";

/** Reddit asks for a descriptive UA; mirrors reddit-monitor.service.ts. */
export const REDDIT_USER_AGENT =
  "web:wandercom-growth-reddit-monitor:0.1.0 (by /u/homi-scout-bot)";

export type RedditFormat = "json" | "rss";
export type RedditSort = "relevance" | "new" | "top" | "comments" | "hot";
export type RedditTime = "hour" | "day" | "week" | "month" | "year" | "all";
export type RedditListing = "new" | "hot" | "top" | "rising";

/** Per-account tokens from reddit.com/prefs/feeds/ — clears the RSS 429. */
export interface RedditFeedTokens {
  user?: string;
  feed?: string;
}

function build(
  path: string,
  params: Record<string, string | number | undefined>,
  tokens?: RedditFeedTokens,
): string {
  const url = new URL(REDDIT_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  if (tokens?.user) url.searchParams.set("user", tokens.user);
  if (tokens?.feed) url.searchParams.set("feed", tokens.feed);
  return url.toString();
}

/**
 * Keyword search across all of Reddit, or one subreddit when `subreddit` is set.
 * Posts only (Reddit comment search is unreliable). `q` supports search
 * operators: "exact phrase", title:, selftext:, author:, subreddit:, OR.
 *   redditSearchUrl({ q: "wander.com" })
 *   redditSearchUrl({ q: "OTA fees", subreddit: "AirbnbHosts", time: "week" })
 */
export function redditSearchUrl(opts: {
  q: string;
  subreddit?: string;
  format?: RedditFormat;
  sort?: RedditSort;
  time?: RedditTime;
  limit?: number;
  tokens?: RedditFeedTokens;
}): string {
  const {
    q,
    subreddit,
    format = "json",
    sort = "new",
    time,
    limit = 25,
  } = opts;
  const path = subreddit
    ? `/r/${subreddit}/search.${format}`
    : `/search.${format}`;
  return build(
    path,
    { q, sort, t: time, limit, restrict_sr: subreddit ? "on" : undefined },
    opts.tokens,
  );
}

/**
 * A subreddit's listing feed.
 *   redditSubredditUrl("AirbnbHosts")                       // new.json
 *   redditSubredditUrl("AirbnbHosts", { format: "rss" })    // new/.rss
 *   redditSubredditUrl("AirbnbHosts", { listing: "top", time: "week" })
 */
export function redditSubredditUrl(
  subreddit: string,
  opts: {
    listing?: RedditListing;
    format?: RedditFormat;
    time?: RedditTime;
    limit?: number;
    tokens?: RedditFeedTokens;
  } = {},
): string {
  const { listing = "new", format = "json", time, limit = 25 } = opts;
  // JSON: /r/{sub}/new.json · RSS: /r/{sub}/new/.rss
  const path =
    format === "rss"
      ? `/r/${subreddit}/${listing}/.rss`
      : `/r/${subreddit}/${listing}.json`;
  return build(path, { t: time, limit }, opts.tokens);
}

/** A user's activity feed (the "user search" path). */
export function redditUserUrl(
  username: string,
  opts: { format?: RedditFormat; tokens?: RedditFeedTokens } = {},
): string {
  const format = opts.format ?? "json";
  const path =
    format === "rss" ? `/user/${username}/.rss` : `/user/${username}.json`;
  return build(path, {}, opts.tokens);
}

/**
 * Hydrate a single post (and its comments) from a permalink or full URL —
 * the high-value companion to F5Bot, which hands you a permalink + snippet but
 * no thread context (score, age, parent comment, OP).
 *   redditPostThreadUrl("/r/AirbnbHosts/comments/abc123/title/")
 */
export function redditPostThreadUrl(
  permalinkOrUrl: string,
  opts: { format?: RedditFormat; tokens?: RedditFeedTokens } = {},
): string {
  const format = opts.format ?? "json";
  // Normalize to a path, strip query/trailing slash, then append the suffix.
  let path = permalinkOrUrl.replace(/^https?:\/\/[^/]+/i, "").split("?")[0]!;
  path = path.replace(/\/+$/, "");
  const suffix = format === "rss" ? "/.rss" : ".json";
  return build(path + suffix, {}, opts.tokens);
}

/** Minimal fetch for the JSON endpoints — sets the UA Reddit expects. */
export async function fetchRedditJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": REDDIT_USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Reddit ${res.status} ${res.statusText} for ${url}` +
        (res.status === 429 ? " (rate limited — see RedditFeedTokens)" : ""),
    );
  }
  return (await res.json()) as T;
}

/**
 * Reference catalog — the endpoints worth knowing, with live wander.com
 * examples. Safe to surface in the /listen tool directory as documentation.
 */
export const REDDIT_ENDPOINTS = [
  {
    key: "search",
    label: "Keyword search (all of Reddit)",
    description:
      "Brand/keyword monitoring across Reddit. The native equivalent of an F5Bot keyword, on demand. Posts only.",
    json: redditSearchUrl({ q: "wander.com" }),
    rss: redditSearchUrl({ q: "wander.com", format: "rss" }),
  },
  {
    key: "search_sub",
    label: "Search within a subreddit",
    description: "Same, scoped to one community (restrict_sr=on).",
    json: redditSearchUrl({ q: "OTA fees", subreddit: "AirbnbHosts" }),
    rss: redditSearchUrl({
      q: "OTA fees",
      subreddit: "AirbnbHosts",
      format: "rss",
    }),
  },
  {
    key: "subreddit",
    label: "Subreddit new posts",
    description: "What the cron monitor polls — latest posts in a target sub.",
    json: redditSubredditUrl("AirbnbHosts"),
    rss: redditSubredditUrl("AirbnbHosts", { format: "rss" }),
  },
  {
    key: "user",
    label: "User activity",
    description: "Track a specific operator/competitor account's posts.",
    json: redditUserUrl("spez"),
    rss: redditUserUrl("spez", { format: "rss" }),
  },
  {
    key: "post",
    label: "Post + comments (hydration)",
    description:
      "Pull full thread context for a permalink — enriches an F5Bot mention before triage.",
    json: redditPostThreadUrl("/r/AirbnbHosts/comments/abc123/example_post/"),
    rss: redditPostThreadUrl("/r/AirbnbHosts/comments/abc123/example_post/", {
      format: "rss",
    }),
  },
] as const;

export type RedditEndpoint = (typeof REDDIT_ENDPOINTS)[number];
