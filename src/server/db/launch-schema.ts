import { relations, sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import type {
  LaunchBrief,
  LaunchDeliverable,
  LaunchMaturity,
  LaunchStatus,
  LaunchTier,
} from "@/lib/launch";

import { organizationTable, userTable } from "./auth-schema";
import { productTable } from "./product-storefront-schema";
import { createId } from "./utils";

/**
 * A product moment: what ships, when, and who owes what.
 *
 * The children (series, campaigns, content posts) point AT a launch through
 * their own nullable `launchId`, rather than the launch holding arrays of
 * them. One launch routinely spans several brands — `series.brandId` is
 * notNull, so Wander corporate, a founder's personal account and an
 * operator's IG are three series under one launch — and child-side FKs make
 * that plural for free, with no dangling ids to reconcile.
 *
 * `brief` and `deliverables` are jsonb because they are five-to-seven-item
 * sets edited as a unit and never queried across launches. Everything the
 * list view, the nudges, and the joins need stays a column.
 */
export const launchTable = pgTable(
  "launch",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lch")),

    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),

    /**
     * What ships. Features of an existing product set `brief.atlas.storyIds`;
     * an empty story list means the product itself is launching.
     */
    productId: t
      .text()
      .references(() => productTable.id, { onDelete: "cascade" })
      .notNull(),

    name: t.text().notNull(),
    slug: t.text().notNull(),

    tier: t.integer().$type<LaunchTier>().default(3).notNull(),

    /** The date a customer can see it, NOT the code-complete date. */
    targetDate: t.date(),

    maturity: t.text().$type<LaunchMaturity>().default("ga").notNull(),
    status: t.text().$type<LaunchStatus>().default("draft").notNull(),

    /** One name owns both the story and the adoption number. */
    marketingOwnerId: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),

    /** Which larger story this ladders into. Null when it stands alone. */
    releaseTheme: t.text(),

    brief: t.jsonb().$type<LaunchBrief>().notNull(),
    deliverables: t
      .jsonb()
      .$type<LaunchDeliverable[]>()
      .default([])
      .notNull(),

    /** The Google Doc the brief was pasted or imported from, when there is one. */
    sourceUrl: t.text(),

    shippedAt: t.timestamp({ withTimezone: true }),

    createdById: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
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
    index("launch_org_idx").on(table.organizationId),
    index("launch_product_idx").on(table.productId),
    index("launch_status_idx").on(table.status),
    index("launch_target_date_idx").on(table.targetDate),
    uniqueIndex("launch_org_slug_active_idx")
      .on(table.organizationId, table.slug)
      // Partial so a soft-deleted launch doesn't block reusing its slug.
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const launchRelations = relations(launchTable, ({ one }) => ({
  organization: one(organizationTable, {
    fields: [launchTable.organizationId],
    references: [organizationTable.id],
  }),
  product: one(productTable, {
    fields: [launchTable.productId],
    references: [productTable.id],
  }),
  marketingOwner: one(userTable, {
    fields: [launchTable.marketingOwnerId],
    references: [userTable.id],
  }),
}));

export type Launch = typeof launchTable.$inferSelect;
export type LaunchInsert = typeof launchTable.$inferInsert;
