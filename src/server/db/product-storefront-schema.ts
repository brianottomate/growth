import { relations, sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import type {
  ProductAtlas,
  ProductLifecycleStatus,
  StorefrontChange,
  StorefrontContent,
  StorefrontFreshnessStatus,
  StorefrontListingStatus,
  StorefrontSurfaceId,
} from "@/lib/product-atlas";

import { organizationTable, userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { createId } from "./utils";

export const productTable = pgTable(
  "product",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("prod")),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    managerUserId: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
    name: t.text().notNull(),
    slug: t.text().notNull(),
    description: t.text(),
    lifecycleStatus: t
      .text()
      .$type<ProductLifecycleStatus>()
      .default("active")
      .notNull(),
    atlas: t.jsonb().$type<ProductAtlas>().notNull(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: t.timestamp(),
  }),
  (table) => [
    index("product_org_idx").on(table.organizationId),
    index("product_brand_idx").on(table.brandId),
    index("product_manager_idx").on(table.managerUserId),
    uniqueIndex("product_org_slug_active_idx")
      .on(table.organizationId, table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const storefrontTable = pgTable(
  "storefront",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("store")),
    productId: t
      .text()
      .references(() => productTable.id, { onDelete: "cascade" })
      .notNull(),
    managerUserId: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
    surface: t.text().$type<StorefrontSurfaceId>().notNull(),
    externalListingId: t.text(),
    publicUrl: t.text(),
    managementUrl: t.text(),
    localizedContentUrl: t.text(),
    listingStatus: t
      .text()
      .$type<StorefrontListingStatus>()
      .default("unknown")
      .notNull(),
    content: t.jsonb().$type<StorefrontContent>().notNull(),
    freshnessStatus: t
      .text()
      .$type<StorefrontFreshnessStatus>()
      .default("unknown")
      .notNull(),
    staleNote: t.text(),
    staleMarkedAt: t.timestamp(),
    staleMarkedBy: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
    confirmedAt: t.timestamp(),
    confirmedBy: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
    changelog: t.jsonb().$type<StorefrontChange[]>().default([]).notNull(),
    createdAt: t.timestamp().defaultNow().notNull(),
    updatedAt: t
      .timestamp()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: t.timestamp(),
  }),
  (table) => [
    index("storefront_product_idx").on(table.productId),
    index("storefront_manager_idx").on(table.managerUserId),
    index("storefront_freshness_idx").on(table.freshnessStatus),
    uniqueIndex("storefront_product_surface_active_idx")
      .on(table.productId, table.surface)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const productRelations = relations(productTable, ({ one, many }) => ({
  organization: one(organizationTable, {
    fields: [productTable.organizationId],
    references: [organizationTable.id],
  }),
  brand: one(brandTable, {
    fields: [productTable.brandId],
    references: [brandTable.id],
  }),
  manager: one(userTable, {
    fields: [productTable.managerUserId],
    references: [userTable.id],
    relationName: "product_manager",
  }),
  storefronts: many(storefrontTable),
}));

export const storefrontRelations = relations(storefrontTable, ({ one }) => ({
  product: one(productTable, {
    fields: [storefrontTable.productId],
    references: [productTable.id],
  }),
  manager: one(userTable, {
    fields: [storefrontTable.managerUserId],
    references: [userTable.id],
    relationName: "storefront_manager",
  }),
  staleMarker: one(userTable, {
    fields: [storefrontTable.staleMarkedBy],
    references: [userTable.id],
    relationName: "storefront_stale_marker",
  }),
  confirmer: one(userTable, {
    fields: [storefrontTable.confirmedBy],
    references: [userTable.id],
    relationName: "storefront_confirmer",
  }),
}));

export type Product = typeof productTable.$inferSelect;
export type ProductInsert = typeof productTable.$inferInsert;
export type Storefront = typeof storefrontTable.$inferSelect;
export type StorefrontInsert = typeof storefrontTable.$inferInsert;
