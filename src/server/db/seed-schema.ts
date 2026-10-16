import { index, jsonb, pgTable } from "drizzle-orm/pg-core";
import { brandTable } from "./brand-schema";
import { createId } from "./utils";
import type {
  SeedBuildSummary,
  SeedDefinition,
  SeedMember,
  SeedOrigin,
} from "@/lib/seed-definition";

/**
 * A brand's list of people for paid seeds: which starting point made it, the
 * filters its build ran and the people it found. Refresh overwrites the build;
 * Meta keeps whatever was uploaded.
 */
export const seedListTable = pgTable(
  "seed_list",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("seed")),
    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    name: t.text().notNull(),
    origin: jsonb().$type<SeedOrigin>().notNull(),
    /** The filters the build ran; null for an email list copy. */
    definition: jsonb().$type<SeedDefinition>(),
    members: jsonb().$type<SeedMember[]>().notNull(),
    memberCount: t.integer().notNull(),
    summary: jsonb().$type<SeedBuildSummary>().notNull(),
    builtAt: t.timestamp({ withTimezone: true }).notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index("seed_list_brand_idx").on(t.brandId)],
);
