import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { runScrape } from "@/server/clients/brightdata.client";
import { db } from "@/server/db";
import { brandTable, type BrandListeningStory } from "@/server/db/brand-schema";
import {
  listeningSourceTable,
  mentionTable,
  type ListeningSource,
  type MentionInsert,
  type WatchedAccount,
} from "@/server/db/listening-schema";

import { postMentionsToRadio } from "./listening-notify.service";
import {
  composeListeningSystemPrompt,
  draftReply,
  scoreItems,
  type DraftChannel,
  type ScoringChannel,
} from "./triage.service";

/**
 * Account-watch scan (Instagram) — the listening primitive for surfaces with no
 * keyword/topic search. We monitor a CURATED set of external accounts (tastemaker
 * / travel / lifestyle handles), pull their recent posts via the Bright Data
 * IG-profile dataset, AI-score each for "should Wander's official account leave a
 * short clever public comment?", draft that comment, and persist the keepers as
 * `mention` rows (source="instagram") — the same engage queue as Reddit/X.
 *
 * Engagement itself (posting the comment) stays MANUAL — Instagram's API can't
 * comment on a third party's post — so the deliverable is the surfaced post + the
 * drafted comment, broadcast to #radio-social-listening like every other engage
 * mention. Reuses the shared triage engine (score = sonnet, draft = opus).
 */

// Comment while content is fresh — a comment on a 2-day-old IG post reads as
// late. The cron runs daily at noon Pacific (19:00 UTC, vercel.json) so US
// creators have posted that day; a 24h window then means every surfaced post
// is from "today". The unique-url dedup makes re-scans idempotent regardless.
const DEFAULT_SINCE_HOURS = 24;

const IG_INTENTS = [
  "destination-match", // names specific places we'd plausibly have homes
  "audience-fit", // right affluent-traveler audience, no specific place
  "brand-adjacent", // mentions travel booking / OTAs / competitors
  "off-topic", // not relevant
] as const;
type IgIntent = (typeof IG_INTENTS)[number];

const IG_SCORE_MECHANICS = `You are scoring recent Instagram posts from tastemaker / travel / lifestyle accounts Wander WATCHES (we do not control them), to decide whether Wander's official IG account should leave a short, clever public comment.
Wander operates design-forward luxury vacation homes across many US destinations (and runs WanderOS for property managers). A post is worth engaging when it (a) is fresh, (b) features specific destinations / getaways where Wander plausibly has homes, and (c) reaches our affluent-traveler audience. A large follower count amplifies the value.
Score relevance for "should we comment", pick the intent tag, and set suggestedAction (engage = comment today, monitor = adjacent / revisit, skip = off-topic).`;

const IG_DRAFT_MECHANICS = `You are drafting a PUBLIC comment that Wander's official Instagram account will leave on ANOTHER brand's post (a tastemaker we admire — NOT our own post, and NOT a customer DM).
Rules:
- ONE short sentence (≤ ~180 characters). Punchy, warm, genuinely additive or delightful — the kind of comment that earns a like, not an eye-roll.
- Reference something specific from THIS post (a named destination, the vibe, the list).
- Light brand presence only: we are the people who'd have a beautiful home waiting in those places. Never a hard pitch, no "DM us", no links, no @mentions of competitors, no hashtags.
- Output ONLY the comment text — no quotes, no preamble.`;

type Raw = Record<string, unknown>;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === "number" ? v : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

type Candidate = {
  externalId: string;
  url: string;
  account: string; // who posted (the watched account)
  handle: string; // watched handle — facet key (mention.keyword)
  caption: string;
  postedAt: Date | null;
  likes?: number;
  comments?: number;
  imageUrl?: string;
  followers?: number;
  location?: unknown;
  hashtags?: unknown;
};

/** Resolve a watched account to a scrapeable profile URL + a clean handle. */
export function normalizeAccount(a: WatchedAccount): { url: string; handle: string } {
  let handle = a.handle?.replace(/^@/, "").trim() || undefined;
  let url = a.url?.trim() || undefined;
  if (url && !/^https?:\/\//i.test(url)) {
    // A bare handle got stored in `url`.
    handle = handle ?? url.replace(/^@/, "");
    url = undefined;
  }
  if (!handle && url) handle = /instagram\.com\/([^/?#]+)/i.exec(url)?.[1];
  if (!url && handle) url = `https://www.instagram.com/${handle}/`;
  return { url: url ?? "", handle: handle ?? url ?? "" };
}

/** Pull an account's recent posts from the IG-profile dataset (nested posts[]). */
async function fetchAccountPosts(account: WatchedAccount): Promise<Candidate[]> {
  const { url, handle } = normalizeAccount(account);
  if (!url) return [];
  const records = (await runScrape("instagramProfile", [{ url }])) as Raw[];
  const out: Candidate[] = [];
  for (const rec of records) {
    if (rec?.error) continue;
    const acct = str(rec.account) ?? handle;
    const followers = num(rec.followers);
    for (const p of arr(rec.posts) as Raw[]) {
      const id = str(p.id);
      const link = str(p.url);
      if (!id || !link) continue;
      out.push({
        externalId: id,
        url: link,
        account: acct,
        handle,
        caption: str(p.caption) ?? "",
        postedAt: str(p.datetime) ? new Date(str(p.datetime)!) : null,
        likes: num(p.likes),
        comments: num(p.comments),
        imageUrl: str(p.image_url),
        followers,
        location: p.location,
        hashtags: p.post_hashtags,
      });
    }
  }
  return out;
}

type BrandCtx = { brandVoice: string | null; story: BrandListeningStory | null };

async function loadBrand(brandId: string): Promise<BrandCtx> {
  const b = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  return {
    brandVoice: b?.brandFingerprint?.fingerprintText ?? null,
    story: b?.brandListeningStory ?? null,
  };
}

async function scoreCandidates(
  source: ListeningSource,
  brand: BrandCtx,
  candidates: Candidate[],
) {
  const channel: ScoringChannel<Candidate, IgIntent> = {
    intentTags: IG_INTENTS,
    systemPrompt: composeListeningSystemPrompt({
      story: brand.story,
      signalNotes: source.signalNotes,
      channelMechanics: IG_SCORE_MECHANICS,
      mode: "score",
    }),
    getId: (c) => c.externalId,
    formatItem: (c) =>
      [
        `id: ${c.externalId}`,
        `account: @${c.handle}${c.followers ? ` (${c.followers.toLocaleString()} followers)` : ""}`,
        c.postedAt ? `posted: ${c.postedAt.toISOString().slice(0, 10)}` : null,
        `caption: ${c.caption.slice(0, 1200) || "(no caption)"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    relevanceDescription:
      "0 = not travel / irrelevant. 5 = travel-adjacent or vague. 8+ = clearly features a US destination where Wander likely has luxury homes AND the account reaches our affluent-traveler audience.",
    intentTagDescription:
      "destination-match = names specific places we'd have homes; audience-fit = right audience, no specific place; brand-adjacent = mentions travel booking / OTAs / competitors; off-topic = not relevant.",
  };
  const { scored } = await scoreItems(channel, candidates);
  return scored;
}

async function draftComment(
  source: ListeningSource,
  brand: BrandCtx,
  c: Candidate,
): Promise<string> {
  const channel: DraftChannel<never> = {
    systemPrompt: composeListeningSystemPrompt({
      brandVoice: brand.brandVoice,
      story: brand.story,
      voiceOverride: source.voiceOverride ?? null,
      signalNotes: source.signalNotes,
      channelMechanics: IG_DRAFT_MECHANICS,
      mode: "draft",
    }),
    pillInstructions: {},
  };
  return draftReply(channel, {
    promptBody: [
      "Draft the public comment for this Instagram post.",
      `Account: @${c.handle}`,
      c.location ? `Location tag: ${JSON.stringify(c.location)}` : null,
      `Caption: ${c.caption.slice(0, 1500) || "(no caption)"}`,
      `Link: ${c.url}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

function dedupeByUrl(cs: Candidate[]): Candidate[] {
  const m = new Map<string, Candidate>();
  for (const c of cs) if (!m.has(c.url)) m.set(c.url, c);
  return [...m.values()];
}

function firstLine(caption: string): string | null {
  const line = caption
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return null;
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
}

export type AccountWatchScanResult = {
  sources: number;
  accounts: number;
  scanned: number; // posts pulled
  fresh: number; // within window & not already stored
  inserted: number; // new mentions written
  engage: number; // engage-worthy among the new
  broadcast: number; // posted to #radio-social-listening
  errors: string[];
};

/**
 * Scan account-watch sources → fresh posts → score/draft → mentions → Slack.
 * Defaults to ALL active account_watch sources; pass `sourceId` for a single
 * source (the on-demand "Scan now" button). `dryRun` skips AI + DB writes.
 */
export async function scanAccountWatchSources(opts?: {
  sourceId?: string;
  sinceHours?: number;
  dryRun?: boolean;
}): Promise<AccountWatchScanResult> {
  const sinceHours = opts?.sinceHours ?? DEFAULT_SINCE_HOURS;
  const cutoff = new Date(Date.now() - sinceHours * 3_600_000);

  const sources = await db
    .select()
    .from(listeningSourceTable)
    .where(
      opts?.sourceId
        ? eq(listeningSourceTable.id, opts.sourceId)
        : and(
            eq(listeningSourceTable.acquisition, "account_watch"),
            eq(listeningSourceTable.isActive, true),
          ),
    );

  const result: AccountWatchScanResult = {
    sources: 0,
    accounts: 0,
    scanned: 0,
    fresh: 0,
    inserted: 0,
    engage: 0,
    broadcast: 0,
    errors: [],
  };

  for (const source of sources) {
    if (source.acquisition !== "account_watch") continue;
    result.sources++;
    const accounts = source.config?.accounts ?? [];
    result.accounts += accounts.length;

    // 1) pull recent posts across this source's accounts
    const candidates: Candidate[] = [];
    for (const a of accounts) {
      try {
        const posts = await fetchAccountPosts(a);
        result.scanned += posts.length;
        candidates.push(...posts);
      } catch (e) {
        result.errors.push(`@${a.handle ?? a.url}: ${(e as Error).message}`);
      }
    }

    // 2) freshness + dedup vs already-persisted mentions (unique url)
    const recent = candidates.filter((c) => !c.postedAt || c.postedAt >= cutoff);
    const urls = recent.map((c) => c.url);
    const existing = urls.length
      ? await db
          .select({ url: mentionTable.url })
          .from(mentionTable)
          .where(inArray(mentionTable.url, urls))
      : [];
    const seen = new Set(existing.map((r) => r.url));
    const novel = dedupeByUrl(recent.filter((c) => !seen.has(c.url)));
    result.fresh += novel.length;
    if (novel.length === 0 || opts?.dryRun) {
      await touch(source.id);
      continue;
    }

    // 3) score the batch, then draft a comment for the engage-worthy ones
    const brand = await loadBrand(source.brandId);
    const scored = await scoreCandidates(source, brand, novel);

    const inserts: MentionInsert[] = [];
    for (const s of scored) {
      const c = s.item;
      const draft =
        s.suggestedAction === "engage"
          ? await draftComment(source, brand, c).catch(() => null)
          : null;
      inserts.push({
        provider: "brightdata",
        source: "instagram",
        sourceType: "post",
        externalId: c.externalId,
        url: c.url,
        keyword: c.handle, // → account facet in the Instagram tab rail
        author: c.account,
        title: firstLine(c.caption),
        snippet: c.caption.slice(0, 1500) || null,
        postedAt: c.postedAt,
        relevance: s.relevance,
        intentTag: s.intentTag,
        suggestedAction: s.suggestedAction,
        rationale: s.rationale,
        banRisk: s.banRisk,
        suggestedReply: draft,
        status: "new",
        raw: {
          likes: c.likes,
          comments: c.comments,
          imageUrl: c.imageUrl,
          followers: c.followers,
          location: c.location,
          hashtags: c.hashtags,
        },
      });
    }

    // onConflictDoNothing on the unique url index → safe if a concurrent scan races.
    const insertedRows = inserts.length
      ? await db
          .insert(mentionTable)
          .values(inserts)
          .onConflictDoNothing({ target: mentionTable.url })
          .returning()
      : [];
    result.inserted += insertedRows.length;
    result.engage += insertedRows.filter(
      (m) => m.suggestedAction === "engage",
    ).length;
    result.broadcast += await postMentionsToRadio(insertedRows);

    await touch(source.id);
  }

  return result;
}

async function touch(sourceId: string) {
  await db
    .update(listeningSourceTable)
    .set({ lastScanAt: new Date() })
    .where(eq(listeningSourceTable.id, sourceId));
}
