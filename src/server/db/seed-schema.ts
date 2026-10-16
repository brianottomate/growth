import { index, jsonb, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { brandTable } from "./brand-schema";
import { createId } from "./utils";
import type {
  SeedDefinition,
  SeedEvidence,
  SeedQueryParams,
} from "@/lib/seed-definition";

/** Reusable selection intent. Neither a campaign nor a provider audience. */
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
    definition: jsonb().$type<SeedDefinition>().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index("seed_list_brand_idx").on(t.brandId)],
);

/** Immutable inputs and membership per build; a refresh creates another snapshot. */
export const seedSnapshotTable = pgTable(
  "seed_snapshot",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("ssnap")),
    seedListId: t
      .text()
      .notNull()
      .references(() => seedListTable.id, { onDelete: "restrict" }),
    definition: jsonb().$type<SeedDefinition>().notNull(),
    asOf: t.timestamp({ withTimezone: true }).notNull(),
    memberCount: t.integer().notNull(),
    diagnostics: jsonb()
      .$type<{
        expansion: { ring: number; count: number }[];
        goalMet: boolean | null;
        candidateCount: number;
        excludedCount: number;
        sources: {
          name: string;
          rows: number;
          jobId: string | null;
          bytesProcessed: string | null;
        }[];
        queries: { sql: string; params: SeedQueryParams }[];
      }>()
      .notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index("seed_snapshot_list_idx").on(t.seedListId, t.createdAt)],
);

/** Normalized identity is email SHA-256. No raw Wander emails in the seed store. */
export const seedMemberTable = pgTable(
  "seed_member",
  (t) => ({
    snapshotId: t
      .text()
      .notNull()
      .references(() => seedSnapshotTable.id, { onDelete: "cascade" }),
    emailHash: t.text().notNull(),
    score: t.integer().notNull(),
    evidence: jsonb().$type<SeedEvidence[]>().notNull(),
  }),
  (t) => [primaryKey({ columns: [t.snapshotId, t.emailHash] })],
);
