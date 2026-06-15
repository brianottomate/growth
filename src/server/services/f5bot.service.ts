import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { Output, generateText } from "ai";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  MENTION_SOURCES,
  type Mention,
  type MentionInsert,
  mentionTable,
} from "@/server/db/listening-schema";

import { type ScoringChannel, scoreItems } from "./triage.service";

// F5Bot pipeline: a forwarded F5Bot alert email lands on the Resend inbound
// webhook → we pull the body → AI-extract the mention(s) → persist → score via
// the shared triage engine. AI-first by request: the extraction is an LLM pass
// (not a regex) so we can watch what real emails look like in the logs first
// and harden toward deterministic parsing later if we want.

const EXTRACTION_MODEL = anthropic("claude-sonnet-4-6");

// ---- Extraction --------------------------------------------------------------

const ExtractedMentionSchema = z.object({
  source: z
    .enum(MENTION_SOURCES)
    .describe(
      "Where the mention was found. F5Bot covers reddit, hackernews, and lobsters; use 'other' if unclear.",
    ),
  sourceType: z
    .enum(["post", "comment", "url", "other"])
    .nullable()
    .describe(
      "F5Bot labels each hit, e.g. 'Reddit Comments' → comment, 'Reddit Posts' → post. null if absent.",
    ),
  keyword: z
    .string()
    .nullable()
    .describe('The alert keyword that fired, e.g. "direct booking site".'),
  subreddit: z
    .string()
    .nullable()
    .describe("Subreddit name WITHOUT the r/ prefix, e.g. 'vrbo'. null if not reddit."),
  title: z.string().nullable().describe("Title of the post/thread, if present."),
  author: z
    .string()
    .nullable()
    .describe("Username of the poster/commenter, e.g. 'Accomplished-Sale16'."),
  url: z
    .string()
    .describe(
      "The permalink to the matched post/comment. CRITICAL: only use a link that literally appears in the email — never invent or guess a URL. This is the link on the post/comment title, NOT any advertisement link.",
    ),
  snippet: z
    .string()
    .describe("The matched post/comment body text quoted in the alert."),
});

export type ExtractedMention = z.infer<typeof ExtractedMentionSchema>;

const EXTRACTION_SYSTEM = `You extract structured mentions from F5Bot alert emails.

F5Bot emails have a regular shape: a heading "F5Bot found something!", one or
more 'Keyword: "..."' sections, and under each a line like
'Reddit Comments (/r/vrbo/): <linked title> by <author>' followed by the matched
text. A single email usually contains ONE mention but may contain several.

Rules:
- Return one entry per distinct mention (post or comment) found.
- IGNORE everything that is not a mention: the F5Bot footer ("Do you have
  comments or suggestions about F5Bot?", unsubscribe, "Want to advertise"),
  and the injected advertisement blocks (e.g. aiperse.hu, RedPulse.io,
  KnownHost, PhishProtection). Their links are NOT mention URLs.
- For 'url': use ONLY a link that appears verbatim in the email — the permalink
  on the post/comment title. Never fabricate a URL. If the body contains a
  preview image link (preview.redd.it) prefer the title's thread permalink.
- If a field is genuinely absent, use null (do not guess).`;

/**
 * Extract mention(s) from one F5Bot email. Prefers the plaintext part; falls
 * back to HTML (the model reads HTML fine, it's just more tokens).
 */
export async function extractMentionsFromEmail(input: {
  subject: string;
  text: string | null;
  html: string | null;
}): Promise<ExtractedMention[]> {
  const body = (input.text?.trim() || input.html?.trim() || "").slice(0, 20_000);
  if (!body) return [];

  const { output } = await generateText({
    model: EXTRACTION_MODEL,
    system: EXTRACTION_SYSTEM,
    prompt: `Subject: ${input.subject}\n\n${body}`,
    output: Output.array({ element: ExtractedMentionSchema }),
  });

  // Defensive: drop anything the model returned without a usable url.
  return output.filter((m) => m.url && /^https?:\/\//i.test(m.url));
}

// ---- Scoring (reuses the shared triage engine) -------------------------------

const MENTION_INTENT_TAGS = [
  "brand",
  "high-intent",
  "medium-intent",
  "positioning",
  "operator-pain",
  "competitor",
  "noise",
] as const;
type MentionIntentTag = (typeof MENTION_INTENT_TAGS)[number];

const MENTION_SCORING_SYSTEM = `Wander has three products relevant here:
- WanderOS — direct-booking software for short-term-rental operators (cut OTA fees, own the guest).
- Wander Sites — branded direct-booking websites for operators.
- Wander Operated — full-service property management.

You are scoring social mentions surfaced by a keyword-alert tool so the
marketing team knows where to engage. Most will be tangential — be discerning.
Reserve relevance 8+ for mentions where a Wander product genuinely solves the
poster's problem and a reply would add value.

High-signal: people complaining about / switching from OTAs (Airbnb, VRBO) or
competitors (Hostaway, Guesty, OwnerRez, Hospitable, Lodgify), asking for direct
booking solutions, or evaluating alternatives. Tag those competitor/high-intent.
Brand mentions of Wander itself → brand. Generic chatter → noise.`;

const mentionScoringChannel: ScoringChannel<Mention, MentionIntentTag> = {
  intentTags: MENTION_INTENT_TAGS,
  systemPrompt: MENTION_SCORING_SYSTEM,
  getId: (m) => m.id,
  formatItem: (m) =>
    [
      `id: ${m.id}`,
      `source: ${m.source}${m.sourceType ? ` (${m.sourceType})` : ""}${m.subreddit ? ` r/${m.subreddit}` : ""}`,
      m.keyword ? `keyword: ${m.keyword}` : null,
      m.title ? `title: ${m.title}` : null,
      m.author ? `author: ${m.author}` : null,
      `text: ${m.snippet ?? "(none)"}`,
    ]
      .filter(Boolean)
      .join("\n"),
};

// ---- Ingest (extract → persist → score) --------------------------------------

export interface IngestResult {
  extracted: number;
  inserted: number;
  scored: number;
}

/**
 * Full F5Bot ingest for one received email. Persists first (so a scoring
 * failure never loses the mention), then best-effort scores the new rows.
 * Idempotent: dedup is on `url` via the unique index.
 */
export async function ingestF5BotEmail(email: {
  id: string;
  subject: string;
  text: string | null;
  html: string | null;
  receivedAt?: string | null;
}): Promise<IngestResult> {
  const extracted = await extractMentionsFromEmail(email);
  console.log(
    `[f5bot] email ${email.id} "${email.subject}" → extracted ${extracted.length} mention(s)`,
    extracted.map((m) => ({ source: m.source, keyword: m.keyword, url: m.url })),
  );
  if (extracted.length === 0) return { extracted: 0, inserted: 0, scored: 0 };

  const receivedAt = email.receivedAt ? new Date(email.receivedAt) : new Date();
  const rows: MentionInsert[] = extracted.map((m) => ({
    provider: "f5bot",
    source: m.source,
    sourceType: m.sourceType,
    url: m.url,
    keyword: m.keyword,
    subreddit: m.subreddit,
    author: m.author,
    title: m.title,
    snippet: m.snippet,
    receivedAt,
    sourceEmailId: email.id,
    raw: m,
  }));

  const inserted = await db
    .insert(mentionTable)
    .values(rows)
    .onConflictDoNothing({ target: mentionTable.url })
    .returning();

  console.log(
    `[f5bot] persisted ${inserted.length}/${rows.length} mention(s) (rest were dupes)`,
  );
  if (inserted.length === 0) return { extracted: extracted.length, inserted: 0, scored: 0 };

  // Best-effort scoring — never fail the ingest (or the webhook) on a scoring error.
  let scored = 0;
  try {
    const { scored: results } = await scoreItems(mentionScoringChannel, inserted);
    await Promise.all(
      results.map((r) =>
        db
          .update(mentionTable)
          .set({
            relevance: r.relevance,
            intentTag: r.intentTag,
            suggestedAction: r.suggestedAction,
            rationale: r.rationale,
          })
          .where(inArray(mentionTable.id, [r.item.id])),
      ),
    );
    scored = results.length;
    console.log(
      `[f5bot] scored ${scored} mention(s):`,
      results.map((r) => ({
        url: r.item.url,
        relevance: r.relevance,
        intent: r.intentTag,
        action: r.suggestedAction,
      })),
    );
  } catch (error) {
    console.error("[f5bot] scoring failed (mentions still saved):", error);
  }

  return { extracted: extracted.length, inserted: inserted.length, scored };
}
