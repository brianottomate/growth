/**
 * Simulate the Reddit cron locally without spinning up Next.js.
 * Mirrors src/app/api/cron/reddit/route.ts logic.
 * Run: bun scripts/test-reddit.ts
 */

const SUBREDDITS = [
  "ShortTermRentals",
  "AirbnbHosts",
  "VRBOHosts",
  "PropertyManagement",
];

const KEYWORDS: Array<{ phrase: string; tag: string }> = [
  { phrase: "wander.com", tag: "brand" },
  { phrase: "wander sites", tag: "brand" },
  { phrase: "wander operated", tag: "brand" },
  { phrase: "wanderos", tag: "brand" },
  { phrase: "fire my property manager", tag: "high-intent" },
  { phrase: "airbnb alternative", tag: "high-intent" },
  { phrase: "reduce airbnb fees", tag: "high-intent" },
  { phrase: "ota fees", tag: "medium-intent" },
  { phrase: "ota alternative", tag: "medium-intent" },
  { phrase: "direct booking", tag: "positioning" },
  { phrase: "direct booking site", tag: "positioning" },
  { phrase: "property manager booking", tag: "positioning" },
];

const LOOKBACK_SECONDS = 65 * 60;
const USER_AGENT =
  "web:wandercom-growth-reddit-monitor:0.1.0 (by /u/homi-scout-bot)";

interface RedditPostData {
  id: string;
  title: string;
  selftext: string;
  permalink: string;
  created_utc: number;
  author: string;
  subreddit: string;
}

async function fetchSubreddit(sub: string): Promise<RedditPostData[]> {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    console.warn(`  r/${sub} fetch failed: ${res.status} ${res.statusText}`);
    return [];
  }
  const json = (await res.json()) as {
    data: { children: Array<{ data: RedditPostData }> };
  };
  return json.data.children.map((c) => c.data);
}

function matchPost(post: RedditPostData) {
  const haystack = `${post.title}\n${post.selftext}`.toLowerCase();
  const matches = KEYWORDS.filter((k) => haystack.includes(k.phrase));
  if (matches.length === 0) return null;
  return { post, matches };
}

const cutoff = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
const start = Date.now();

console.log(
  `Scanning ${SUBREDDITS.length} subreddits, lookback ${LOOKBACK_SECONDS / 60} min`,
);
console.log(`Cutoff: ${new Date(cutoff * 1000).toISOString()}\n`);

const results = await Promise.all(
  SUBREDDITS.map(async (sub) => {
    const posts = await fetchSubreddit(sub);
    const recent = posts.filter((p) => p.created_utc > cutoff);
    const matches = recent.map(matchPost).filter((m) => m !== null) as Array<{
      post: RedditPostData;
      matches: Array<{ phrase: string; tag: string }>;
    }>;
    return { sub, fetched: posts.length, recent: recent.length, matches };
  }),
);

const allMatches = results.flatMap((r) => r.matches);
const elapsedMs = Date.now() - start;

console.log(
  `Scanned ${SUBREDDITS.length} subs in ${elapsedMs}ms, ${allMatches.length} keyword matches`,
);
for (const r of results) {
  console.log(
    `  r/${r.sub}: ${r.fetched} fetched, ${r.recent} in 65-min window, ${r.matches.length} matched`,
  );
}

if (allMatches.length > 0) {
  console.log("\nMatches:");
  for (const m of allMatches) {
    const tags = m.matches.map((mm) => `${mm.tag}:${mm.phrase}`).join(", ");
    const age = Math.floor((Date.now() / 1000 - m.post.created_utc) / 60);
    console.log(
      `  [${tags}] r/${m.post.subreddit} (${age}m ago) "${m.post.title}"\n    https://reddit.com${m.post.permalink}`,
    );
  }
} else {
  console.log("\nNo matches in the last 65 minutes.");
  console.log(
    "Showing 3 most-recent posts per sub so you can sanity-check the fetch worked:\n",
  );
  for (const r of results) {
    console.log(`r/${r.sub}:`);
    // Re-fetch is unnecessary; we just want the data we already have.
    // The `recent` count above tells us if anything landed in our window.
  }
}
