import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizationTable, userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { homeTable } from "./home-schema";
import { createId } from "./utils";

/** Where a group's homes came from: our suggestion, the client's intake, or a person. */
export const homeGroupSourceEnum = pgEnum("home_group_source", [
  "suggested",
  "intake",
  "custom",
]);
export const homeGroupTable = pgTable(
  "home_group",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("hgroup")),
    // Brand groups keep their brand owner; workspace groups can span clients.
    brandId: t
      .text()
      .references((): AnyPgColumn => brandTable.id, { onDelete: "cascade" }),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    revision: t.integer().notNull().default(0),
    name: t.text().notNull(),
    source: homeGroupSourceEnum().notNull().default("custom"),
    /**
     * The homes the brand leads with: ads, previews, newsletters and the
     * catalog order draw from it; the featured ticks are its membership.
     * At most one per brand.
     */
    isPrimary: t.boolean().notNull().default(false),
    description: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    index("home_group_brand_idx").on(t.brandId),
    index("home_group_org_idx").on(t.organizationId),
    check(
      "home_group_owner_check",
      sql`(${t.brandId} is not null and ${t.organizationId} is null) or (${t.brandId} is null and ${t.organizationId} is not null)`,
    ),
    check(
      "home_group_primary_owner_check",
      sql`not ${t.isPrimary} or ${t.brandId} is not null`,
    ),
    check("home_group_revision_check", sql`${t.revision} >= 0`),
    uniqueIndex("home_group_primary_unique")
      .on(t.brandId)
      .where(sql`${t.isPrimary}`),
  ],
);
export const homeGroupMemberTable = pgTable(
  "home_group_member",
  (t) => ({
    groupId: t
      .text()
      .notNull()
      .references((): AnyPgColumn => homeGroupTable.id, {
        onDelete: "cascade",
      }),
    homeId: t
      .text()
      .notNull()
      .references((): AnyPgColumn => homeTable.id, { onDelete: "cascade" }),
    sortOrder: t.integer().notNull().default(0),
  }),
  (t) => [
    primaryKey({ columns: [t.groupId, t.homeId] }),
    index("home_group_member_home_idx").on(t.homeId),
  ],
);

/** Public presentation and access are opt-in for an existing home group. */
export const homeGroupShareTable = pgTable(
  "home_group_share",
  (t) => ({
    groupId: t
      .text()
      .primaryKey()
      .references(() => homeGroupTable.id, { onDelete: "cascade" }),
    organizationId: t
      .text()
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    title: t.text().notNull(),
    shareToken: t.text(),
    createdBy: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    uniqueIndex("home_group_share_token_unique").on(t.shareToken),
    check(
      "home_group_share_title_check",
      sql`char_length(btrim(${t.title})) between 1 and 120`,
    ),
    check(
      "home_group_share_token_check",
      sql`${t.shareToken} is null or ${t.shareToken} ~ '^[A-Za-z0-9_-]{43}$'`,
    ),
  ],
);

export const bookingTargetTable = pgTable(
  "booking_target",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("btarget")),
    brandId: t
      .text()
      .notNull()
      .references((): AnyPgColumn => brandTable.id, { onDelete: "cascade" }),
    name: t.text().notNull(),
    homeGroupId: t.text().references((): AnyPgColumn => homeGroupTable.id, {
      onDelete: "restrict",
    }),
    homeId: t
      .text()
      .references((): AnyPgColumn => homeTable.id, { onDelete: "restrict" }),
    checkIn: t.text(),
    checkOut: t.text(),
    guests: t.integer(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [index("booking_target_brand_idx").on(t.brandId)],
);
