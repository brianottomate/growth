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
import type {
  MessageAudienceKind,
  MessageSendSnapshot,
} from "@/lib/email-delivery";
import type { ProductUpdateContext } from "@/lib/email-document";
import type { ListingsDigest } from "@/lib/listings-digest";

export type EmailDocumentSnapshot = {
  subject: string;
  preheader: string | null;
  bodyMarkdown: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  templateKey: string;
  handoffTargetRepo: string | null;
  productUpdate?: ProductUpdateContext | null;
  /** Structured property-digest payload; see lib/listings-digest.ts. */
  digest?: ListingsDigest | null;
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

export const messageSendStatusEnum = pgEnum("message_send_status", [
  "draft",
  "approved",
  "sending",
  "sent",
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
    productUpdate: jsonb().$type<ProductUpdateContext>(),
    // The digest is a grid of homes, not prose, so it rides alongside
    // bodyMarkdown rather than being flattened into it.
    digest: jsonb().$type<ListingsDigest>(),
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

/**
 * Immutable delivery intent and outcome for an approved email revision.
 * Recipient membership stays in the provider; this table stores only the
 * provider-managed audience reference and the exact content snapshot.
 */
export const messageSendTable = pgTable(
  "message_send",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("msg")),
    platformPostId: t
      .text()
      .references(() => platformPostTable.id)
      .notNull(),
    emailDocumentId: t
      .text()
      .references(() => emailDocumentTable.id)
      .notNull(),
    emailDocumentVersionId: t
      .text()
      .references(() => emailDocumentVersionTable.id)
      .notNull(),
    revision: t.integer().notNull(),
    provider: t.text().$type<"customerio">().default("customerio").notNull(),
    providerBroadcastId: t.text().notNull(),
    providerMessageId: t.text(),
    audienceKind: t.text().$type<MessageAudienceKind>().notNull(),
    audienceReference: t.text().notNull(),
    audienceLabel: t.text().notNull(),
    status: messageSendStatusEnum().default("draft").notNull(),
    snapshot: jsonb().$type<MessageSendSnapshot>().notNull(),
    idempotencyKey: t.text().notNull(),
    error: t.text(),
    createdBy: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
    approvedBy: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
    sentBy: t.text().references(() => userTable.id, {
      onDelete: "set null",
    }),
    approvedAt: t.timestamp({ withTimezone: true }),
    sentAt: t.timestamp({ withTimezone: true }),
    failedAt: t.timestamp({ withTimezone: true }),
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
    uniqueIndex("message_send_idempotency_idx").on(table.idempotencyKey),
    index("message_send_document_idx").on(
      table.emailDocumentId,
      table.createdAt,
    ),
    index("message_send_status_idx").on(table.status),
    index("message_send_platform_post_idx").on(table.platformPostId),
  ],
);

export type EmailDocument = typeof emailDocumentTable.$inferSelect;
export type EmailDocumentVersion =
  typeof emailDocumentVersionTable.$inferSelect;
export type EmailGenerationJob = typeof emailGenerationJobTable.$inferSelect;
export type MessageSend = typeof messageSendTable.$inferSelect;

/**
 * Every Postmark webhook event from the servers Growth controls, as received.
 * Postmark retries until it gets a 200, so `dedupeKey` makes redelivery a no-op.
 */
export const postmarkEventTable = pgTable(
  "postmark_event",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("pme")),
    serverId: t.integer(),
    messageStream: t.text(),
    recordType: t.text().notNull(),
    messageId: t.text(),
    recipient: t.text(),
    tag: t.text(),
    occurredAt: t.timestamp({ withTimezone: true }),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    dedupeKey: t.text().notNull(),
    receivedAt: t
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    uniqueIndex("postmark_event_dedupe_idx").on(table.dedupeKey),
    index("postmark_event_recipient_idx").on(table.recipient),
    index("postmark_event_message_idx").on(table.messageId),
    index("postmark_event_server_type_idx").on(
      table.serverId,
      table.recordType,
      table.occurredAt,
    ),
  ],
);

export type PostmarkEvent = typeof postmarkEventTable.$inferSelect;
