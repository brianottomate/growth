import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { brandTable } from "./brand-schema";
import { createId } from "./utils";

// ---- ENUMS ---------------------------------------------------------

/**
 * Structural grouping of a marketing-site page. Dynamic pages (locations,
 * properties, articles) measure in the hundreds/thousands, so the type is
 * the primary grouping axis for the Website wall. Classification rules live
 * in `src/lib/website-pages.ts` (rule-based + manual overrides).
 */
export const webPageTypeEnum = pgEnum("web_page_type", [
  "home",
  "brand", // hand-built marketing pages: /about, /careers, /os, /list…
  "seo_landing", // root-level SEO slugs: /luxury-vacation-rentals-*, occasions…
  "location_hub", // /{state|country} landing page
  "location_city", // /{state}/{city}
  "location_category", // /{state}[/{city}]/{families|hot-tubs|…}
  "property", // /property/{id}
  "article", // /article/{slug} (mirrored in detail as platform_post blog rows)
  "legal",
  "help",
  "other",
]);
export type WebPageType = (typeof webPageTypeEnum.enumValues)[number];

// ---- WEB PAGE TABLE ------------------------------------------------

/**
 * WebPage — one public page of a brand's marketing website, discovered from
 * its sitemap.xml. This is the persistent-pages counterpart to the
 * time-series `platform_post` (blog/newsletter walls): the sitemap sync
 * upserts by (brand, path) and flips `isActive` off for pages that drop out
 * of the sitemap instead of deleting, so page additions/removals are
 * observable over time via firstSeenAt/lastSeenAt.
 */
export const webPageTable = pgTable(
  "web_page",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("wpg")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    path: t.text().notNull(), // "/florida/miami"
    url: t.text().notNull(), // "https://www.wander.com/florida/miami"
    title: t.text().notNull(), // humanized from slug, or og:title after enrich
    pageType: webPageTypeEnum().notNull(),

    // Location decomposition — null unless a location_* page.
    locationSlug: t.text(), // "florida" (state or country)
    citySlug: t.text(), // "miami"
    categorySlug: t.text(), // "pet-friendly" | "hot-tubs" | …

    // OG enrichment (fetched for root-level pages only; see importer).
    description: t.text(),
    ogImage: t.text(),

    lastmodAt: t.timestamp(), // sitemap <lastmod>
    firstSeenAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    lastSeenAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    isActive: t.boolean().default(true).notNull(), // false = dropped from sitemap

    isSeed: t.boolean().default(false).notNull(),
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
    uniqueIndex("web_page_brand_path_idx").on(table.brandId, table.path),
    index("web_page_brand_idx").on(table.brandId),
    index("web_page_type_idx").on(table.pageType),
    index("web_page_location_idx").on(table.locationSlug),
  ],
);

export type WebPage = typeof webPageTable.$inferSelect;
export type WebPageInsert = typeof webPageTable.$inferInsert;

// ---- RELATIONS -----------------------------------------------------

export const webPageRelations = relations(webPageTable, ({ one }) => ({
  brand: one(brandTable, {
    fields: [webPageTable.brandId],
    references: [brandTable.id],
  }),
}));
