import { relations, sql } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { mediaAssetTable } from "./media-schema";
import { createId } from "./utils";

// ---- HOMES DOMAIN --------------------------------------------------
//
// A client's home as a row we can hang things off. Until this table a home
// was a transient row on their WanderOS feed, which meant nothing could be
// attached to one: no chosen photo, no copy, no ads, no URL to open.
//
// What is here and what is not follows one rule. Facts the feed owns stay on
// the feed and are read live, so a renamed home or a new photo needs no sync.
// DECISIONS are stored, because a decision is not derivable: which photo the
// ads draw on, which order the gallery runs in, where a crop sits.
//
// Rows are created lazily. Opening a home's page upserts it by its feed id,
// so a brand with two hundred listings has rows only for the homes anyone
// actually worked on.

export const homeSourceEnum = pgEnum("home_source", [
  "wanderos", // read off the client's own booking site
  "wander", // a wander.com property (the List+ era shape)
  "manual", // typed in, for a client with no feed we can read
]);
export type HomeSource = (typeof homeSourceEnum.enumValues)[number];

/** What a photo is for on this home. Order within a role is `sortOrder`. */
export const homeMediaRoleEnum = pgEnum("home_media_role", [
  "hero", // the one the statics draw on
  "gallery", // the walk-through, in order, for a single-home carousel
  "excluded", // seen and rejected, so the gallery stops offering it
]);
export type HomeMediaRole = (typeof homeMediaRoleEnum.enumValues)[number];

export const homeTable = pgTable(
  "home",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("home")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    source: homeSourceEnum().default("wanderos").notNull(),
    /** The listing id on its own source: the WanderOS feed id, or a monolith id. */
    externalId: t.text().notNull(),
    /** Monolith property id, when this home is also a wander.com property. */
    propertyId: t.text(),
    /** Canonical listing URL, the shape the site's own links use. */
    url: t.text().notNull(),
    /**
     * `url` lowercased with the trailing slash off, the way the property
     * dedupe compares them. Stored rather than computed so it can be unique.
     */
    urlKey: t.text().notNull(),

    // A cache of the feed's own facts, so a row read months later in a
    // report still names the home. The feed stays the source of truth.
    name: t.text().notNull(),
    city: t.text(),
    state: t.text(),
    country: t.text(),
    bedrooms: t.integer(),
    /** Half baths are ordinary, so this is not an integer. */
    bathrooms: t.real(),
    guests: t.integer(),
    /** 0-10 as the feed reports it, decimals and all; the card halves it. */
    rating: t.real(),
    /** Cheapest nightly rate in whole dollars. */
    nightlyFrom: t.integer(),

    /**
     * The photo the ads draw on, by URL. A feed photo needs no import to be
     * chosen, so this is a URL rather than an asset id; an uploaded photo is
     * chosen the same way once its asset has a URL.
     */
    heroSourceUrl: t.text(),

    sortOrder: t.integer(),
    /** Last time the feed's facts above were refreshed. */
    syncedAt: t.timestamp({ withTimezone: true }),

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
    index("home_brand_idx").on(table.brandId),
    uniqueIndex("home_brand_external_idx").on(table.brandId, table.externalId),
    uniqueIndex("home_brand_url_idx").on(table.brandId, table.urlKey),
  ],
);

/**
 * A photo attached to one home, and the decisions about it.
 *
 * Two kinds of row, which is why both pointers are nullable. An uploaded or
 * imported photo is a library asset. A photo on the client's feed is a URL we
 * do not host; a row exists for it only once someone has decided something
 * about it (its order, its crop, that it is out). Feed photos nobody has
 * touched have no row at all, and are read live.
 */
export const homeMediaTable = pgTable(
  "home_media",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("hmed")),

    homeId: t
      .text()
      .references(() => homeTable.id, { onDelete: "cascade" })
      .notNull(),

    /** An uploaded or imported photo in our library. */
    assetId: t
      .text()
      .references(() => mediaAssetTable.id, { onDelete: "cascade" }),
    /** A photo on the client's own site, which we reference and never host. */
    sourceUrl: t.text(),
    /** The 640px variant, when the feed gave one. */
    thumbUrl: t.text(),

    role: homeMediaRoleEnum().default("gallery").notNull(),
    sortOrder: t.integer(),
    /** Where the subject sits, 0-1 on each axis, for the crop. */
    focalX: t.integer(),
    focalY: t.integer(),

    addedBy: t.text().references(() => userTable.id, { onDelete: "set null" }),

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
    index("home_media_home_idx").on(table.homeId),
    uniqueIndex("home_media_asset_idx")
      .on(table.homeId, table.assetId)
      .where(sql`${table.assetId} IS NOT NULL`),
    uniqueIndex("home_media_source_idx")
      .on(table.homeId, table.sourceUrl)
      .where(sql`${table.sourceUrl} IS NOT NULL`),
  ],
);

export const homeRelations = relations(homeTable, ({ one, many }) => ({
  brand: one(brandTable, {
    fields: [homeTable.brandId],
    references: [brandTable.id],
  }),
  media: many(homeMediaTable),
}));

export const homeMediaRelations = relations(homeMediaTable, ({ one }) => ({
  home: one(homeTable, {
    fields: [homeMediaTable.homeId],
    references: [homeTable.id],
  }),
  asset: one(mediaAssetTable, {
    fields: [homeMediaTable.assetId],
    references: [mediaAssetTable.id],
  }),
}));
