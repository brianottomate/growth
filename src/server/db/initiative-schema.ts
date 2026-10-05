import { relations, sql } from "drizzle-orm";
import { check, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { organizationTable, userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { campaignTable } from "./ads-schema";
import { contentPostTable, seriesTable } from "./content-schema";
import { createId } from "./utils";

export const initiativeTable = pgTable(
  "initiative",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("init")),
    organizationId: t
      .text()
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    leadBrandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "set null" }),
    ownerId: t.text().references(() => userTable.id, { onDelete: "set null" }),
    name: t.text().notNull(),
    description: t.text(),
    status: t.text().notNull().default("planned"),
    startAt: t.timestamp({ withTimezone: true }),
    endAt: t.timestamp({ withTimezone: true }),
    createdAt: t
      .timestamp()
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: t
      .timestamp()
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("initiative_org_idx").on(t.organizationId),
    check(
      "initiative_status_check",
      sql`${t.status} IN ('planned', 'active', 'paused', 'completed', 'archived')`,
    ),
    check(
      "initiative_dates_check",
      sql`${t.endAt} IS NULL OR ${t.startAt} IS NULL OR ${t.endAt} >= ${t.startAt}`,
    ),
  ],
);

// One target per row, multiple initiatives per target. Real FKs keep deletion safe.
export const initiativeMemberTable = pgTable(
  "initiative_member",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("imem")),
    initiativeId: t
      .text()
      .notNull()
      .references(() => initiativeTable.id, { onDelete: "cascade" }),
    contentPostId: t
      .text()
      .references(() => contentPostTable.id, { onDelete: "cascade" }),
    seriesId: t
      .text()
      .references(() => seriesTable.id, { onDelete: "cascade" }),
    campaignId: t
      .text()
      .references(() => campaignTable.id, { onDelete: "cascade" }),
    createdAt: t
      .timestamp()
      .notNull()
      .$defaultFn(() => new Date()),
  }),
  (t) => [
    check(
      "initiative_member_one_target",
      sql`num_nonnulls(${t.contentPostId}, ${t.seriesId}, ${t.campaignId}) = 1`,
    ),
    uniqueIndex("initiative_member_post_unique").on(
      t.initiativeId,
      t.contentPostId,
    ),
    uniqueIndex("initiative_member_series_unique").on(
      t.initiativeId,
      t.seriesId,
    ),
    uniqueIndex("initiative_member_campaign_unique").on(
      t.initiativeId,
      t.campaignId,
    ),
    index("initiative_member_post_idx").on(t.contentPostId),
    index("initiative_member_series_idx").on(t.seriesId),
    index("initiative_member_campaign_idx").on(t.campaignId),
  ],
);
export const initiativeRelations = relations(
  initiativeTable,
  ({ one, many }) => ({
    leadBrand: one(brandTable, {
      fields: [initiativeTable.leadBrandId],
      references: [brandTable.id],
    }),
    owner: one(userTable, {
      fields: [initiativeTable.ownerId],
      references: [userTable.id],
    }),
    members: many(initiativeMemberTable),
  }),
);
export const initiativeMemberRelations = relations(
  initiativeMemberTable,
  ({ one }) => ({
    initiative: one(initiativeTable, {
      fields: [initiativeMemberTable.initiativeId],
      references: [initiativeTable.id],
    }),
    contentPost: one(contentPostTable, {
      fields: [initiativeMemberTable.contentPostId],
      references: [contentPostTable.id],
    }),
    series: one(seriesTable, {
      fields: [initiativeMemberTable.seriesId],
      references: [seriesTable.id],
    }),
    campaign: one(campaignTable, {
      fields: [initiativeMemberTable.campaignId],
      references: [campaignTable.id],
    }),
  }),
);
