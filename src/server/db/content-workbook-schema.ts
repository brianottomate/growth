import { pgTable, index, uniqueIndex } from "drizzle-orm/pg-core";
import { brandTable } from "./brand-schema";
import { userTable } from "./auth-schema";
import { contentPostTable, platformPostTable } from "./content-schema";
import { createId } from "./utils";
import type { WorkbookDocument } from "@/lib/content-workbook";

// A saved import document and its applied receipt. Content remains in native drafts.
export const contentWorkbookTable = pgTable(
  "content_workbook",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("wb")),
    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    name: t.text().notNull(),
    source: t
      .jsonb()
      .$type<{ kind: string; sheet: string | null; cells: string[][] }>()
      .notNull(),
    document: t.jsonb().$type<WorkbookDocument>().notNull(),
    warnings: t.jsonb().$type<string[]>().notNull(),
    createdBy: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
    appliedAt: t.timestamp(),
    createdAt: t.timestamp().notNull().defaultNow(),
    updatedAt: t
      .timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }),
  (t) => [index("content_workbook_brand_idx").on(t.brandId)],
);
export const contentWorkbookResultTable = pgTable(
  "content_workbook_result",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("wbr")),
    workbookId: t
      .text()
      .notNull()
      .references(() => contentWorkbookTable.id, { onDelete: "cascade" }),
    sourceRow: t.integer().notNull(),
    contentPostId: t
      .text()
      .references(() => contentPostTable.id, { onDelete: "set null" }),
    platformPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "set null" }),
  }),
  (t) => [
    uniqueIndex("content_workbook_result_row_unique").on(
      t.workbookId,
      t.sourceRow,
    ),
  ],
);
