import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";

// Tier 1 subs from the WanderOS Reddit marketing plan.
// Add more here as the team identifies new high-signal communities.
const SUBREDDITS = [
  "ShortTermRentals",
  "AirbnbHosts",
  "VRBOHosts",
  "PropertyManagement",
];

// Lowercased substrings we match against title + selftext.
// Tagged so log output makes the "why this matched" obvious.
const KEYWORDS: Array<{ phrase: string; tag: string }> = [
  // Brand
  { phrase: "wander.com", tag: "brand" },
  { phrase: "wander sites", tag: "brand" },
  { phrase: "wander operated", tag: "brand" },
  { phrase: "wanderos", tag: "brand" },
  // High-intent pain
  { phrase: "fire my property manager", tag: "high-intent" },
  { phrase: "airbnb alternative", tag: "high-intent" },
  { phrase: "reduce airbnb fees", tag: "high-intent" },
  { phrase: "ota fees", tag: "medium-intent" },
  { phrase: "ota alternative", tag: "medium-intent" },
  // Topical / positioning
  { phrase: "direct booking", tag: "positioning" },
  { phrase: "direct booking site", tag: "positioning" },
  { phrase: "property manager booking", tag: "positioning" },
];

// Cron runs hourly (see vercel.json); we look back 65 min to give ourselves
// a buffer against clock skew, Vercel's "within the minute" delivery window,
// and the fact that Vercel may deliver the same cron event twice.
// Per Vercel cron docs: design for idempotency — duplicate log lines are OK,
// but if we ever start posting to Slack, we'd need a dedup table here.
const LOOKBACK_SECONDS = 65 * 60;

// Reddit ratelimits by User-Agent and aggressively rejects generic ones.
// Format follows Reddit's convention: <platform>:<app id>:<version> (by /u/<reddit username>).
// TODO: replace /u/homi-scout-bot with the team's own registered Reddit account once we have one.
const USER_AGENT =
  "web:wandercom-growth-reddit-monitor:0.1.0 (by /u/homi-scout-bot)";

interface RedditPostData {
  id: string;
  title: string;
  selftext: string;
  permalink: string;
  url: string;
  created_utc: number;
  author: string;
  subreddit: string;
}

interface RedditListing {
  data: {
    children: Array<{ kind: string; data: RedditPostData }>;
  };
}

interface Match {
  subreddit: string;
  postId: string;
  title: string;
  author: string;
  url: string;
  createdUtc: number;
  matches: Array<{ phrase: string; tag: string }>;
}

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;

  return bearer === env.ADMIN_TOKEN;
}

async function fetchSubreddit(sub: string): Promise<RedditPostData[]> {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(
      `[reddit-monitor] r/${sub} fetch failed: ${res.status} ${res.statusText}`,
    );
    return [];
  }
  const json = (await res.json()) as RedditListing;
  return json.data.children.map((c) => c.data);
}

function matchPost(post: RedditPostData): Match | null {
  const haystack = `${post.title}\n${post.selftext}`.toLowerCase();
  const matches = KEYWORDS.filter((k) => haystack.includes(k.phrase));
  if (matches.length === 0) return null;
  return {
    subreddit: post.subreddit,
    postId: post.id,
    title: post.title,
    author: post.author,
    url: `https://reddit.com${post.permalink}`,
    createdUtc: post.created_utc,
    matches,
  };
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const cutoff = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
  const start = Date.now();

  const results = await Promise.all(
    SUBREDDITS.map(async (sub) => {
      const posts = await fetchSubreddit(sub);
      const recent = posts.filter((p) => p.created_utc > cutoff);
      const matches = recent
        .map(matchPost)
        .filter((m): m is Match => m !== null);
      return { sub, fetched: posts.length, recent: recent.length, matches };
    }),
  );

  const allMatches = results.flatMap((r) => r.matches);
  const elapsedMs = Date.now() - start;

  console.log(
    `[reddit-monitor] scanned ${SUBREDDITS.length} subs in ${elapsedMs}ms, ${allMatches.length} matches`,
  );
  for (const r of results) {
    console.log(
      `[reddit-monitor]   r/${r.sub}: ${r.fetched} fetched, ${r.recent} in window, ${r.matches.length} matched`,
    );
  }
  for (const m of allMatches) {
    const tags = m.matches.map((mm) => `${mm.tag}:${mm.phrase}`).join(", ");
    console.log(
      `[reddit-monitor] MATCH r/${m.subreddit} [${tags}] "${m.title}" — ${m.url}`,
    );
  }

  return NextResponse.json({
    success: true,
    elapsedMs,
    subreddits: results.map((r) => ({
      sub: r.sub,
      fetched: r.fetched,
      recent: r.recent,
      matches: r.matches.length,
    })),
    matches: allMatches,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
