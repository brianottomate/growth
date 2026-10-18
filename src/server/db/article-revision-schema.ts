import { sql } from "drizzle-orm";
import { check, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import {
  productionPacketTable,
  workflowRunTable,
} from "./creative-work-schema";
import { userTable } from "./auth-schema";
import { createId } from "./utils";
import type { CreativeDocument } from "@/lib/creative-document";

/** Immutable article snapshots; candidate disposition changes without editing its contents. */
export const articleRevisionTable = pgTable(
  "article_revision",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("arev")),
    documentId: t
      .text()
      .notNull()
      .references(() => productionPacketTable.id, { onDelete: "cascade" }),
    runId: t
      .text()
      .references(() => workflowRunTable.id, { onDelete: "set null" }),
    document: t
      .jsonb()
      .$type<Extract<CreativeDocument, { type: "article" }>>()
      .notNull(),
    source: t.text().notNull(),
    status: t
      .text()
      .$type<"history" | "candidate" | "accepted" | "dismissed">()
      .notNull()
      .default("history"),
    createdBy: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
    createdAt: t.timestamp().notNull().defaultNow(),
    decidedBy: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
    decidedAt: t.timestamp(),
  }),
  (t) => [
    index("article_revision_document_idx").on(t.documentId, t.createdAt),
    uniqueIndex("article_revision_run_unique").on(t.runId),
    check(
      "article_revision_status_check",
      sql`${t.status} IN ('history','candidate','accepted','dismissed')`,
    ),
    check(
      "article_revision_type_check",
      sql`${t.document} @> '{"type":"article","schemaVersion":1}'::jsonb`,
    ),
  ],
);

/** Current editorial sign-off; any ordinary edit removes this link, retaining history. */
export const articleAcceptanceTable = pgTable("article_acceptance", (t) => ({
  documentId: t
    .text()
    .primaryKey()
    .references(() => productionPacketTable.id, { onDelete: "cascade" }),
  revisionId: t
    .text()
    .notNull()
    .references(() => articleRevisionTable.id, { onDelete: "cascade" }),
}));
