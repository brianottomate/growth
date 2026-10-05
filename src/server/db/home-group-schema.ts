import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { brandTable } from "./brand-schema";
import { homeTable } from "./home-schema";
import { createId } from "./utils";

export const homeGroupKindEnum = pgEnum("home_group_kind", [
  "featured",
  "custom",
]);
/** Where a group's homes came from: our suggestion, the client's intake, or a person. */
export const homeGroupSourceEnum = pgEnum("home_group_source", [
  "suggested",
  "intake",
  "manual",
]);
export const homeGroupTable = pgTable(
  "home_group",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("hgroup")),
    brandId: t
      .text()
      .notNull()
      .references((): AnyPgColumn => brandTable.id, { onDelete: "cascade" }),
    name: t.text().notNull(),
    /** Retiring: mirrors isPrimary ("featured") by trigger until it is dropped. */
    kind: homeGroupKindEnum().notNull().default("custom"),
    source: homeGroupSourceEnum().notNull().default("manual"),
    /**
     * The homes the brand leads with: ads, previews, newsletters and the
     * catalog order draw from it, and `home.featured` mirrors its members.
     * At most one per brand.
     */
    isPrimary: t.boolean().notNull().default(false),
    description: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    index("home_group_brand_idx").on(t.brandId),
    uniqueIndex("home_group_featured_unique")
      .on(t.brandId)
      .where(sql`${t.kind} = 'featured'`),
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
