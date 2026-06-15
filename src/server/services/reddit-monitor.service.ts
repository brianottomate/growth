import "server-only";

import {
  SUGGESTED_ACTIONS,
  draftReply,
  scoreItems,
  type DraftChannel,
  type ScoringChannel,
  type SuggestedAction,
} from "@/server/services/triage.service";

export { SUGGESTED_ACTIONS, type SuggestedAction };

export const TIER_1_SUBREDDITS = [
  // Core STR operator communities
  "ShortTermRentals",
  "AirbnbHosts",
  "VRBOHosts",
  "PropertyManagement",
  // Adjacent — operators earlier in their journey
  "airbnb",
  "vrbo",
  "realestateinvesting",
  "Landlord",
];

const USER_AGENT =
  "web:wandercom-growth-reddit-monitor:0.1.0 (by /u/homi-scout-bot)";

const SCORING_SYSTEM_PROMPT = `You are a growth analyst at Wander, a vacation-rental company.

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
solves the OP's problem and engaging would add value to the thread.

Key competitors to watch for (mentions of these are high-signal):
- Hostaway, Guesty, OwnerRez, Hospitable, Lodgify, Streamline, Escapia
- Posts complaining about or switching from these competitors are prime
  engagement opportunities for Wander.

High-intent language to watch for:
- "alternative to [competitor]", "switching from", "looking for",
  "anyone using", "vs", "recommend", "OTA fees", "direct booking"
- These indicate active evaluation — score them higher.`;

const DRAFT_SYSTEM_PROMPT = `You write Reddit reply drafts for the Wander
growth team. Reddit punishes self-promotion, so every reply must:

1. Open by genuinely answering the OP's question or engaging with their
   problem. No pitch in the first paragraph.
2. Disclose Wander affiliation plainly ("I work at Wander, so take this with
   a grain of salt"). Disclosure is non-negotiable on Reddit.
3. Mention WanderOS / Wander Sites / Wander Operated only when it directly
   solves the OP's problem, and only as a single sentence at the end. Never
   link to wander.com — leave that to the OP to ask for.
4. Use the tone of an experienced operator, not marketing. Concrete,
   first-person, humble. No exclamation points.
5. Stay under 150 words.

If the post is a critical brand mention or operator complaint about Wander,
the reply should acknowledge the issue directly, apologize on behalf of the
team, offer to help, and skip any product pitch.`;

interface RedditPostData {
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

export interface RedditPostSummary {
  id: string;
  subreddit: string;
  title: string;
  body: string;
  author: string;
  url: string;
  createdUtc: number;
  ups: number;
  numComments: number;
}

export const INTENT_TAGS = [
  "brand",
  "high-intent",
  "medium-intent",
  "positioning",
  "operator-pain",
  "noise",
] as const;
export type IntentTag = (typeof INTENT_TAGS)[number];

export interface ScoredPost {
  post: RedditPostSummary;
  relevance: number;
  intentTag: IntentTag;
  suggestedAction: SuggestedAction;
  rationale: string;
}

async function fetchSubreddit(sub: string): Promise<RedditPostData[]> {
  const res = await fetch(
    `https://www.reddit.com/r/${sub}/new.json?limit=25`,
    { headers: { "User-Agent": USER_AGENT }, cache: "no-store" },
  );
  if (!res.ok) {
    console.warn(
      `[reddit-monitor] r/${sub} fetch failed: ${res.status} ${res.statusText}`,
    );
    return [];
  }
  const json = (await res.json()) as {
    data: { children: Array<{ data: RedditPostData }> };
  };
  return json.data.children.map((c) => c.data);
}

function toSummary(p: RedditPostData): RedditPostSummary {
  return {
    id: p.id,
    subreddit: p.subreddit,
    title: p.title,
    body: p.selftext,
    author: p.author,
    url: `https://reddit.com${p.permalink}`,
    createdUtc: p.created_utc,
    ups: p.ups,
    numComments: p.num_comments,
  };
}

export async function fetchTier1Posts(): Promise<RedditPostSummary[]> {
  const fetched = await Promise.all(TIER_1_SUBREDDITS.map(fetchSubreddit));
  return fetched.flat().map(toSummary);
}

function formatPostForLLM(p: RedditPostSummary): string {
  const body = p.body.replace(/\s+/g, " ").slice(0, 600);
  return [
    `id: ${p.id}`,
    `sub: r/${p.subreddit}`,
    `title: ${p.title}`,
    body ? `body: ${body}${p.body.length > 600 ? "…" : ""}` : "body: (link post)",
  ].join("\n");
}

const SCORING_CHANNEL: ScoringChannel<RedditPostSummary, IntentTag> = {
  intentTags: INTENT_TAGS,
  systemPrompt: SCORING_SYSTEM_PROMPT,
  getId: (p) => p.id,
  formatItem: formatPostForLLM,
  relevanceDescription:
    "0 = noise/off-topic. 5 = adjacent operator pain. 8+ = textbook insertion point where a Wander product directly solves the OP's problem.",
  intentTagDescription:
    "brand = direct Wander mention. high-intent = ready-to-act pain. medium-intent = evaluating tools/channels. positioning = direct booking / OTA fee discussion. operator-pain = STR ops friction, brand-adjacent. noise = off-topic.",
};

export async function scoreRedditPosts(
  posts: RedditPostSummary[],
): Promise<ScoredPost[]> {
  const { scored } = await scoreItems(SCORING_CHANNEL, posts);
  return scored.map((s) => ({
    post: s.item,
    relevance: s.relevance,
    intentTag: s.intentTag,
    suggestedAction: s.suggestedAction,
    rationale: s.rationale,
  }));
}

export async function scanAndScore(): Promise<{
  scored: ScoredPost[];
  totalFetched: number;
}> {
  const posts = await fetchTier1Posts();
  const scored = await scoreRedditPosts(posts);
  return { scored, totalFetched: posts.length };
}

export const DRAFT_PILLS = [
  "short",
  "no-pitch",
  "lead-with-question",
  "story-first",
  "focus-wanderos",
  "focus-sites",
  "focus-operated",
] as const;
export type DraftPill = (typeof DRAFT_PILLS)[number];

const PILL_INSTRUCTIONS: Record<DraftPill, string> = {
  short: "Keep the reply under 80 words.",
  "no-pitch":
    "Do not mention any Wander product. Provide pure value to the OP. Disclosure of affiliation is still required.",
  "lead-with-question":
    "Open the reply with a clarifying question to the OP before answering.",
  "story-first":
    "Open with a brief first-person anecdote from STR operations before answering.",
  "focus-wanderos":
    "If you mention a Wander product, focus on WanderOS (the direct-booking platform).",
  "focus-sites":
    "If you mention a Wander product, focus on Wander Sites (branded direct-booking websites).",
  "focus-operated":
    "If you mention a Wander product, focus on Wander Operated (full-service property management).",
};

const DRAFT_CHANNEL: DraftChannel<DraftPill> = {
  systemPrompt: DRAFT_SYSTEM_PROMPT,
  pillInstructions: PILL_INSTRUCTIONS,
};

export async function draftReplyForPost(input: {
  post: RedditPostSummary;
  intentTag: IntentTag;
  rationale: string;
  pills?: DraftPill[];
  customInstructions?: string;
}): Promise<string> {
  const body = input.post.body.replace(/\s+/g, " ").slice(0, 1200);

  return draftReply(DRAFT_CHANNEL, {
    pills: input.pills,
    customInstructions: input.customInstructions,
    promptBody: `Reddit post to reply to:

sub: r/${input.post.subreddit}
title: ${input.post.title}
body: ${body || "(link post — no body text)"}

Scoring context from our analyst:
- intent tag: ${input.intentTag}
- rationale: ${input.rationale}

Draft the reply. Do NOT include any preamble like "Here's a draft:" — output the reply text directly.`,
  });
}
