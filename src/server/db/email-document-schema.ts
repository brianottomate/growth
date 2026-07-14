import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { userTable } from "./auth-schema";
import { platformPostTable } from "./content-schema";
import { createId } from "./utils";

export type EmailDocumentSnapshot = {
  subject: string;
  preheader: string | null;
  bodyMarkdown: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  templateKey: string;
  handoffTargetRepo: string | null;
};

export const emailDocumentVersionSourceEnum = pgEnum(
  "email_document_version_source",
  ["generation", "manual", "restore"],
);

export const emailGenerationStatusEnum = pgEnum("email_generation_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

/**
 * The canonical, editable email artifact for one newsletter platform spot.
 * Markdown is the source of truth; React Email HTML and repository handoffs are
 * deterministic projections and are never persisted as competing authoring
 * formats.
 */
export const emailDocumentTable = pgTable(
  "email_document",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("edoc")),
    platformPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "cascade" })
      .notNull(),
    subject: t.text().default("").notNull(),
    preheader: t.text(),
    bodyMarkdown: t.text().default("").notNull(),
    ctaLabel: t.text(),
    ctaUrl: t.text(),
    templateKey: t.text().default("editorial").notNull(),
    handoffTargetRepo: t.text(),
    currentRevision: t.integer().default(0).notNull(),
    createdBy: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
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
    uniqueIndex("email_document_platform_post_idx").on(table.platformPostId),
  ],
);

/** Immutable checkpoints at useful editorial boundaries, not every keystroke. */
export const emailDocumentVersionTable = pgTable(
  "email_document_version",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("edocv")),
    emailDocumentId: t
      .text()
      .references(() => emailDocumentTable.id, { onDelete: "cascade" })
      .notNull(),
    revision: t.integer().notNull(),
    snapshot: jsonb().$type<EmailDocumentSnapshot>().notNull(),
    source: emailDocumentVersionSourceEnum().notNull(),
    note: t.text(),
    createdBy: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    uniqueIndex("email_document_version_revision_idx").on(
      table.emailDocumentId,
      table.revision,
    ),
    index("email_document_version_created_idx").on(
      table.emailDocumentId,
      table.createdAt,
    ),
  ],
);

/**
 * One deliberate generation attempt for one selected newsletter slot. Cadence
 * and moment planning never create these jobs; the operator starts them from an
 * individual issue after refining its brief in chat.
 */
export const emailGenerationJobTable = pgTable(
  "email_generation_job",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("egen")),
    emailDocumentId: t
      .text()
      .references(() => emailDocumentTable.id, { onDelete: "cascade" })
      .notNull(),
    platformPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "cascade" })
      .notNull(),
    status: emailGenerationStatusEnum().default("queued").notNull(),
    brief: t.text(),
    model: t.text().notNull(),
    error: t.text(),
    createdBy: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
    startedAt: t.timestamp({ withTimezone: true }),
    completedAt: t.timestamp({ withTimezone: true }),
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
    index("email_generation_job_document_idx").on(
      table.emailDocumentId,
      table.createdAt,
    ),
    index("email_generation_job_status_idx").on(table.status),
    index("email_generation_job_platform_post_idx").on(table.platformPostId),
  ],
);

export type EmailDocument = typeof emailDocumentTable.$inferSelect;
export type EmailDocumentVersion =
  typeof emailDocumentVersionTable.$inferSelect;
export type EmailGenerationJob = typeof emailGenerationJobTable.$inferSelect;
