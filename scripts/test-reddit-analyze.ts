/**
 * Fetches recent posts from Tier 1 STR-operator subreddits and uses
 * Claude (via AI SDK + Anthropic provider) to score each post for Wander
 * engagement value. Prints a sorted shortlist so we can see what the AI
 * layer would surface before we wire it into the production cron.
 *
 * Run: bun scripts/test-reddit-analyze.ts
 */

import { anthropic } from "@ai-sdk/anthropic";
import { Output, generateText } from "ai";
import { z } from "zod";

const SUBREDDITS = [
  "ShortTermRentals",
  "AirbnbHosts",
  "VRBOHosts",
  "PropertyManagement",
];

const USER_AGENT =
  "web:wandercom-growth-reddit-monitor:0.1.0 (by /u/homi-scout-bot)";

const MODEL = anthropic("claude-sonnet-4-6");

const SYSTEM_PROMPT = `You are a growth analyst at Wander, a vacation-rental company.

Wander has three products relevant to this scoring task:
- WanderOS (wander.com/os): a direct-booking platform for short-term-rental
  property managers — lets them take bookings outside of Airbnb/VRBO to avoid
  OTA fees.
- Wander Sites: branded direct-booking websites for property managers.
- Wander Operated: Wander's full-service property management arm that takes
  over operations for owners frustrated with their current PM.

You are scoring Reddit posts from STR-operator subreddits so the marketing team
knows where to engage in real time. Most posts will be noise (tenant placement,
maintenance, geography-specific tax questions, generic complaints) — be
discerning. Reserve relevance 8+ for posts where a Wander product genuinely
solves the OP's problem and engaging would add value to the thread.`;

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
  const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=25`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    console.warn(`r/${sub} failed: ${res.status}`);
    return [];
  }
  const json = (await res.json()) as {
    data: { children: Array<{ data: PostData }> };
  };
  return json.data.children.map((c) => c.data);
}

function formatPostForLLM(p: PostData): string {
  const body = p.selftext.replace(/\s+/g, " ").slice(0, 600);
  return [
    `id: ${p.id}`,
    `sub: r/${p.subreddit}`,
    `title: ${p.title}`,
    body
      ? `body: ${body}${p.selftext.length > 600 ? "…" : ""}`
      : "body: (link post)",
  ].join("\n");
}

console.log("Fetching Tier 1 subreddits…");
const fetched = await Promise.all(SUBREDDITS.map(fetchSubreddit));
const posts = fetched.flat();
console.log(
  `Fetched ${posts.length} posts across ${SUBREDDITS.length} subs.\n`,
);

console.log("Scoring with Claude Sonnet 4.6…");
const start = Date.now();
const { output, usage } = await generateText({
  model: MODEL,
  system: SYSTEM_PROMPT,
  prompt: `Score each post below. Return one entry per post, using the post's id verbatim.\n\n${posts
    .map(formatPostForLLM)
    .join("\n---\n")}`,
  output: Output.array({
    element: z.object({
      postId: z
        .string()
        .describe("The Reddit post id field, verbatim from the input."),
      relevance: z
        .number()
        .int()
        .min(0)
        .max(10)
        .describe(
          "0 = noise/off-topic. 5 = adjacent operator pain. 8+ = textbook insertion point where a Wander product directly solves the OP's problem.",
        ),
      intentTag: z
        .enum([
          "brand",
          "high-intent",
          "medium-intent",
          "positioning",
          "operator-pain",
          "noise",
        ])
        .describe(
          "brand = direct Wander mention. high-intent = ready-to-act pain (e.g. 'fire my PM', 'paused my listing'). medium-intent = evaluating tools/channels. positioning = direct booking / OTA fee discussion. operator-pain = STR ops friction, brand-adjacent. noise = off-topic.",
        ),
      suggestedAction: z
        .enum(["engage", "monitor", "skip"])
        .describe(
          "engage = team should comment today. monitor = revisit if comments grow. skip = ignore.",
        ),
      rationale: z
        .string()
        .describe("One concise sentence justifying the score."),
    }),
  }),
});
const elapsedMs = Date.now() - start;

console.log(
  `Scored ${output.length} posts in ${(elapsedMs / 1000).toFixed(1)}s · ${usage.inputTokens ?? "?"} in / ${usage.outputTokens ?? "?"} out tokens\n`,
);

const byId = new Map(posts.map((p) => [p.id, p]));
const sorted = [...output].sort((a, b) => b.relevance - a.relevance);

const engage = sorted.filter((s) => s.suggestedAction === "engage");
const monitor = sorted.filter((s) => s.suggestedAction === "monitor");

function printGroup(label: string, items: typeof sorted) {
  if (items.length === 0) {
    console.log(`\n=== ${label}: 0 ===`);
    return;
  }
  console.log(`\n=== ${label}: ${items.length} ===`);
  for (const s of items) {
    const p = byId.get(s.postId);
    if (!p) {
      console.log(`  [missing post] ${s.postId} — ${s.rationale}`);
      continue;
    }
    const age = Math.floor((Date.now() / 1000 - p.created_utc) / 60);
    const ageStr = age < 60 ? `${age}m` : `${Math.floor(age / 60)}h`;
    console.log(
      `\n  [${s.relevance}/10 · ${s.intentTag}] r/${p.subreddit} · ${ageStr} · ${p.ups}↑ ${p.num_comments}c`,
    );
    console.log(`    ${p.title}`);
    console.log(`    → ${s.rationale}`);
    console.log(`    https://reddit.com${p.permalink}`);
  }
}

printGroup("ENGAGE (act today)", engage);
printGroup("MONITOR (revisit later)", monitor);

const skipCount = sorted.length - engage.length - monitor.length;
console.log(`\n=== SKIP: ${skipCount} (not shown) ===`);
