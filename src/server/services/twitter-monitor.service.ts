import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  mentionTable,
  type MentionInsert,
} from "@/server/db/listening-schema";
import {
  INTENT_TAGS,
  type DraftPill,
  type IntentTag,
  type SuggestedAction,
} from "@/server/services/reddit-monitor.service";
import { loadListeningContext } from "@/server/services/listening-config.service";
import { postMentionsToRadio } from "@/server/services/listening-notify.service";
import {
  composeListeningSystemPrompt,
  draftReply,
  scoreItems,
  type ScoringChannel,
} from "@/server/services/triage.service";
import { X_WATCHLIST } from "@/lib/x-watchlist";

const SCORING_SYSTEM_PROMPT = `You are a growth analyst at Wander, a vacation-rental company.

Wander has three products relevant to this scoring task:
- WanderOS (wander.com/os): a direct-booking platform for short-term-rental
  property managers — lets them take bookings outside of Airbnb/VRBO to avoid
  OTA fees.
- Wander Sites: branded direct-booking websites for property managers.
- Wander Operated: Wander's full-service property management arm that takes
  over operations for owners frustrated with their current PM.

You are scoring tweets so the marketing team knows where to engage in real
time. Tweets are short — be liberal about asking yourself what the OP probably
means. Reserve relevance 8+ for tweets where a Wander product directly solves
the OP's problem and a reply would add value to the thread.

Key competitors (mentions are high-signal):
- Hostaway, Guesty, OwnerRez, Hospitable, Lodgify, Streamline, Escapia
- Tweets complaining about or comparing these competitors are prime
  engagement opportunities.`;

const DRAFT_SYSTEM_PROMPT = `You write Twitter / X reply drafts for the Wander
growth team. Reddit etiquette doesn't apply here; tweets are short, casual,
and public. Every reply must:

1. Be under 270 characters (leaving room for the @-mention prefix).
2. Sound like a human operator, not a brand. First-person, conversational.
3. Disclose Wander affiliation briefly if you're mentioning Wander
   ("disclosure: I work at Wander"). Skip the disclosure if there's no Wander
   mention.
4. Mention WanderOS / Wander Sites / Wander Operated only when it directly
   solves the OP's problem, and only as a short phrase. Never link to
   wander.com.
5. If the tweet is a critical brand mention or complaint about Wander,
   acknowledge it directly and offer to help over DM. Skip any product pitch.

No hashtags. No emojis. No exclamation points.`;

interface RawTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  lang?: string;
  public_metrics?: {
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
    quote_count?: number;
    impression_count?: number;
  };
}

interface RawUser {
  id: string;
  name: string;
  username: string;
  public_metrics?: { followers_count?: number };
}

interface RawSearchResponse {
  data?: RawTweet[];
  includes?: { users?: RawUser[] };
  meta?: { result_count?: number };
  errors?: Array<{ message?: string; title?: string }>;
}

export interface TweetSummary {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string;
  url: string;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  retweetCount: number;
  viewCount: number;
  authorFollowers: number;
}

export interface ScoredTweet {
  tweet: TweetSummary;
  relevance: number;
  intentTag: IntentTag;
  suggestedAction: SuggestedAction;
  rationale: string;
}

// Brand + STR pain phrases combined into one X recent-search query. The term
// groups live in src/lib/x-watchlist.ts so the /app/listen X tab renders the
// same watchlist that drives this scan.
const SEARCH_QUERY = X_WATCHLIST.flatMap((g) => g.terms)
  .map((t) => `"${t}"`)
  .join(" OR ");

const FULL_QUERY = `(${SEARCH_QUERY}) -is:retweet lang:en`;

export async function searchRecentTweets(): Promise<TweetSummary[]> {
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) {
    throw new Error("X_BEARER_TOKEN is not set");
  }

  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", FULL_QUERY);
  url.searchParams.set("max_results", "50");
  url.searchParams.set(
    "tweet.fields",
    "created_at,public_metrics,author_id,lang",
  );
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username,name,public_metrics");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `X recent search failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as RawSearchResponse;
  const tweets = json.data ?? [];
  const userById = new Map((json.includes?.users ?? []).map((u) => [u.id, u]));

  return tweets.map<TweetSummary>((t) => {
    const user = userById.get(t.author_id);
    const username = user?.username ?? "unknown";
    return {
      id: t.id,
      text: t.text,
      authorUsername: username,
      authorName: user?.name ?? username,
      url: `https://x.com/${username}/status/${t.id}`,
      createdAt: t.created_at,
      likeCount: t.public_metrics?.like_count ?? 0,
      replyCount: t.public_metrics?.reply_count ?? 0,
      retweetCount: t.public_metrics?.retweet_count ?? 0,
      viewCount: t.public_metrics?.impression_count ?? 0,
      authorFollowers: user?.public_metrics?.followers_count ?? 0,
    };
  });
}

function formatTweetForLLM(t: TweetSummary): string {
  const text = t.text.replace(/\s+/g, " ").slice(0, 500);
  return [
    `id: ${t.id}`,
    `author: @${t.authorUsername}`,
    `text: ${text}`,
    `engagement: ${t.likeCount}♥ ${t.replyCount}💬 ${t.retweetCount}🔁`,
  ].join("\n");
}

const SCORING_CHANNEL: ScoringChannel<TweetSummary, IntentTag> = {
  intentTags: INTENT_TAGS,
  systemPrompt: SCORING_SYSTEM_PROMPT,
  getId: (t) => t.id,
  formatItem: formatTweetForLLM,
  relevanceDescription:
    "0 = noise/off-topic. 5 = adjacent operator pain. 8+ = textbook engagement opportunity.",
};

export async function scoreTweets(
  tweets: TweetSummary[],
): Promise<ScoredTweet[]> {
  const { scored } = await scoreItems(SCORING_CHANNEL, tweets);
  return scored.map((s) => ({
    tweet: s.item,
    relevance: s.relevance,
    intentTag: s.intentTag,
    suggestedAction: s.suggestedAction,
    rationale: s.rationale,
  }));
}

export async function scanAndScoreTweets(): Promise<{
  scored: ScoredTweet[];
  totalFetched: number;
}> {
  const tweets = await searchRecentTweets();
  const scored = await scoreTweets(tweets);
  return { scored, totalFetched: tweets.length };
}

export interface XScanResult {
  fetched: number;
  fresh: number;
  scored: number;
  inserted: number;
  engage: number;
  broadcast: number;
}

/**
 * Cron entrypoint: search → dedup → score → persist → broadcast. Mirrors the
 * Instagram account-watch pipeline (instagram-watch.service), so X mentions flow
 * through the same `mention` table, /app/listen-v2 surface, and
 * #radio-social-listening broadcast (engage-gated, owner @-mentioned) as every
 * other source.
 *
 * Recent search re-returns the same tweets every run (it looks back ~7 days), so
 * we dedup against already-stored urls BEFORE scoring — scoring costs LLM tokens,
 * and there's no point re-scoring a tweet we've already triaged. The unique `url`
 * index + onConflictDoNothing is the final backstop against a concurrent run.
 */
export async function scanScoreAndPersistTweets(opts?: {
  dryRun?: boolean;
}): Promise<XScanResult> {
  const tweets = await searchRecentTweets();
  const result: XScanResult = {
    fetched: tweets.length,
    fresh: 0,
    scored: 0,
    inserted: 0,
    engage: 0,
    broadcast: 0,
  };
  if (tweets.length === 0) return result;

  const urls = tweets.map((t) => t.url);
  const existing = await db
    .select({ url: mentionTable.url })
    .from(mentionTable)
    .where(inArray(mentionTable.url, urls));
  const seen = new Set(existing.map((r) => r.url));
  const novel = tweets.filter((t) => !seen.has(t.url));
  result.fresh = novel.length;
  if (novel.length === 0 || opts?.dryRun) return result;

  const scored = await scoreTweets(novel);
  result.scored = scored.length;

  const inserts: MentionInsert[] = [];
  for (const s of scored) {
    const t = s.tweet;
    const draft =
      s.suggestedAction === "engage"
        ? await draftTweetReplyForPost({
            tweet: { authorUsername: t.authorUsername, text: t.text },
            intentTag: s.intentTag,
            rationale: s.rationale,
          }).catch(() => null)
        : null;
    inserts.push({
      provider: "x-api",
      source: "twitter",
      sourceType: "post",
      externalId: t.id,
      url: t.url,
      author: t.authorUsername,
      snippet: t.text.slice(0, 1500),
      postedAt: new Date(t.createdAt),
      relevance: s.relevance,
      intentTag: s.intentTag,
      suggestedAction: s.suggestedAction,
      rationale: s.rationale,
      suggestedReply: draft,
      status: "new",
      raw: {
        authorName: t.authorName,
        likeCount: t.likeCount,
        replyCount: t.replyCount,
        retweetCount: t.retweetCount,
        viewCount: t.viewCount,
        authorFollowers: t.authorFollowers,
      },
    });
  }

  const insertedRows = inserts.length
    ? await db
        .insert(mentionTable)
        .values(inserts)
        .onConflictDoNothing({ target: mentionTable.url })
        .returning()
    : [];
  result.inserted = insertedRows.length;
  result.engage = insertedRows.filter(
    (m) => m.suggestedAction === "engage",
  ).length;
  result.broadcast = await postMentionsToRadio(insertedRows);

  return result;
}

const PILL_INSTRUCTIONS: Record<DraftPill, string> = {
  short: "Keep the reply under 140 characters.",
  "no-pitch":
    "Do not mention any Wander product. Provide pure value to the OP. Skip the affiliation disclosure since there's no Wander mention to disclose.",
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

export async function draftTweetReplyForPost(input: {
  tweet: Pick<TweetSummary, "authorUsername" | "text">;
  intentTag: IntentTag;
  rationale: string;
  pills?: DraftPill[];
  customInstructions?: string;
}): Promise<string> {
  const ctx = await loadListeningContext("x-search");
  const systemPrompt = composeListeningSystemPrompt({
    brandVoice: ctx.brandVoice,
    story: ctx.story,
    voiceOverride: ctx.voiceOverride,
    signalNotes: ctx.signalNotes,
    channelMechanics: DRAFT_SYSTEM_PROMPT,
    mode: "draft",
  });

  return draftReply(
    { systemPrompt, pillInstructions: PILL_INSTRUCTIONS },
    {
      pills: input.pills,
      customInstructions: input.customInstructions,
      promptBody: `Tweet to reply to:

author: @${input.tweet.authorUsername}
text: ${input.tweet.text}

Scoring context from our analyst:
- intent tag: ${input.intentTag}
- rationale: ${input.rationale}

Draft the reply. Do NOT include any preamble like "Here's a draft:" — output the reply text directly, with no surrounding quotes.`,
    },
  );
}
