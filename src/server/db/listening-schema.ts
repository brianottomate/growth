import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { createId } from "./utils";

// ---- SOCIAL LISTENING: MENTIONS ------------------------------------
//
// A `mention` is a single inbound brand/competitor/keyword hit surfaced by an
// external listening provider. F5Bot is the first writer (piped in via a Resend
// inbound webhook → AI extraction), but the shape is deliberately
// provider-AGNOSTIC: every tool on the shortlist (Mentionkit, Buska, Syften,
// Alertmouse) emits the same conceptual object. When we swap providers we point
// a new inbound address at the same route and write the same table — `provider`
// is the only thing that changes. `raw` keeps the full payload so we never lose
// provider-specific data we didn't model.
//
// This is intentionally NOT the shared triage store yet (see triage.service):
// it's a lean landing table for one push-based source, not a refactor of the
// existing pull surfaces (DMs/comments/X live in cache/localStorage for now).

export const MENTION_PROVIDERS = ["f5bot"] as const;
export type MentionProvider = (typeof MENTION_PROVIDERS)[number];

export const MENTION_SOURCES = [
  "reddit",
  "hackernews",
  "lobsters",
  "twitter",
  "other",
] as const;
export type MentionSource = (typeof MENTION_SOURCES)[number];

export const MENTION_STATUSES = ["new", "engaged", "skipped"] as const;
export type MentionStatus = (typeof MENTION_STATUSES)[number];

export const mentionTable = pgTable(
  "mention",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("men")),

    // The swap point. Free-form text (not an enum) so adding a provider never
    // needs a migration.
    provider: t.text().$type<MentionProvider>().notNull().default("f5bot"),
    source: t.text().$type<MentionSource>().notNull(),
    // post | comment | url | other | null — provider/source specific.
    sourceType: t.text(),

    // Platform's own id for the thing, if we can parse it (e.g. a Reddit
    // thing id). Best-effort; `url` is the canonical key.
    externalId: t.text(),
    // Canonical permalink to the post/comment. Unique → natural dedup key.
    url: t.text().notNull(),

    // Which alert/keyword fired (e.g. "direct booking site").
    keyword: t.text(),
    subreddit: t.text(), // "vrbo" — null for non-reddit sources
    author: t.text(),
    title: t.text(),
    snippet: t.text(), // the matched body text

    // When the underlying post/comment was made (often unknown from the alert).
    postedAt: t.timestamp(),
    // When the alert reached us (the inbound email's timestamp).
    receivedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),

    // ---- Triage (filled by triage.scoreItems; nullable until scored) ----
    relevance: t.integer(), // 0..10
    intentTag: t.text(),
    suggestedAction: t.text(), // engage | monitor | skip
    rationale: t.text(),
    status: t.text().$type<MentionStatus>().notNull().default("new"),

    // ---- Provenance ----
    sourceEmailId: t.text(), // Resend received-email id this came from
    raw: t.jsonb(), // full parsed payload / extraction output

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (table) => [
    // Dedup: the same URL can arrive twice (e.g. one post matching two
    // keywords → two emails). Keep the first; ignore re-arrivals.
    uniqueIndex("mention_url_uq").on(table.url),
    index("mention_status_idx").on(table.status),
    index("mention_provider_idx").on(table.provider),
    index("mention_received_at_idx").on(table.receivedAt),
  ],
);

export type Mention = typeof mentionTable.$inferSelect;
export type MentionInsert = typeof mentionTable.$inferInsert;
