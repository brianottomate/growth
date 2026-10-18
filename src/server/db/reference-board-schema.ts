import { sql } from "drizzle-orm";
import { check, index, pgTable } from "drizzle-orm/pg-core";
import { organizationTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { contentPostTable, platformPostTable } from "./content-schema";
import { mediaAssetTable } from "./media-schema";
import { adTable } from "./ads-schema";
import { createId } from "./utils";
import type { BoardProposal } from "@/lib/reference-board";

export const referenceBoardTable = pgTable(
  "reference_board",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("board")),
    organizationId: t
      .text()
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    name: t.text().notNull(),
    brief: t.text().notNull().default(""),
    archived: t.boolean().notNull().default(false),
    createdAt: t.timestamp().notNull().defaultNow(),
    updatedAt: t
      .timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("reference_board_org_brand_idx").on(t.organizationId, t.brandId),
  ],
);

// Each row is an occurrence: the same source may appear twice with different notes.
export const boardReferenceTable = pgTable(
  "board_reference",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("bref")),
    boardId: t
      .text()
      .notNull()
      .references(() => referenceBoardTable.id, { onDelete: "cascade" }),
    platformPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "set null" }),
    mediaAssetId: t
      .text()
      .references(() => mediaAssetTable.id, { onDelete: "set null" }),
    note: t.text().notNull().default(""),
    position: t.integer().notNull(),
  }),
  (t) => [
    index("board_reference_board_idx").on(t.boardId),
    // A deleted source leaves an unavailable reference and the operator's note.
    check(
      "board_reference_one_source",
      sql`num_nonnulls(${t.platformPostId}, ${t.mediaAssetId}) <= 1`,
    ),
  ],
);

// Acceptance freezes the proposal and links the independently editable draft.
export const boardProposalTable = pgTable(
  "board_proposal",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("bprop")),
    boardId: t
      .text()
      .notNull()
      .references(() => referenceBoardTable.id, { onDelete: "cascade" }),
    document: t.jsonb().$type<BoardProposal>().notNull(),
    contentPostId: t
      .text()
      .references(() => contentPostTable.id, { onDelete: "set null" }),
    adId: t.text().references(() => adTable.id, { onDelete: "set null" }),
    acceptedAt: t.timestamp(),
    createdAt: t.timestamp().notNull().defaultNow(),
    updatedAt: t
      .timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("board_proposal_board_idx").on(t.boardId),
    check(
      "board_proposal_one_draft",
      sql`num_nonnulls(${t.contentPostId}, ${t.adId}) <= 1`,
    ),
  ],
);
