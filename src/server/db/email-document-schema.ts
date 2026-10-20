import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { userTable } from "./auth-schema";
import { productionPacketTable } from "./creative-work-schema";
import { platformPostTable } from "./content-schema";
import { createId } from "./utils";
import type {
  MessageAudienceKind,
  MessageSendProvider,
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
  recipeId?: string | null;
  handoffTargetRepo: string | null;
  productUpdate?: ProductUpdateContext | null;
  /** Structured property-digest payload; see lib/listings-digest.ts. */
  digest?: ListingsDigest | null;
};

export const messageSendStatusEnum = pgEnum("message_send_status", [
  "draft",
  "approved",
  "sending",
  "sent",
  "failed",
  "cancelled",
]);

/**
 * Immutable delivery intent and outcome for an approved email revision.
 * Customer.io sends keep membership in the provider; Postmark sends read a
 * live audience and record each guest for booking attribution.
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
    documentId: t
      .text()
      .notNull()
      .references(() => productionPacketTable.id),
    contentHash: t.text().notNull(),
    provider: t
      .text()
      .$type<MessageSendProvider>()
      .default("customerio")
      .notNull(),
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
    index("message_send_document_idx").on(table.documentId, table.createdAt),
    index("message_send_status_idx").on(table.status),
    index("message_send_platform_post_idx").on(table.platformPostId),
  ],
);

export type MessageSend = typeof messageSendTable.$inferSelect;

/**
 * Recipient identity and outcomes used by webhooks and booking attribution.
 * Broadcast execution is claimed once at the send level.
 */
export const messageSendRecipientTable = pgTable(
  "message_send_recipient",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("msr")),
    messageSendId: t
      .text()
      .notNull()
      .references(() => messageSendTable.id, { onDelete: "cascade" }),
    email: t.text().notNull(),
    status: t
      .text()
      .$type<"pending" | "sent" | "skipped" | "failed">()
      .default("pending")
      .notNull(),
    /** Why a guest was skipped or failed: "opted_out", Postmark's message. */
    reason: t.text(),
    providerMessageId: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    uniqueIndex("message_send_recipient_email_idx").on(
      table.messageSendId,
      table.email,
    ),
    index("message_send_recipient_status_idx").on(
      table.messageSendId,
      table.status,
    ),
  ],
);

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
