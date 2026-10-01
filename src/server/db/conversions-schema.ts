import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, primaryKey } from "drizzle-orm/pg-core";

import { adAccountTable } from "./ad-account-schema";
import { brandTable } from "./brand-schema";
import { channelPlatformEnum, channelTable } from "./channel-schema";
import { createId } from "./utils";

// The ad CONVERSION-TRACKING matrix — the paid-side counterpart to the
// campaign/audience launchpad in `ads-schema.ts`. Same intent→reality spine:
//   conversion_event  (brand-level "what we want to optimize toward")  ≈ audience_target
//   conversion_mapping (per-platform "the actual pixel/conversion")     ≈ audience
//
// Source of truth for canonical event names stays in the tracking codebase
// (wander.com + @wandercom/tracking-*). We deliberately DON'T type against it:
// `canonicalEvent` is free text, reconciled by an AI agent reading both repos.
// `status` is hand/agent-maintained — no platform APIs. The matrix doubles as a
// wishlist: rows we WANT that don't exist yet are first-class (status "wanted",
// canonicalEvent null). Mirrored from the "Tracking Directory – WanderOS" sheet.

// ---- ENUMS ---------------------------------------------------------

// The two funnels from the sheet. Mirror the tracking plan's workspaces:
// supply ≈ WANDER_OS (host/operator), demand ≈ WANDER_COM (guest/booking).
export const conversionFunnelEnum = pgEnum("conversion_funnel", [
  "supply",
  "demand",
]);
export type ConversionFunnel = (typeof conversionFunnelEnum.enumValues)[number];

// How often the platform conversion fires per user (Google/LinkedIn "mode").
export const conversionModeEnum = pgEnum("conversion_mode", ["once", "every"]);
export type ConversionMode = (typeof conversionModeEnum.enumValues)[number];

// The simplified reality status, set by an AI agent reading the code:
//   wanted          — declared intent, not yet checked/built
//   not_implemented — checked, confirmed absent in code/platform
//   verified        — checked, confirmed wired & firing
export const conversionStatusEnum = pgEnum("conversion_status", [
  "wanted",
  "not_implemented",
  "verified",
]);
export type ConversionStatus = (typeof conversionStatusEnum.enumValues)[number];

// ---- CONVERSION EVENT (canonical Wander funnel event — the intent spine) ----

/**
 * ConversionEvent — a canonical Wander funnel event we care about for paid ads
 * ("WanderOS Inbound Submitted", "Order Completed"). Brand-level; the per-channel
 * `conversion_mapping` rows are the implementations. Mirrors `audience_target`.
 *
 * `name` is the marketing/display label. `canonicalEvent` is the real
 * tracking-plan event name (free text, nullable, AI-maintained) — null means
 * "we want this but it isn't a tracked event yet". No `isSeed`: this is real
 * config, not strippable demo data.
 */
export const conversionEventTable = pgTable(
  "conversion_event",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("cev")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text().notNull(), // display label, e.g. "WanderOS Inbound Submitted"
    // Resolved tracking-plan event name; null = not-yet-tracked / unreconciled.
    canonicalEvent: t.text(),

    funnel: conversionFunnelEnum().notNull(),
    stage: t.integer().notNull(), // ordering within the funnel
    isPrimary: t.boolean().default(false).notNull(), // money/lead vs upper-funnel

    description: t.text(),

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
    index("conversion_event_brand_idx").on(table.brandId),
    index("conversion_event_funnel_idx").on(table.funnel),
  ],
);

export type ConversionEvent = typeof conversionEventTable.$inferSelect;
export type ConversionEventInsert = typeof conversionEventTable.$inferInsert;

// ---- CONVERSION MAPPING (per-platform conversion — the reality cell) ----

/**
 * ConversionMapping — one platform conversion (Reddit "Lead", LinkedIn
 * "Submit Application", Meta "Website Lead", a Google conversion label). The
 * Wander event(s) that feed it are linked via `conversion_mapping_source`
 * (many-to-one: Reddit's single "Lead" pixel is fed by both the WanderOS and
 * List submits). Mirrors `audience` (per-channel reality).
 */
export const conversionMappingTable = pgTable(
  "conversion_mapping",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("cmap")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    platform: channelPlatformEnum().notNull(),
    // The ad account this conversion lives on, when we have a channel row for it.
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "set null" }),

    // The ad account that owns this conversion (a Google conversion lives on a
    // customer, not on the connection that reaches it).
    adAccountId: t
      .text()
      .references(() => adAccountTable.id, { onDelete: "set null" }),

    platformEventName: t.text().notNull(), // "Lead", "Submit Application", …
    externalConversionId: t.text(), // AW-… label / numeric id / null for pixel events
    externalResourceName: t.text(), // customers/…/conversionActions/… for API use
    mode: conversionModeEnum(), // once | every | null

    status: conversionStatusEnum().default("wanted").notNull(),
    notes: t.text(), // AI context, e.g. "fires via tracking-web reddit provider"
    lastCheckedAt: t.timestamp({ withTimezone: true }),

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
    index("conversion_mapping_brand_idx").on(table.brandId),
    index("conversion_mapping_platform_idx").on(table.platform),
    index("conversion_mapping_channel_idx").on(table.channelId),
    index("conversion_mapping_status_idx").on(table.status),
  ],
);

export type ConversionMapping = typeof conversionMappingTable.$inferSelect;
export type ConversionMappingInsert =
  typeof conversionMappingTable.$inferInsert;

// ---- CONVERSION MAPPING SOURCE (M2M: mapping ← feeding Wander event(s)) ----

/**
 * Join row linking a platform conversion to a Wander event that feeds it. Most
 * are 1:1; the one many-to-one today is Reddit's "Lead" ← {WanderOS Inbound
 * Submitted, List Apply Submitted}. Composite PK keeps re-seeds idempotent.
 */
export const conversionMappingSourceTable = pgTable(
  "conversion_mapping_source",
  (t) => ({
    mappingId: t
      .text()
      .references(() => conversionMappingTable.id, { onDelete: "cascade" })
      .notNull(),
    conversionEventId: t
      .text()
      .references(() => conversionEventTable.id, { onDelete: "cascade" })
      .notNull(),
  }),
  (table) => [
    primaryKey({ columns: [table.mappingId, table.conversionEventId] }),
    index("conversion_mapping_source_event_idx").on(table.conversionEventId),
  ],
);

export type ConversionMappingSource =
  typeof conversionMappingSourceTable.$inferSelect;
export type ConversionMappingSourceInsert =
  typeof conversionMappingSourceTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const conversionEventRelations = relations(
  conversionEventTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [conversionEventTable.brandId],
      references: [brandTable.id],
    }),
    sources: many(conversionMappingSourceTable),
  }),
);

export const conversionMappingRelations = relations(
  conversionMappingTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [conversionMappingTable.brandId],
      references: [brandTable.id],
    }),
    channel: one(channelTable, {
      fields: [conversionMappingTable.channelId],
      references: [channelTable.id],
    }),
    sources: many(conversionMappingSourceTable),
  }),
);

export const conversionMappingSourceRelations = relations(
  conversionMappingSourceTable,
  ({ one }) => ({
    mapping: one(conversionMappingTable, {
      fields: [conversionMappingSourceTable.mappingId],
      references: [conversionMappingTable.id],
    }),
    event: one(conversionEventTable, {
      fields: [conversionMappingSourceTable.conversionEventId],
      references: [conversionEventTable.id],
    }),
  }),
);
