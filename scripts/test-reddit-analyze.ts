/**
 * Pulls latest posts from each Tier 1 sub, no time filter.
 * Dumps title + first 200 chars of selftext so we can score them by hand
 * (or feed to an LLM later).
 * Run: bun scripts/test-reddit-analyze.ts
 */

const SUBREDDITS = [
  "ShortTermRentals",
  "AirbnbHosts",
  "VRBOHosts",
  "PropertyManagement",
];

const USER_AGENT =
  "web:wandercom-growth-reddit-monitor:0.1.0 (by /u/homi-scout-bot)";

interface PostData {
  id: string;
  title: string;
  selftext: string;
  permalink: string;
  created_utc: number;
  author: string;
  subreddit: string;
  num_comments: number;
  ups: number;
}

async function fetchSubreddit(sub: string): Promise<PostData[]> {
  const res = await fetch(
    `https://www.reddit.com/r/${sub}/new.json?limit=25`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!res.ok) {
    console.warn(`r/${sub} failed: ${res.status}`);
    return [];
  }
  const json = (await res.json()) as {
    data: { children: Array<{ data: PostData }> };
  };
  return json.data.children.map((c) => c.data);
}

const all = await Promise.all(SUBREDDITS.map(fetchSubreddit));

for (let i = 0; i < SUBREDDITS.length; i++) {
  const sub = SUBREDDITS[i]!;
  const posts = all[i]!;
  console.log(`\n=== r/${sub} (${posts.length} posts) ===`);
  for (const p of posts.slice(0, 10)) {
    const age = Math.floor((Date.now() / 1000 - p.created_utc) / 60);
    const ageStr = age < 60 ? `${age}m` : `${Math.floor(age / 60)}h`;
    const body = p.selftext.replace(/\s+/g, " ").slice(0, 200);
    console.log(`\n[${ageStr} · ${p.ups}↑ · ${p.num_comments}c] ${p.title}`);
    if (body) console.log(`  ${body}${p.selftext.length > 200 ? "…" : ""}`);
    console.log(`  https://reddit.com${p.permalink}`);
  }
}
