import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { brandTable } from "./brand-schema";
import { createId } from "./utils";

/** Brand-owned strategy vocabulary. Existing code-defined pillars remain the
 * bootstrap defaults; rows here are durable overrides and new pillars created
 * through chat or future visual editing surfaces. */
export const contentPillarTable = pgTable(
  "content_pillar",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pillar")),
    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),
    slug: t.text().notNull(),
    name: t.text().notNull(),
    description: t.text().notNull(),
    color: t.text().notNull(),
    isActive: t.boolean().default(true).notNull(),
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
    index("content_pillar_brand_idx").on(table.brandId),
    uniqueIndex("content_pillar_brand_slug_idx").on(table.brandId, table.slug),
  ],
);

export type ContentPillar = typeof contentPillarTable.$inferSelect;
