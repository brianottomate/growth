import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { brandTable } from "./brand-schema";
import { channelPlatformEnum, channelTable } from "./channel-schema";
import { createId } from "./utils";

// ---- ENUMS ---------------------------------------------------------

// The window a target count applies over. Genuinely closed set, so an enum is
// fine here (format axes are text() by contrast — they evolve).
export const cadencePeriodEnum = pgEnum("cadence_period", [
  "day",
  "week",
  "month",
]);
export type CadencePeriod = (typeof cadencePeriodEnum.enumValues)[number];

// ---- CADENCE TARGET ------------------------------------------------

/**
 * CadenceTarget — the desired publishing rhythm for one channel, keyed by
 * `archetype` (the publish mechanic). e.g. on the Wander IG channel:
 *   { archetype: "video_short", count: 3, period: "day" }   // 2–3 reels/day
 *   { archetype: "image",       count: 1, period: "week" }
 *
 * This is the new strategic primitive: OBSERVED cadence is derived from
 * `platform_post` history (no storage — own + peers, same query); the gap
 * between target and observed/seeded is what the slot generator fills.
 *
 * `template` optionally narrows a target to an editorial structure
 * ("a property_roundup weekly"). Targets exist for owned brands only.
 */
export const cadenceTargetTable = pgTable(
  "cadence_target",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("cad")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    channelId: t
      .text()
      .references(() => channelTable.id, { onDelete: "cascade" })
      .notNull(),
    platform: channelPlatformEnum().notNull(), // denormalized from channel

    // Soft registry values (see content-schema TargetSpot / formats registry).
    archetype: t.text().notNull(), // the cadence axis, e.g. "video_short"
    template: t.text(), // optional finer target, e.g. "informational_deck"

    count: t.integer().notNull(),
    period: cadencePeriodEnum().notNull(),

    isActive: t.boolean().default(true).notNull(),
    notes: t.text(),

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
    index("cadence_target_brand_idx").on(table.brandId),
    index("cadence_target_channel_idx").on(table.channelId),
    // One target per channel × archetype × template × period.
    uniqueIndex("cadence_target_unique_idx").on(
      table.channelId,
      table.archetype,
      table.template,
      table.period,
    ),
  ],
);

export type CadenceTarget = typeof cadenceTargetTable.$inferSelect;
export type CadenceTargetInsert = typeof cadenceTargetTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const cadenceTargetRelations = relations(
  cadenceTargetTable,
  ({ one }) => ({
    brand: one(brandTable, {
      fields: [cadenceTargetTable.brandId],
      references: [brandTable.id],
    }),
    channel: one(channelTable, {
      fields: [cadenceTargetTable.channelId],
      references: [channelTable.id],
    }),
  }),
);
