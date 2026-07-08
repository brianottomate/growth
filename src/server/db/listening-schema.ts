import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import {
  type ChannelFingerprint,
  channelPlatformEnum,
  channelTable,
} from "./channel-schema";
import { createId } from "./utils";
// Subreddit profile shape lives in a client-safe lib (so client components can
// import it without bundling this Drizzle schema). Re-exported here for server
// callers that already import subreddit helpers from the listening schema.
import {
  normalizeSubreddit,
  normalizeSubreddits,
  SUBREDDIT_STANCES,
  subredditName,
  type SubredditEntry,
  type SubredditProfile,
  type SubredditStance,
} from "../../lib/subreddit";

export {
  normalizeSubreddit,
  normalizeSubreddits,
  SUBREDDIT_STANCES,
  subredditName,
};
export type { SubredditEntry, SubredditProfile, SubredditStance };

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

export const MENTION_PROVIDERS = ["f5bot", "brightdata", "x-api"] as const;
export type MentionProvider = (typeof MENTION_PROVIDERS)[number];

export const MENTION_SOURCES = [
  "reddit",
  "hackernews",
  "lobsters",
  "twitter",
  "instagram",
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
    // Likelihood (0..1) the source content gets removed — mod-removal of
    // self-promo in strict subs, rule-breaking, spam. High risk suppresses the
    // Slack broadcast (the queue still gets the row); see listening-notify.
    banRisk: t.real(),
    // AI-drafted reply/comment to act on (pre-engagement). For account-watch
    // (Instagram) this is the "short clever public comment" suggestion; null
    // until a scan drafts one. The human edits/copies it before posting —
    // proof-of-work (where we actually replied) still lands in replyUrl/replyNote.
    suggestedReply: t.text(),
    status: t.text().$type<MentionStatus>().notNull().default("new"),

    // ---- Assignment / triage audit ----
    // Reuses the content owner model, but a mention is an atomic action (one
    // person replies once), so: a single claimer + who-resolved-it, NOT a
    // multi-assignee join.
    assigneeId: t.text().references(() => userTable.id), // who claimed it ("mine")
    resolvedById: t.text().references(() => userTable.id), // who marked engaged/skipped
    resolvedAt: t.timestamp(),

    // ---- Proof of work (optional) ----
    // Where we actually replied (permalink to our comment) + a free-text note
    // (who replied / what we said). Not metrics — just "we handled it, here's
    // where". null until someone attaches a reply; cleared if reopened to "new".
    replyUrl: t.text(),
    replyNote: t.text(),
    // The reasoned disposition — WHY we engaged or (more often) passed. Distinct
    // from replyNote: this is the judgment, especially "we deliberately did NOT
    // engage, because X", so the team + future scans/agents learn from it.
    // Cleared on reopen. The spar agent's recordDecision writes here.
    decisionNote: t.text(),

    // ---- Broadcast trail ----
    // The #radio-social-listening message this mention was posted to. We keep it
    // so the app can update that message later (chat.update on engage/skip) and
    // so re-running ingestion never double-broadcasts. `slackChannel` is the
    // RESOLVED channel the post actually landed in — outside prod every post is
    // redirected to #radio-slack-testing, so the intended channel isn't reliable.
    slackTs: t.text(),
    slackChannel: t.text(),

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
    index("mention_assignee_idx").on(table.assigneeId),
  ],
);

export type Mention = typeof mentionTable.$inferSelect;
export type MentionInsert = typeof mentionTable.$inferInsert;

// ---- SOCIAL LISTENING: SOURCE CONFIG -------------------------------
//
// `listening_source` is the strategic unit: one row = one configured place we
// listen. It replaces the scattered hardcoded constants (TIER_1_SUBREDDITS,
// X_WATCHLIST, ORGANIC_COMMENT_PLATFORMS) one at a time. Crucially it holds
// CONFIG ONLY — results always land in `mention` (F5Bot already proves that
// path; scheduled scans will write there too).
//
// Behaviour is the cross-product of FOUR independent axes (no conflated "mode"):
//   platform     — the SURFACE (reuses channelPlatformEnum; market & owned share it)
//   acquisition  — the SHAPE  (keyword_search | owned_inbound | provider_alert)  ← market-vs-owned lives here
//   trigger      — the CADENCE (on_demand | scheduled[+cron] | webhook)
//   adapter      — the CONNECTOR (free-text slug, like mention.provider) — new providers are zero-migration
//
// e.g. X = keyword_search · scheduled · "x-search"; F5Bot = provider_alert ·
// webhook · "f5bot"; Reddit = keyword_search · on_demand (flip to scheduled
// later by changing one field, no migration).

export const acquisitionShapeEnum = pgEnum("acquisition_shape", [
  "keyword_search", // build a query over an external market surface (Reddit/X/LinkedIn/Pinterest)
  "owned_inbound", // DMs / comments on an owned account (IG/FB/LI)
  "provider_alert", // a provider pushes hits to us (F5Bot today)
  "account_watch", // monitor a curated set of EXTERNAL accounts' posts (IG today). No
  // keyword surface exists for IG, so the watchlist of accounts IS the query;
  // relevant posts land in `mention` as engagement opportunities (config.accounts).
]);
export type AcquisitionShape =
  (typeof acquisitionShapeEnum.enumValues)[number];

export const listeningTriggerEnum = pgEnum("listening_trigger", [
  "on_demand", // a "Scan now" button
  "scheduled", // a cron picks it up (uses scheduleCron)
  "webhook", // a provider pushes (F5Bot via Resend inbound)
]);
export type ListeningTrigger =
  (typeof listeningTriggerEnum.enumValues)[number];

// A keyword alert as configured in a provider (F5Bot today, Mentionkit later).
// This is the INTENT — "what we want to monitor" — mirrored from the provider's
// own config. `verifiedAt` records when we last confirmed it's actually live in
// the channel, so the strategy view can show a "verified · <date>" badge.
//
// `status` makes the config a DESIRED state, not just a mirror: we decide the
// term set here first (strategy), then apply it in the provider's own UI and
// mark it done. Absent status = "live".
//   live      — active in the provider (the default)
//   to_add    — decided here, not yet created in the provider
//   to_remove — decided here, not yet deleted in the provider
export type ListeningAlertTerm = {
  term: string;
  flags?: string[]; // provider matching flags, e.g. F5Bot "whole" | "only-reddit" | "no-comments"
  enabled?: boolean; // mirrors the provider's enabled state
  verifiedAt?: string; // ISO date we last confirmed this term is live in the channel
  status?: "live" | "to_add" | "to_remove"; // desired-state workflow (absent = live)
  note?: string; // why this change — shown in the setup-task row
};

// One external account we watch under an account_watch source (IG today).
export type WatchedAccount = {
  url: string; // canonical profile URL we scrape (e.g. https://www.instagram.com/whowhatwear/)
  handle?: string; // @handle — display + dedup/facet key (mention.keyword)
  label?: string; // friendly name (e.g. "Who What Wear")
  followers?: number; // last verified follower count
  verifiedAt?: string; // ISO date we last confirmed the profile resolves
};

/** Source-specific targeting. Typed jsonb so each adapter shapes its own config. */
export type ListeningSourceConfig = {
  subreddits?: SubredditEntry[]; // reddit — names (legacy) or full profiles
  keywords?: string[]; // x / linkedin / pinterest terms
  alertTerms?: ListeningAlertTerm[]; // provider_alert terms (F5Bot) — intent + verified state
  watchlistGroups?: { id: string; name: string; terms: string[] }[]; // x
  accounts?: WatchedAccount[]; // account_watch — external creators/publishers we monitor (IG)
  windowDays?: number;
  ignoreList?: string[]; // e.g. F5Bot ad-block senders
  maxResults?: number;
};

export const listeningSourceTable = pgTable(
  "listening_source",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lsrc")),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    // Stable slug — idempotent seeds + stable references. (label is display-only.)
    key: t.text().notNull(),

    // --- the four axes ---
    platform: channelPlatformEnum().notNull(),
    acquisition: acquisitionShapeEnum().notNull(),
    trigger: listeningTriggerEnum().notNull(),
    scheduleCron: t.text(), // only when trigger = scheduled
    adapter: t.text().notNull(), // connector slug, e.g. "reddit-json", "x-search", "f5bot"

    // --- targeting / voice / judgment ---
    config: t.jsonb().$type<ListeningSourceConfig>().default({}),
    // Per-source voice override — reuses the publishing fingerprint shape
    // (append, or replace the brand voice when overridesBrand is set).
    voiceOverride: t.jsonb().$type<ChannelFingerprint>(),
    signalNotes: t.text(), // per-source judgment layered over brand.brandListeningStory

    // --- the market-vs-owned link ---
    // Owned-inbound points at the publishing channel; null for market listening.
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "set null" }),

    // --- ops ---
    label: t.text(),
    isActive: t.boolean().default(true).notNull(),
    lastScanAt: t.timestamp(),
    nextScanAt: t.timestamp(),

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
    uniqueIndex("listening_source_brand_key_uq").on(table.brandId, table.key),
    index("listening_source_active_trigger_idx").on(
      table.isActive,
      table.trigger,
    ),
    index("listening_source_brand_idx").on(table.brandId),
  ],
);

export type ListeningSource = typeof listeningSourceTable.$inferSelect;
export type ListeningSourceInsert = typeof listeningSourceTable.$inferInsert;
