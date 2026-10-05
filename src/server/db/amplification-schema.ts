import { relations } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { organizationTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { platformPostTable } from "./content-schema";
import { performanceCycleTable } from "./performance-schema";
import { createId } from "./utils";

/**
 * The earned-amplification layer.
 *
 * An `amplifier` is a lightweight CONTACT we recruit to boost a post
 * (investor, press, partner, creator, team). `linkedBrandId` optionally
 * links one to a personal content workspace. This does not grant publishing
 * access or change the person's handoff preference.
 * `amplification_target` is one request: source post, person, destination and
 * action. Its optional output is a normal platform post under the personal brand.
 * Which posts deserve amplification is a judgment call made per post (by a
 * human or the assistant), deliberately not a standing rule in the schema.
 */

// One handle on a platform — a "proto-channel". Used to match a hero post's
// retweeters for fulfillment, and to seed real channels if the amplifier
// graduates to a brand.
export type AmplifierHandle = { platform: string; handle: string };

export const amplifierTable = pgTable(
  "amplifier",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("amp")),

    // Org-scoped rolodex — one amplifier row, reused across moments.
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text().notNull(),
    type: t.text(), // investor | press | partner | creator | team (soft)
    handles: t.jsonb().$type<AmplifierHandle[]>().default([]),
    notes: t.text(),
    // Slack member ID (U… / W…) used only by an explicit notify action.
    // Keeping identity on the reusable contact avoids hiding people in a
    // campaign-specific metadata blob.
    slackUserId: t.text(),
    handoffPreference: t
      .text()
      .$type<"manual" | "slack">()
      .default("manual")
      .notNull(),

    // Optional personal content workspace; a publishing connection is independent.
    linkedBrandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "set null" }),

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
    index("amplifier_org_idx").on(table.organizationId),
    index("amplifier_type_idx").on(table.type),
  ],
);

export type Amplifier = typeof amplifierTable.$inferSelect;
export type AmplifierInsert = typeof amplifierTable.$inferInsert;

export const amplificationTargetTable = pgTable(
  "amplification_target",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("atgt")),

    // The post being boosted and the amplifier we want to recruit.
    platformPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "cascade" })
      .notNull(),
    amplifierId: t
      .text()
      .references(() => amplifierTable.id, { onDelete: "cascade" })
      .notNull(),

    // Coordination only: planned → asked → confirmed → fulfilled.
    // Draft approval/publication lives on the optional output platform post.
    ask: t.text().default("planned").notNull(),
    // What the person is being asked to do. This is deliberately separate
    // from the platform post format: amplification is a relationship/action.
    actionKind: t.text().default("repost").notNull(),
    destinationPlatform: t.text().notNull(),
    outputPlatformPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "set null" }),
    draftText: t.text(),
    plannedAt: t.timestamp({ withTimezone: true }),
    fulfilledAt: t.timestamp({ withTimezone: true }),
    // Observed fulfillment evidence, distinct from the planned output draft.
    fulfilledByPostId: t.text(),
    notes: t.text(),

    // Sponsored delivery: the paid performance cycle this touch fulfils
    // (an influencer collab a customer paid for). Null for Wander's own.
    performanceCycleId: t
      .text()
      .references(() => performanceCycleTable.id, { onDelete: "set null" }),

    // Receipt for the explicit Slack handoff. A sent receipt makes retries
    // idempotent and keeps "planned" distinct from "actually asked".
    slackStatus: t.text(),
    slackChannel: t.text(),
    slackMessageTs: t.text(),
    slackError: t.text(),
    slackNotifiedAt: t.timestamp({ withTimezone: true }),

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
    index("amplification_target_post_idx").on(table.platformPostId),
    index("amplification_target_performance_cycle_idx").on(
      table.performanceCycleId,
    ),
    index("amplification_target_amplifier_idx").on(table.amplifierId),
    uniqueIndex("amplification_target_unique_idx").on(
      table.platformPostId,
      table.amplifierId,
      table.destinationPlatform,
      table.actionKind,
    ),
  ],
);

export type AmplificationTarget = typeof amplificationTargetTable.$inferSelect;
export type AmplificationTargetInsert =
  typeof amplificationTargetTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const amplifierRelations = relations(
  amplifierTable,
  ({ one, many }) => ({
    organization: one(organizationTable, {
      fields: [amplifierTable.organizationId],
      references: [organizationTable.id],
    }),
    linkedBrand: one(brandTable, {
      fields: [amplifierTable.linkedBrandId],
      references: [brandTable.id],
    }),
    targets: many(amplificationTargetTable),
  }),
);

export const amplificationTargetRelations = relations(
  amplificationTargetTable,
  ({ one }) => ({
    platformPost: one(platformPostTable, {
      relationName: "amplificationSource",
      fields: [amplificationTargetTable.platformPostId],
      references: [platformPostTable.id],
    }),
    outputPlatformPost: one(platformPostTable, {
      fields: [amplificationTargetTable.outputPlatformPostId],
      references: [platformPostTable.id],
      relationName: "amplificationOutput",
    }),
    amplifier: one(amplifierTable, {
      fields: [amplificationTargetTable.amplifierId],
      references: [amplifierTable.id],
    }),
  }),
);
