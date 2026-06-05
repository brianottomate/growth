import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";

import { brandTable } from "./brand-schema";
import { channelTable, deliveryProviderEnum } from "./channel-schema";
import { cleanupStatusEnum } from "./content-schema";
import { createId } from "./utils";

// ---- LIFECYCLE DOMAIN ----------------------------------------------
//
// The strategic layer's mirror of automated messaging that lives in external
// tools (Customer.io campaigns + transactional, later Amplitude). View-only to
// start: we store the run state, semantic kind, and metrics, and link out via
// `externalId` / `externalUrl`. Sends/edits still happen in the provider.
// (See data-model.md §9 and the product-architecture map "Lifecycle".)

// Semantic kind of the automation.
export const lifecycleKindEnum = pgEnum("lifecycle_kind", [
  "onboarding",
  "abandoned_cart",
  "reactivation",
  "revival",
  "transactional",
  "behavioral",
  "broadcast",
  "other",
]);
export type LifecycleKind = (typeof lifecycleKindEnum.enumValues)[number];

// Run state — what the thing is actually doing right now. Includes the
// strategic-layer flags Kristian asked for (planned / paused / needs_fixing).
export const lifecycleRunStateEnum = pgEnum("lifecycle_run_state", [
  "planned",
  "draft",
  "running",
  "paused",
  "stopped",
  "ended",
  "needs_fixing",
]);
export type LifecycleRunState =
  (typeof lifecycleRunStateEnum.enumValues)[number];

// Delivery surface for a touchpoint.
export const touchpointChannelEnum = pgEnum("touchpoint_channel", [
  "email",
  "sms",
  "push",
  "in_app",
  "bdr_task",
  "slack",
  "webhook",
  "other",
]);
export type TouchpointChannel =
  (typeof touchpointChannelEnum.enumValues)[number];

// Metrics snapshot (inline latest, not time-series) for an automation/touchpoint.
export type LifecycleMetrics = {
  matched?: number; // people who entered
  sent?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  converted?: number;
  bounced?: number;
};

// ---- LIFECYCLE CAMPAIGN (a journey / automation / transactional template) ----

export const lifecycleCampaignTable = pgTable(
  "lifecycle_campaign",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lc")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    // Optional primary channel it's delivered through (the newsletter/email
    // channel, etc.). Touchpoints can override per-step.
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "set null" }),

    name: t.text().notNull(),
    description: t.text(),

    kind: lifecycleKindEnum().default("other").notNull(),
    runState: lifecycleRunStateEnum().default("planned").notNull(),

    // Which external object this mirrors: "campaign" | "transactional".
    externalKind: t.text(),
    triggerEvent: t.text(), // e.g. "Order Completed", "checkout_started"

    provider: deliveryProviderEnum(), // customerio, etc.
    externalId: t.text(),
    externalUrl: t.text(),

    cleanupStatus: cleanupStatusEnum().default("keep").notNull(),

    metrics: t.jsonb().$type<LifecycleMetrics>(),

    startedAt: t.timestamp({ withTimezone: true }),
    lastSentAt: t.timestamp({ withTimezone: true }),

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
    index("lifecycle_campaign_brand_idx").on(table.brandId),
    index("lifecycle_campaign_kind_idx").on(table.kind),
    index("lifecycle_campaign_run_state_idx").on(table.runState),
    index("lifecycle_campaign_cleanup_idx").on(table.cleanupStatus),
    index("lifecycle_campaign_external_idx").on(table.provider, table.externalId),
  ],
);

export type LifecycleCampaign = typeof lifecycleCampaignTable.$inferSelect;
export type LifecycleCampaignInsert =
  typeof lifecycleCampaignTable.$inferInsert;

// ---- LIFECYCLE TOUCHPOINT (a step / message inside a journey) ----

export const lifecycleTouchpointTable = pgTable(
  "lifecycle_touchpoint",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lt")),

    campaignId: t
      .text()
      .references(() => lifecycleCampaignTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text(),
    subject: t.text(),
    channel: touchpointChannelEnum().default("email").notNull(),

    position: t.integer().default(0).notNull(), // order within the journey
    delayLabel: t.text(), // human label, e.g. "after 2 days"

    externalId: t.text(),
    metrics: t.jsonb().$type<LifecycleMetrics>(),

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
    index("lifecycle_touchpoint_campaign_idx").on(table.campaignId),
  ],
);

export type LifecycleTouchpoint = typeof lifecycleTouchpointTable.$inferSelect;
export type LifecycleTouchpointInsert =
  typeof lifecycleTouchpointTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const lifecycleCampaignRelations = relations(
  lifecycleCampaignTable,
  ({ one, many }) => ({
    brand: one(brandTable, {
      fields: [lifecycleCampaignTable.brandId],
      references: [brandTable.id],
    }),
    channel: one(channelTable, {
      fields: [lifecycleCampaignTable.channelId],
      references: [channelTable.id],
    }),
    touchpoints: many(lifecycleTouchpointTable),
  }),
);

export const lifecycleTouchpointRelations = relations(
  lifecycleTouchpointTable,
  ({ one }) => ({
    campaign: one(lifecycleCampaignTable, {
      fields: [lifecycleTouchpointTable.campaignId],
      references: [lifecycleCampaignTable.id],
    }),
  }),
);
