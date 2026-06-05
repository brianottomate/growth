import { relations } from "drizzle-orm";
import { index, pgTable } from "drizzle-orm/pg-core";

// Import auth schema (Better Auth tables + organization infrastructure)
import { userTable } from "./auth-schema";

// Import utilities
import { createId } from "./utils";

import { RESOURCE_TYPES } from "./constants";

// ---- FILE STORAGE -------------------------------------------------

// Attachment table - structured approach for file uploads with Vercel Blob
export const attachmentTable = pgTable(
  "attachment",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("att")),
    resourceType: t.text("resource_type", { enum: RESOURCE_TYPES }).notNull(),
    resourceId: t.text().notNull(),
    uploadedBy: t
      .text()
      .references(() => userTable.id, { onDelete: "cascade" })
      .notNull(),
    filename: t.text().notNull(),
    originalFilename: t.text().notNull(),
    mimeType: t.text().notNull(),
    size: t.integer().notNull(), // bytes
    url: t.text().notNull(), // blob storage URL
    metadata: t.jsonb().default({}), // width, height for images, duration for video/audio
    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    deletedAt: t.timestamp("deleted_at"),
  }),
  (table) => [
    index("attachment_resource_idx").on(table.resourceType, table.resourceId),
    index("attachment_uploaded_by_idx").on(table.uploadedBy),
    index("attachment_mime_type_idx").on(table.mimeType),
  ],
);

export type Attachment = typeof attachmentTable.$inferSelect;
export type AttachmentInsert = typeof attachmentTable.$inferInsert;

// ---- RELATIONS ----------------------------------------------------

export const attachmentRelations = relations(attachmentTable, ({ one }) => ({
  uploadedBy: one(userTable, {
    fields: [attachmentTable.uploadedBy],
    references: [userTable.id],
  }),
}));

// ---- RE-EXPORT AUTH SCHEMA ----------------------------------------

// Re-export everything from auth-schema for convenience
export * from "./auth-schema";

// ---- RE-EXPORT DOMAIN SCHEMAS -------------------------------------
// Each domain lives in its own file; this barrel keeps a single import
// surface so drizzle.config (points here) and the Better Auth augmented
// schema (`import * as schema`) see every table. Add new domains here.
export * from "./brand-schema";
export * from "./channel-schema";
export * from "./content-schema";
export * from "./ads-schema";
export * from "./cadence-schema";
export * from "./leads-schema";
export * from "./lifecycle-schema";
export * from "./media-schema";

// ---- RE-EXPORT CONSTANTS ------------------------------------------

// Re-export constants for convenience
export { RESOURCE_TYPES } from "./constants";
export type { ResourceType } from "./constants";
