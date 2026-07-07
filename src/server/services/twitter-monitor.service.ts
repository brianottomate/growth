import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { channelTable } from "@/server/db/channel-schema";
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
import { matchWatchlist, X_WATCHLIST } from "@/lib/x-watchlist";

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
  engagement opportunities.

Signal quality matters as much as topical match:
- Self-promotional growth-hacking content — hashtag walls, "free ebook" /
  "free playbook" lead magnets, course sellers, link-in-bio funnels,
  engagement farming — is noise. Tag it noise and suggest skip no matter how
  many watchlist terms it contains. The author is broadcasting, not asking.
- "engage" is for tweets by real operators, hosts, or owners with a genuine
  question, complaint, or decision in progress, where a reply from Wander adds
  value to the conversation.
- Use the engagement + audience numbers: a tweet with negligible views and
  interactions from an author with a tiny following is almost never worth
  engaging — suggest monitor (if topically strong) or skip. A modest-reach
  tweet can still be "engage" when the intent is unmistakably high.`;

// The posting identity decides the disclosure rule: replies sent from the
// brand's own X account need no affiliation disclaimer (the handle IS the
// disclosure), while a personal-account reply must disclose. Resolved from the
// DB (listening source → brand → its X channel) at draft time.
function buildDraftMechanics(identity: {
  handle: string;
  brandName: string;
} | null): string {
  const identityRules = identity
    ? `1. You are replying AS ${identity.handle} — ${identity.brandName}'s official
   X account. The handle itself is the affiliation disclosure; never add
   disclaimers like "I work at Wander". Say "we" for ${identity.brandName}
   things, and keep it human and conversational — a person runs this account,
   not a press office.`
    : `1. You are replying from a personal account. Disclose Wander affiliation
   briefly if you're mentioning Wander ("disclosure: I work at Wander"). Skip
   the disclosure if there's no Wander mention.`;

  return `You write Twitter / X reply drafts for the Wander
growth team. Reddit etiquette doesn't apply here; tweets are short, casual,
and public. Every reply must:

${identityRules}
2. Be under 270 characters (leaving room for the @-mention prefix).
3. Mention WanderOS / Wander Sites / Wander Operated only when it directly
   solves the OP's problem, and only as a short phrase. Never link to
   wander.com.
4. If the tweet is a critical brand mention or complaint about Wander,
   acknowledge it directly and offer to help over DM. Skip any product pitch.

No hashtags. No emojis. No exclamation points.`;
}

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
//
// Terms that collide with common English words need co-occurrence context or
// they drown the scan: bare "Hospitable" matched people calling Mexico
// hospitable — 59 of the first 66 tweets ever persisted. X search is
// case-insensitive, so the context clause is the only fix.
const CONTEXTUAL_TERMS: Record<string, string> = {
  Hospitable:
    '("Hospitable" (Airbnb OR VRBO OR STR OR host OR hosts OR PMS OR "property manager" OR "channel manager"))',
};

const SEARCH_QUERY = X_WATCHLIST.flatMap((g) => g.terms)
  .map((t) => CONTEXTUAL_TERMS[t] ?? `"${t}"`)
  .join(" OR ");

const FULL_QUERY = `(${SEARCH_QUERY}) -is:retweet lang:en`;

// The cron runs every 6 hours (vercel.json). Recent search defaults to a 7-day
// lookback, which would waste most of the 50-result budget re-fetching tweets
// we've already triaged — so the cron scans a 13h window (2× cadence: one
// failed run never loses tweets; the overlap is free because dedup happens
// before scoring). X moves fast, so cadence stays at 6h — the window is the
// efficiency knob, not the schedule.
export const CRON_SCAN_WINDOW_HOURS = 13;

export async function searchRecentTweets(opts?: {
  /** Only fetch tweets newer than this many hours (omit = API's ~7-day max). */
  sinceHours?: number;
}): Promise<TweetSummary[]> {
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) {
    throw new Error("X_BEARER_TOKEN is not set");
  }

  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", FULL_QUERY);
  url.searchParams.set("max_results", "50");
  if (opts?.sinceHours) {
    const start = new Date(Date.now() - opts.sinceHours * 60 * 60 * 1000);
    url.searchParams.set("start_time", start.toISOString());
  }
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
    `author: @${t.authorUsername} (${t.authorFollowers} followers)`,
    `text: ${text}`,
    `engagement: ${t.likeCount}♥ ${t.replyCount}💬 ${t.retweetCount}🔁 · ${t.viewCount} views`,
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
 * through the same `mention` table, /app/listen surface, and
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
  const tweets = await searchRecentTweets({
    sinceHours: CRON_SCAN_WINDOW_HOURS,
  });
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
      keyword: matchWatchlist(t.text)?.terms.join(", ") ?? null,
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

  // Slack floor — engage alone isn't enough to ping the team. The tweet must
  // also be a confident score AND have real reach (or a real audience): a
  // 12-view zero-like tweet from a tiny account isn't worth a human's
  // attention even when it's topically perfect. Everything still lands in the
  // mention queue; this only gates the broadcast.
  const scoredByUrl = new Map(scored.map((s) => [s.tweet.url, s]));
  const broadcastable = insertedRows.filter((m) => {
    const s = scoredByUrl.get(m.url);
    if (!s || s.relevance < BROADCAST_MIN_RELEVANCE) return false;
    const t = s.tweet;
    const interactions = t.likeCount + t.replyCount + t.retweetCount;
    return (
      interactions >= BROADCAST_MIN_INTERACTIONS ||
      t.viewCount >= BROADCAST_MIN_VIEWS ||
      t.authorFollowers >= BROADCAST_MIN_FOLLOWERS
    );
  });
  result.broadcast = await postMentionsToRadio(broadcastable);

  return result;
}

// Broadcast floor knobs. A tweet must clear the relevance bar AND any one of
// the reach bars (interactions / views / author audience) to hit Slack.
const BROADCAST_MIN_RELEVANCE = 8;
const BROADCAST_MIN_INTERACTIONS = 2;
const BROADCAST_MIN_VIEWS = 200;
const BROADCAST_MIN_FOLLOWERS = 500;

const PILL_INSTRUCTIONS: Record<DraftPill, string> = {
  short: "Keep the reply under 140 characters.",
  "no-pitch":
    "Do not mention any Wander product. Provide pure value to the OP.",
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

/**
 * The X account replies are posted from — the listening brand's own X channel
 * (today: brand "Wander" → @wander). Null when the brand has no connected X
 * channel, which flips the draft prompt back to personal-account disclosure.
 */
async function loadPostingIdentity(
  brandId: string | null,
  brandName: string | null,
): Promise<{ handle: string; brandName: string } | null> {
  if (!brandId) return null;
  const [channel] = await db
    .select({ handle: channelTable.handle })
    .from(channelTable)
    .where(
      and(
        eq(channelTable.brandId, brandId),
        eq(channelTable.platform, "x"),
        eq(channelTable.isActive, true),
        isNull(channelTable.deletedAt),
      ),
    )
    .limit(1);
  if (!channel?.handle) return null;
  const handle = channel.handle.startsWith("@")
    ? channel.handle
    : `@${channel.handle}`;
  return { handle, brandName: brandName ?? "the brand" };
}

export async function draftTweetReplyForPost(input: {
  tweet: Pick<TweetSummary, "authorUsername" | "text">;
  intentTag: IntentTag;
  rationale: string;
  pills?: DraftPill[];
  customInstructions?: string;
}): Promise<string> {
  const ctx = await loadListeningContext("x-search");
  const identity = await loadPostingIdentity(ctx.brandId, ctx.brandName);
  const systemPrompt = composeListeningSystemPrompt({
    brandVoice: ctx.brandVoice,
    story: ctx.story,
    voiceOverride: ctx.voiceOverride,
    signalNotes: ctx.signalNotes,
    channelMechanics: buildDraftMechanics(identity),
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
