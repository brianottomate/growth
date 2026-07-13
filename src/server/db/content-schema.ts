import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { initiativeTable } from "./ads-schema";
import { userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import {
  channelPlatformEnum,
  channelTable,
  deliveryProviderEnum,
} from "./channel-schema";
import { createId } from "./utils";

// NOTE: the master content table is named `content_post` (export
// `contentPostTable`) to avoid colliding with the Jetpack template's demo
// `postTable` ("post"). When the demo post + its router/components are purged,
// this can be renamed back to `post`.

// ---- ENUMS ---------------------------------------------------------

// Content lifecycle. AI proposes to `pending_review`; a human promotes to
// `approved` → `scheduled` → `published`. The Feed splits on this + ship time.
export const contentStatusEnum = pgEnum("content_status", [
  "slot", // empty, strategy-anchored placeholder seeded onto the calendar
  "draft",
  "discovered", // surfaced by AI, not yet triaged
  "pending_review",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "archived",
]);
export type ContentStatus = (typeof contentStatusEnum.enumValues)[number];

// Authorship — humans create first; AI discovery writes later, never silently.
export const contentOriginEnum = pgEnum("content_origin", ["human", "ai"]);
export type ContentOrigin = (typeof contentOriginEnum.enumValues)[number];

// How a platform spot entered our DB.
export const platformPostSourceEnum = pgEnum("platform_post_source", [
  "scraped", // ingested from a platform (competitor or our own history)
  "owned", // created/published by us
]);
export type PlatformPostSource =
  (typeof platformPostSourceEnum.enumValues)[number];

// ---- JSONB SHAPES --------------------------------------------------

export type MediaItem = {
  url: string;
  type: "image" | "video" | "carousel";
  width?: number;
  height?: number;
  thumbnail?: string;
  // Optional link back to the media library. `assetId` => this item is a
  // library asset; `derivedFrom` => it's a rendition (crop/resize) of one.
  assetId?: string; // media_asset.id
  derivedFrom?: string; // source media_asset.id this rendition came from
};

// ---- FORMAT (two axes; both soft text validated against the registry) ----
//
// `archetype` = publish MECHANIC (image | carousel | video_short | text | …);
// `format`    = the concrete platform product ("instagram.reel");
// `template`  = editorial STRUCTURE ("gallery" | "informational_deck" |
//               "property_roundup" | …) — open-ended, AI-classified.
// These live as text(), not pg enums, so the vocabulary can grow without a
// migration. Source of truth is the TS registry in src/server/content/formats.
//
// NB: amplification (repost/retweet/quote/collab) is NOT a format — it's a
// relationship. It lives on `externalKind` (the post's own kind) and in the
// `platform_post_link` edge table. Never add "repost" as an archetype/template.

/**
 * Amplification pointer — the captured signal that a post reposts/quotes another,
 * stored at ingest even when we DON'T have the original as a row yet. The post's
 * own kind lives on `externalKind` (repost | quote | retweet | collab); this
 * points at what it amplified. Once the original is matched to a platform_post
 * (ours, or a tracked peer's), `resolvedPostId` is set AND a navigable
 * `platform_post_link` edge (kind=reposts/quotes) is created. Cross-brand by
 * design — this is the personal↔corporate amplification signal.
 */
export type Amplification = {
  externalId?: string;
  externalUrl?: string;
  username?: string; // original author handle
  platform?: string;
  resolvedPostId?: string; // platform_post.id once the original is matched
};

/** One target spot in a content_post's fan-out manifest (`targetSpots`). */
export type TargetSpot = {
  channelId?: string; // resolved publishing surface (optional pre-resolution)
  platform: string; // channel_platform slug
  format: string; // concrete platform format, e.g. "instagram.reel"
  archetype: string; // mechanic, e.g. "carousel"
  template?: string; // editorial structure, e.g. "informational_deck"
  scheduledAt?: string; // ISO; per-spot timing (spots can ship at different times)
  count?: number; // multiplicity (e.g. 2 X threads from one idea)
};

// Latest engagement snapshot (inline, not time-series — see data-model §6).
// Social fields + email/newsletter fields (the latter populated for
// provider=customerio newsletter sends mirrored from Customer.io).
export type PostStats = {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  impressions?: number;
  clicks?: number;
  saves?: number;
  // email (newsletter / broadcast) metrics
  sent?: number;
  delivered?: number;
  opened?: number;
  bounced?: number;
  unsubscribed?: number;
  spammed?: number;
  converted?: number;
};

// Triage state for the strategic layer: mark mirrored external assets (e.g.
// stale Customer.io drafts/templates) for cleanup. Default keep.
export const cleanupStatusEnum = pgEnum("cleanup_status", [
  "keep",
  "review",
  "candidate",
  "should_delete",
  "deleted",
]);
export type CleanupStatus = (typeof cleanupStatusEnum.enumValues)[number];

// AI suggestion review state — mirrors channel_suggestion. `accepted` applies
// the proposal (writes the edge / sets the classification); `rejected` is
// remembered so re-runs don't re-propose it.
export const contentSuggestionStatusEnum = pgEnum("content_suggestion_status", [
  "pending",
  "accepted",
  "rejected",
]);
export type ContentSuggestionStatus =
  (typeof contentSuggestionStatusEnum.enumValues)[number];

// ---- SERIES (a themed grouping of content ideas) -------------------

/**
 * Series — a themed grouping of related *content ideas* under one arc, e.g.
 * "World Cup 2026" or "Summer of Remote Work". The organic counterpart to an
 * ad `campaign`: a campaign is paid + ad-account-bound; a series is editorial +
 * brand-level. A content_post belongs to at most one series; its platform_posts
 * inherit the series through their parent.
 */
export const seriesStatusEnum = pgEnum("series_status", [
  "planned",
  "active",
  "completed",
  "archived",
]);
export type SeriesStatus = (typeof seriesStatusEnum.enumValues)[number];

export const seriesTable = pgTable(
  "series",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("series")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    // The strategic "moment" this series ladders up to (the raised initiative —
    // organic series + paid campaigns + amplification targets all reference it).
    initiativeId: t
      .text()
      .references(() => initiativeTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    slug: t.text(), // url-safe, unique within a brand
    description: t.text(),
    theme: t.text(), // optional angle / objective
    color: t.text(), // optional UI accent (hex)

    status: seriesStatusEnum().default("planned").notNull(),

    startAt: t.timestamp({ withTimezone: true }),
    endAt: t.timestamp({ withTimezone: true }),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: t.timestamp(),
  }),
  (table) => [
    index("series_brand_idx").on(table.brandId),
    index("series_status_idx").on(table.status),
    index("series_initiative_idx").on(table.initiativeId),
  ],
);

export type Series = typeof seriesTable.$inferSelect;
export type SeriesInsert = typeof seriesTable.$inferInsert;

// ---- CONTENT POST TABLE (master content idea) ----------------------

/**
 * ContentPost — the master content idea, written once, then rendered per
 * channel as `platform_post`s. The Content library (master-detail) operates
 * on this.
 */
export const contentPostTable = pgTable(
  "content_post",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("post")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    // Optional themed grouping (e.g. "World Cup 2026"). Platform posts inherit
    // their series through this parent.
    seriesId: t
      .text()
      .references(() => seriesTable.id, { onDelete: "set null" }),

    // Optional strategic push this content supports (the organic counterpart to
    // a campaign living under the same initiative). Lets a slot be anchored to a
    // goal-driven initiative as well as / instead of a series.
    initiativeId: t
      .text()
      .references(() => initiativeTable.id, { onDelete: "set null" }),

    // Owner / assignee shown in the Feed.
    ownerId: t.text().references(() => userTable.id),
    createdById: t.text().references(() => userTable.id),

    title: t.text(),
    body: t.text(), // master draft / idea

    // Pillar is a hard-coded slug for now (e.g. "acquisition", "inspiration").
    // Promote to a content_pillar FK when the Pillars screen needs CRUD.
    pillar: t.text(),

    // ---- Editorial brief (the team's content-calendar columns) -------------
    // Written ONCE at the idea level and inherited by every platform spot, so
    // the hook / caption / CTA aren't retyped per channel (the spreadsheet's
    // core failure mode). The concrete format + assets are per-spot, below.
    hook: t.text(), // the scroll-stopping first line
    captionDirection: t.text(), // caption / copy direction for the spots
    visualDirection: t.text(), // what the visuals should be (a brief, not assets)
    ctaText: t.text(), // the call-to-action, e.g. "Comment ESCAPE before these go"
    // Optional comment-trigger keyword that fulfils the CTA (ManyChat et al.).
    // Vendor-agnostic on purpose: presence == a keyword-triggered CTA; the tool
    // that fulfils it is an integration detail, never named in the model.
    ctaKeyword: t.text(),
    kpi: t.text(), // the primary KPI this piece is going for

    // Intended placement on the Studio year wheel, before the piece is
    // scheduled. Null => derive position from series dates or earliest
    // platform_post.scheduledAt.
    plannedAt: t.timestamp({ withTimezone: true }),

    status: contentStatusEnum().default("draft").notNull(),
    origin: contentOriginEnum().default("human").notNull(),

    // Why this slot exists — drives the generator's three-source reconciliation
    // on the calendar (a campaign/anchored slot claims an existing cadence slot
    // rather than stacking; a freeflow slot is intentionally left open for
    // execs to jam into). Soft text, like the format axes. Null for non-slots.
    //   cadence  → seeded from a cadence_target's BAU rhythm
    //   anchored → tied to a calendar event / series / initiative (July 4th…)
    //   freeflow → reserved open placeholder
    slotKind: t.text(),

    // Fan-out manifest: which channel × format spots this idea should become.
    // Intent only — materializes into `platform_post` rows on generation. A
    // `status="slot"` row often carries just this + plannedAt + pillar/series.
    targetSpots: t.jsonb().$type<TargetSpot[]>(),

    // Content media POOL — assets associated with this idea, drawn down onto its
    // spots. The pool VIEW (UI) is the union of THIS column + every spot's
    // `platform_post.media` (so anything attached to a spot also shows in the
    // pool, with no sync); this column stores idea-level adds, incl. items not
    // yet on any spot. Items are `MediaItem` refs carrying `assetId` back to
    // media_asset, same as platform_post.media.
    media: t.jsonb().$type<MediaItem[]>(),

    // Demo-data marker. Real synced content inserts with `false` (the default);
    // the seed script sets `true`. `bun run db:unseed` deletes where true.
    // (Added with default(true) first to backfill existing seed rows, then
    // flipped to default(false) so new synced rows aren't flagged.)
    isSeed: t.boolean().default(false).notNull(),

    metadata: t.jsonb(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: t.timestamp(),
  }),
  (table) => [
    index("content_post_brand_idx").on(table.brandId),
    index("content_post_owner_idx").on(table.ownerId),
    index("content_post_status_idx").on(table.status),
    index("content_post_pillar_idx").on(table.pillar),
    index("content_post_series_idx").on(table.seriesId),
    index("content_post_initiative_idx").on(table.initiativeId),
    index("content_post_planned_at_idx").on(table.plannedAt),
  ],
);

export type ContentPost = typeof contentPostTable.$inferSelect;
export type ContentPostInsert = typeof contentPostTable.$inferInsert;

// ---- CONTENT ASSIGNEES (collaborators beyond the lead owner) -------
//
// `content_post.ownerId` stays the lead / DRI (single). This join adds the
// other responsible people (designer + copywriter + approver, …) without
// disturbing the single-owner reads on the Feed/Calendar/board.
export const contentAssigneeTable = pgTable(
  "content_assignee",
  (t) => ({
    contentPostId: t
      .text()
      .references(() => contentPostTable.id, { onDelete: "cascade" })
      .notNull(),
    userId: t
      .text()
      .references(() => userTable.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    primaryKey({ columns: [table.contentPostId, table.userId] }),
    index("content_assignee_user_idx").on(table.userId),
  ],
);
export type ContentAssignee = typeof contentAssigneeTable.$inferSelect;

// ---- CONTENT COMMENT (light per-idea / per-spot discussion) ---------
//
// Exactly one of contentPostId / platformPostId is set (app-enforced): a
// comment hangs off an idea OR a specific channel spot. v1 wires content_post;
// platformPostId is present so per-spot threads can light up later.
export const contentCommentTable = pgTable(
  "content_comment",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("cmt")),
    contentPostId: t
      .text()
      .references(() => contentPostTable.id, { onDelete: "cascade" }),
    platformPostId: t
      .text()
      .references((): AnyPgColumn => platformPostTable.id, {
        onDelete: "cascade",
      }),
    authorId: t
      .text()
      .references(() => userTable.id)
      .notNull(),
    body: t.text().notNull(),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: t.timestamp(),
  }),
  (table) => [
    index("content_comment_content_idx").on(table.contentPostId),
    index("content_comment_platform_idx").on(table.platformPostId),
  ],
);
export type ContentComment = typeof contentCommentTable.$inferSelect;

// ---- PLATFORM POST (the per-channel rendering / "platform spot") ----

/**
 * PlatformPost — one post rendered for one channel: the real tweet / IG post /
 * newsletter issue / blog post. Unified across:
 *   - competitor scraped  → contentPostId null, channelId null, brandId = competitor, source = scraped
 *   - our history scraped → contentPostId null, channelId null, brandId = self,       source = scraped
 *   - our published       → contentPostId set, channelId set,                          source = owned
 *
 * `platform` is denormalized (always set) because scraped posts have no channel
 * row. A spot enters the Feed once `scheduledAt` is set OR it's `published`.
 */
export const platformPostTable = pgTable(
  "platform_post",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pp")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    // Master content (owned only). Keep the spot if the master idea is deleted.
    contentPostId: t
      .text()
      .references(() => contentPostTable.id, { onDelete: "set null" }),

    // Connected channel (owned/published only). Scraped posts have none.
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "set null" }),

    platform: channelPlatformEnum().notNull(), // denormalized for scraped posts
    username: t.text(), // which account on the platform

    // Format axes (soft text; validated against the registry, see TargetSpot).
    format: t.text(), // concrete platform format, e.g. "instagram.reel"
    archetype: t.text(), // mechanic, e.g. "carousel" — denormalized for cadence
    template: t.text(), // editorial structure, e.g. "informational_deck"
    // A standalone platform draft can participate in the strategy mix before
    // it is promoted into a canonical content_post. Once promoted, the same
    // value is copied to content_post.pillar; keeping it here preserves the
    // platform-post-first path without hiding strategy in metadata.
    pillar: t.text(),

    // Threading / sequence (a TREE, ordered): an X thread is a root row + child
    // rows, all under one content_post. Cross-brand amplification (reposts,
    // quotes) is NOT this — it's a graph edge in `platform_post_link`.
    parentPlatformPostId: t
      .text()
      .references((): AnyPgColumn => platformPostTable.id, {
        onDelete: "cascade",
      }),
    sequence: t.integer(), // order within a thread / group

    source: platformPostSourceEnum().notNull(),
    status: contentStatusEnum().default("draft").notNull(),
    origin: contentOriginEnum(), // meaningful for owned posts

    // Optional per-spot assignee (defaults conceptually to contentPost.ownerId).
    ownerId: t.text().references(() => userTable.id),

    // The pipe this spot actually shipped through ("via Zernio").
    provider: deliveryProviderEnum(),

    // The connector that most recently hydrated this mirror. Kept separate
    // from `provider`: a native Instagram post may be ingested through Zernio,
    // Bright Data, or an official API without having been published by it.
    ingestProvider: t.text(),

    text: t.text(),
    media: t.jsonb().$type<MediaItem[]>(),
    // External asset links (e.g. Google Drive folders) for this spot. The team
    // produces in Drive; `media` (Blob) is for assets WE host. Keeping the
    // Drive URLs means we don't force an asset migration to kill the sheet.
    assetLinks: t.jsonb().$type<string[]>(),
    stats: t.jsonb().$type<PostStats>(), // inline latest snapshot, not time-series

    externalId: t.text(),
    externalUrl: t.text(),
    // Which external object this mirrors (e.g. "broadcast" for a Customer.io
    // newsletter send). Free text; `provider` gives the system. Also holds the
    // amplification kind for scraped posts: repost | quote | retweet | collab.
    externalKind: t.text(),

    // When this post amplifies another (repost/quote), the pointer to the
    // original — captured at ingest even before we have the original as a row.
    // The navigable, resolved relationship is a `platform_post_link` edge.
    amplifiedFrom: t.jsonb().$type<Amplification>(),

    // Strategic-layer triage (drafts / stale templates pulled from a provider).
    cleanupStatus: cleanupStatusEnum().default("keep").notNull(),

    // The Feed timeline fields.
    scheduledAt: t.timestamp({ withTimezone: true }), // set => enters the Feed
    publishedAt: t.timestamp({ withTimezone: true }),
    scrapedAt: t.timestamp({ withTimezone: true }),

    // Demo-data marker — see content_post.isSeed. default(true) first to
    // backfill existing seed rows, then flipped to default(false).
    isSeed: t.boolean().default(false).notNull(),

    metadata: t.jsonb(),

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
    index("platform_post_brand_idx").on(table.brandId),
    index("platform_post_content_post_idx").on(table.contentPostId),
    index("platform_post_channel_idx").on(table.channelId),
    index("platform_post_platform_username_idx").on(
      table.platform,
      table.username,
    ),
    index("platform_post_source_idx").on(table.source),
    index("platform_post_status_idx").on(table.status),
    index("platform_post_scheduled_at_idx").on(table.scheduledAt),
    index("platform_post_published_at_idx").on(table.publishedAt),
    index("platform_post_cleanup_idx").on(table.cleanupStatus),
    index("platform_post_external_idx").on(table.provider, table.externalId),
    uniqueIndex("platform_post_canonical_external_idx")
      .on(table.brandId, table.platform, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    index("platform_post_parent_idx").on(table.parentPlatformPostId),
    // Headline cadence query: GROUP BY (brand, archetype, week-of publishedAt).
    index("platform_post_cadence_idx").on(
      table.brandId,
      table.archetype,
      table.publishedAt,
    ),
  ],
);

export type PlatformPost = typeof platformPostTable.$inferSelect;

// ---- CONTENT INGEST RUN -------------------------------------------

/**
 * One user-triggered history fetch. This is deliberately an audit record, not
 * a scheduler: owned history and peer scraping remain explicit actions.
 */
export const contentIngestRunTable = pgTable(
  "content_ingest_run",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("ingest")),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    requestedById: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
    mode: t.text().notNull(), // owned_backfill | peer_scrape
    provider: t.text().notNull(), // zernio+x_api | brightdata | apify
    status: t.text().default("running").notNull(),
    requestedFrom: t.timestamp({ withTimezone: true }),
    requestedTo: t.timestamp({ withTimezone: true }),
    result: t.jsonb().$type<Record<string, unknown>>(),
    error: t.text(),
    startedAt: t
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    completedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    index("content_ingest_run_brand_idx").on(table.brandId),
    index("content_ingest_run_started_idx").on(table.startedAt),
  ],
);

export type ContentIngestRun = typeof contentIngestRunTable.$inferSelect;
export type PlatformPostInsert = typeof platformPostTable.$inferInsert;

// ---- PLATFORM POST LINK (cross-post graph: a GRAPH, not a tree) ----

/**
 * A directional edge between two platform_posts. Two uses:
 *   - cross-channel references — "this FB post links to the reel", "the reel CTA
 *     points to the X thread". With `injectUrlAtPublish`, the publisher resolves
 *     the `to` post's live URL into the `from` post's body at ship time.
 *   - amplification — repost / quote / cross-brand promotion. `from`/`to` carry
 *     NO same-brand constraint, so "founder's personal account reposts the
 *     company post" is just an edge across brands.
 *
 * `kind` is free text (vocabulary grows): references | continues | repurposes |
 * cross_promotes | reposts | quotes | amplifies.
 *
 * Threads/sequences are NOT modeled here — they use platform_post's self-FK.
 */
export const platformPostLinkTable = pgTable(
  "platform_post_link",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("ppl")),

    fromPlatformPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "cascade" })
      .notNull(),
    toPlatformPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "cascade" })
      .notNull(),

    kind: t.text().notNull(),
    // Resolve the `to` post's live URL into the `from` post's body at publish.
    injectUrlAtPublish: t.boolean().default(false).notNull(),
    metadata: t.jsonb(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    index("platform_post_link_from_idx").on(table.fromPlatformPostId),
    index("platform_post_link_to_idx").on(table.toPlatformPostId),
  ],
);

export type PlatformPostLink = typeof platformPostLinkTable.$inferSelect;
export type PlatformPostLinkInsert = typeof platformPostLinkTable.$inferInsert;

// ---- CONTENT SUGGESTION (AI proposes → human confirms) -------------

/**
 * A staged AI proposal about content — the `channel_suggestion` pattern, one
 * level up. A script (classify() + amplification detection over platform_post,
 * own + peer) writes these; a human (or a high-confidence auto-accept) promotes
 * them. On `accepted`, the proposal is APPLIED: an amplification/cross_link/
 * thread suggestion writes a real `platform_post_link` edge; a classification
 * suggestion sets the subject post's format/archetype/template. Keeps the
 * confirmed graph clean — proposals never mutate live rows until confirmed.
 *
 *   kind = classification → proposed { format, archetype, template }, no target
 *   kind = amplification  → subject reposts/quotes target (target may be another
 *                           brand: founder↔corporate). targetRef holds the
 *                           external pointer when the original isn't a row yet.
 *   kind = cross_link | thread → proposed { linkKind }, target set
 */
export const contentSuggestionTable = pgTable(
  "content_suggestion",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("sug")),

    // The brand whose post this concerns (the subject's brand).
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    kind: t.text().notNull(), // classification | amplification | cross_link | thread

    // The post the suggestion is about (the "from" side for edges).
    subjectPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "cascade" })
      .notNull(),
    // The "to" post for an edge suggestion, when resolved to one of our rows.
    targetPostId: t.text().references((): AnyPgColumn => platformPostTable.id, {
      onDelete: "set null",
    }),
    // External pointer when the edge target isn't (yet) a platform_post row.
    targetRef: t.jsonb().$type<Amplification>(),

    proposed: t.jsonb(), // {format,archetype,template} | {linkKind} — see kind
    confidence: t.real(), // 0..1
    reasoning: t.text(),
    source: t.text(), // model / run id

    status: contentSuggestionStatusEnum().default("pending").notNull(),
    // What it became on accept (the edge), for traceability / undo.
    appliedLinkId: t
      .text()
      .references((): AnyPgColumn => platformPostLinkTable.id, {
        onDelete: "set null",
      }),
    reviewedById: t.text().references(() => userTable.id),
    reviewedAt: t.timestamp({ withTimezone: true }),

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
    index("content_suggestion_brand_idx").on(table.brandId),
    index("content_suggestion_subject_idx").on(table.subjectPostId),
    index("content_suggestion_status_idx").on(table.status),
    index("content_suggestion_kind_idx").on(table.kind),
  ],
);

export type ContentSuggestion = typeof contentSuggestionTable.$inferSelect;
export type ContentSuggestionInsert =
  typeof contentSuggestionTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const contentPostRelations = relations(
  contentPostTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [contentPostTable.brandId],
      references: [brandTable.id],
    }),
    series: one(seriesTable, {
      fields: [contentPostTable.seriesId],
      references: [seriesTable.id],
    }),
    initiative: one(initiativeTable, {
      fields: [contentPostTable.initiativeId],
      references: [initiativeTable.id],
    }),
    owner: one(userTable, {
      fields: [contentPostTable.ownerId],
      references: [userTable.id],
      relationName: "content_post_owner",
    }),
    createdBy: one(userTable, {
      fields: [contentPostTable.createdById],
      references: [userTable.id],
      relationName: "content_post_creator",
    }),
    platformPosts: many(platformPostTable),
    assignees: many(contentAssigneeTable),
    comments: many(contentCommentTable),
  }),
);

export const contentCommentRelations = relations(
  contentCommentTable,
  ({ one }) => ({
    contentPost: one(contentPostTable, {
      fields: [contentCommentTable.contentPostId],
      references: [contentPostTable.id],
    }),
    platformPost: one(platformPostTable, {
      fields: [contentCommentTable.platformPostId],
      references: [platformPostTable.id],
    }),
    author: one(userTable, {
      fields: [contentCommentTable.authorId],
      references: [userTable.id],
    }),
  }),
);

export const contentAssigneeRelations = relations(
  contentAssigneeTable,
  ({ one }) => ({
    contentPost: one(contentPostTable, {
      fields: [contentAssigneeTable.contentPostId],
      references: [contentPostTable.id],
    }),
    user: one(userTable, {
      fields: [contentAssigneeTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const seriesRelations = relations(seriesTable, ({ one, many }) => ({
  brand: one(brandTable, {
    fields: [seriesTable.brandId],
    references: [brandTable.id],
  }),
  initiative: one(initiativeTable, {
    fields: [seriesTable.initiativeId],
    references: [initiativeTable.id],
  }),
  contentPosts: many(contentPostTable),
}));

export const platformPostRelations = relations(
  platformPostTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [platformPostTable.brandId],
      references: [brandTable.id],
    }),
    contentPost: one(contentPostTable, {
      fields: [platformPostTable.contentPostId],
      references: [contentPostTable.id],
    }),
    channel: one(channelTable, {
      fields: [platformPostTable.channelId],
      references: [channelTable.id],
    }),
    owner: one(userTable, {
      fields: [platformPostTable.ownerId],
      references: [userTable.id],
    }),
    // Thread/sequence tree (self-FK).
    parent: one(platformPostTable, {
      fields: [platformPostTable.parentPlatformPostId],
      references: [platformPostTable.id],
      relationName: "platform_post_thread",
    }),
    children: many(platformPostTable, {
      relationName: "platform_post_thread",
    }),
  }),
);

export const platformPostLinkRelations = relations(
  platformPostLinkTable,
  ({ one }) => ({
    from: one(platformPostTable, {
      fields: [platformPostLinkTable.fromPlatformPostId],
      references: [platformPostTable.id],
      relationName: "platform_post_link_from",
    }),
    to: one(platformPostTable, {
      fields: [platformPostLinkTable.toPlatformPostId],
      references: [platformPostTable.id],
      relationName: "platform_post_link_to",
    }),
  }),
);

export const contentSuggestionRelations = relations(
  contentSuggestionTable,
  ({ one }) => ({
    brand: one(brandTable, {
      fields: [contentSuggestionTable.brandId],
      references: [brandTable.id],
    }),
    subjectPost: one(platformPostTable, {
      fields: [contentSuggestionTable.subjectPostId],
      references: [platformPostTable.id],
      relationName: "content_suggestion_subject",
    }),
    targetPost: one(platformPostTable, {
      fields: [contentSuggestionTable.targetPostId],
      references: [platformPostTable.id],
      relationName: "content_suggestion_target",
    }),
  }),
);

// NOTE deferred (graduate when their screens are built):
//   - comment table  → comment COUNTS live in platform_post.stats for now
//   - media_asset / studio  → media lives inline in platform_post.media
//   - content_pillar table  → pillar is a text slug on content_post for now
