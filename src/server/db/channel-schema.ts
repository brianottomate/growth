import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { createId } from "./utils";

// ---- ENUMS ---------------------------------------------------------

// A channel is a STREAM you publish time-series content to.
export const channelKindEnum = pgEnum("channel_kind", [
  "social",
  "ad",
  "newsletter",
  "blog",
]);
export type ChannelKind = (typeof channelKindEnum.enumValues)[number];

// Platform / provider behind a channel. Social + ad + content surfaces.
export const channelPlatformEnum = pgEnum("channel_platform", [
  // social
  "linkedin",
  "instagram",
  "x",
  "facebook",
  "youtube",
  "tiktok",
  "threads",
  "reddit",
  "pinterest",
  // listening-only surfaces (no owned channel; used by listening_source.platform)
  "hackernews",
  "lobsters",
  // ads
  "google_ads",
  "meta_ads",
  "openai_ads",
  "reddit_ads",
  "linkedin_ads",
  "x_ads",
  "tiktok_ads",
  // owned content surfaces
  "newsletter",
  "blog",
  "other",
]);
export type ChannelPlatform = (typeof channelPlatformEnum.enumValues)[number];

// OAuth / connection health for a channel.
export const connectionStatusEnum = pgEnum("connection_status", [
  "connected",
  "expired",
  "error",
  "disconnected",
]);
export type ConnectionStatus =
  (typeof connectionStatusEnum.enumValues)[number];

// How content actually ships — the "via X" pipe shown in the Feed.
export const deliveryProviderEnum = pgEnum("delivery_provider", [
  "zernio",
  "customerio",
  "instantly",
  "native",
  "manual",
  "email_forward", // forwarded inbound email (e.g. a competitor newsletter we subscribed to)
]);
export type DeliveryProvider =
  (typeof deliveryProviderEnum.enumValues)[number];

// ---- FOLLOWER HISTORY ----------------------------------------------

/**
 * A manual point-in-time capture of a channel's follower/audience count.
 * Stored inline as a JSON array on `channel` — fine for occasional manual
 * entry. Flatten into a dedicated snapshot table if captures ever go automated.
 */
export type FollowerSnapshot = {
  count: number;
  capturedAt: string; // ISO date
  note?: string;
};

/**
 * Per-channel voice, layered OVER the brand fingerprint at prompt-injection
 * time (compose(brand, channel) → inject). Same shape as BrandFingerprint:
 * the brand story is the base; this enhances or overrides it for one surface
 * (e.g. the LinkedIn voice vs the TikTok voice). Derived by analyzing this
 * channel's platform_posts — the same pass that produces observed cadence.
 */
export type ChannelFingerprint = {
  fingerprintText: string; // voice description for prompt injection
  // When set, overrides the brand fingerprint instead of appending to it.
  overridesBrand?: boolean;
  extractedAt?: string;
  postsAnalyzed?: number;
};

// ---- CHANNEL TABLE -------------------------------------------------

/**
 * Channel — a connected publishing surface for a brand. UI groups these as
 * social / ad / newsletter / blog. The FK target for `platform_post` and `ad_spot`.
 */
export const channelTable = pgTable(
  "channel",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("chan")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    kind: channelKindEnum().notNull(),
    platform: channelPlatformEnum().notNull(),

    handle: t.text(), // @wander
    displayName: t.text(),
    externalId: t.text(), // platform account id
    profileUrl: t.text(), // public profile link
    manageUrl: t.text(), // where you manage this channel (paste from the platform)

    connectionStatus: connectionStatusEnum().default("connected").notNull(),
    // Default pipe new spots on this channel ship through; can be overridden
    // per spot on `platform_post`.
    defaultProvider: deliveryProviderEnum(),

    followerCount: t.integer(), // latest — for overview cards
    followerHistory: t.jsonb().$type<FollowerSnapshot[]>().default([]),
    // AI-extracted per-surface voice, composed over the brand fingerprint.
    channelFingerprint: t.jsonb().$type<ChannelFingerprint>(),
    isActive: t.boolean().default(true).notNull(),
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
    index("channel_brand_idx").on(table.brandId),
    index("channel_kind_idx").on(table.kind),
    index("channel_platform_idx").on(table.platform),
    index("channel_connection_status_idx").on(table.connectionStatus),
  ],
);

export type Channel = typeof channelTable.$inferSelect;
export type ChannelInsert = typeof channelTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const channelRelations = relations(channelTable, ({ one }) => ({
  brand: one(brandTable, {
    fields: [channelTable.brandId],
    references: [brandTable.id],
  }),
}));

// ---- CHANNEL SUGGESTION (discovered → review → confirm) ------------

// Review state for a discovered handle. `accepted` spawns a real `channel`;
// `rejected` is remembered so re-discovery doesn't keep re-proposing it.
export const channelSuggestionStatusEnum = pgEnum("channel_suggestion_status", [
  "pending",
  "accepted",
  "rejected",
]);
export type ChannelSuggestionStatus =
  (typeof channelSuggestionStatusEnum.enumValues)[number];

/**
 * ChannelSuggestion — a proposed social handle for a brand (peer or owned),
 * produced by the social-discovery service (search/scrape fan-out + AI
 * consolidation) and optionally verified via Bright Data. A human reviews these
 * and accepts the good ones, which creates the real `channel` row.
 *
 * Dedup is by (brandId, platform, handle): re-running discovery upserts rather
 * than duplicating, and never resurrects a `rejected` row.
 */
export const channelSuggestionTable = pgTable(
  "channel_suggestion",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("csug")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    platform: channelPlatformEnum().notNull(),
    handle: t.text().notNull(),
    profileUrl: t.text(),

    // AI consolidation output.
    confidence: t.real(), // 0..1
    isOfficial: t.boolean(),
    reasoning: t.text(),
    sources: t.jsonb().$type<string[]>().default([]), // providers that surfaced it

    // Bright Data verification (optional; null until verified).
    verified: t.boolean(),
    followerCount: t.integer(),
    verifiedAt: t.timestamp({ withTimezone: true }),
    verifyError: t.text(),

    status: channelSuggestionStatusEnum().default("pending").notNull(),
    // Set when accepted → the channel row this became.
    acceptedChannelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "set null" }),
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
    index("channel_suggestion_brand_idx").on(table.brandId),
    index("channel_suggestion_status_idx").on(table.status),
    uniqueIndex("channel_suggestion_unique_idx").on(
      table.brandId,
      table.platform,
      table.handle,
    ),
  ],
);

export type ChannelSuggestion = typeof channelSuggestionTable.$inferSelect;
export type ChannelSuggestionInsert =
  typeof channelSuggestionTable.$inferInsert;

export const channelSuggestionRelations = relations(
  channelSuggestionTable,
  ({ one }) => ({
    brand: one(brandTable, {
      fields: [channelSuggestionTable.brandId],
      references: [brandTable.id],
    }),
    acceptedChannel: one(channelTable, {
      fields: [channelSuggestionTable.acceptedChannelId],
      references: [channelTable.id],
    }),
  }),
);

// NOTE: `website` + `web_page` (persistent pages) and the `content_pillar`
// table are intentionally deferred — not needed for the Overview / Feed /
// Content / Calendar screens. Add them when the Websites/Blog/Pillars screens
// get built. Pillars are a text slug on `post` for now.
