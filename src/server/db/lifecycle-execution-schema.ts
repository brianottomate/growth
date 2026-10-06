import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import type {
  LifecycleAttributes,
  LifecycleEmailPayload,
  LifecycleExecutionSnapshot,
} from "@/lib/validators/lifecycle-runtime";
import { brandTable } from "./brand-schema";
import { emailSequenceTable } from "./email-sequence-schema";
import { createId } from "./utils";

// Planning status never authorizes delivery. Execution is separately activated.
export const lifecycleExecutionTable = pgTable("lifecycle_execution", (t) => ({
  sequenceId: t
    .text()
    .primaryKey()
    .references(() => emailSequenceTable.id, { onDelete: "cascade" }),
  enabled: t.boolean().notNull().default(false),
  revisionId: t.text(),
  runtimeId: t.text(),
  ingestTokenHash: t.text(),
  updatedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
}));
export const lifecycleRevisionTable = pgTable("lifecycle_revision", (t) => ({
  id: t
    .text()
    .primaryKey()
    .$defaultFn(() => createId("lrv")),
  sequenceId: t
    .text()
    .notNull()
    .references(() => emailSequenceTable.id, { onDelete: "cascade" }),
  snapshot: t.jsonb().$type<LifecycleExecutionSnapshot>().notNull(),
  contentHash: t.text().notNull(),
  createdBy: t.text().notNull(),
  createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
}));
export const lifecycleRecipientTable = pgTable(
  "lifecycle_recipient",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("lrc")),
    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    email: t.text().notNull(),
    attributes: t.jsonb().$type<LifecycleAttributes>().notNull().default({}),
    observedAt: t.timestamp({ withTimezone: true }).notNull(),
    consentSource: t.text().notNull(),
    consentAt: t.timestamp({ withTimezone: true }).notNull(),
    suppressedAt: t.timestamp({ withTimezone: true }),
    suppressionReason: t.text(),
    unsubscribeToken: t.text().notNull(),
  }),
  (t) => [
    uniqueIndex("lifecycle_recipient_brand_email_idx").on(t.brandId, t.email),
    uniqueIndex("lifecycle_recipient_unsubscribe_idx").on(t.unsubscribeToken),
  ],
);
export const lifecycleEnrollmentTable = pgTable(
  "lifecycle_enrollment",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("len")),
    sequenceId: t
      .text()
      .notNull()
      .references(() => emailSequenceTable.id, { onDelete: "cascade" }),
    revisionId: t
      .text()
      .notNull()
      .references(() => lifecycleRevisionTable.id),
    recipientId: t
      .text()
      .notNull()
      .references(() => lifecycleRecipientTable.id),
    eventId: t.text().notNull(),
    inputHash: t.text().notNull(),
    runtimeId: t.text().notNull(),
    status: t
      .text({ enum: ["active", "completed", "cancelled", "needs_review"] })
      .notNull()
      .default("active"),
    reason: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [
    uniqueIndex("lifecycle_enrollment_event_idx").on(t.sequenceId, t.eventId),
    index("lifecycle_enrollment_program_status_idx").on(t.sequenceId, t.status),
  ],
);
export const lifecycleDeliveryTable = pgTable(
  "lifecycle_delivery",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("ldv")),
    enrollmentId: t
      .text()
      .notNull()
      .references(() => lifecycleEnrollmentTable.id, { onDelete: "cascade" }),
    stepId: t.text().notNull(), // Snapshot identity; survives edits/deletion of the planning step.
    position: t.integer().notNull(),
    dueAt: t.timestamp({ withTimezone: true }).notNull(),
    status: t
      .text({ enum: ["pending", "sending", "sent", "skipped", "needs_review"] })
      .notNull()
      .default("pending"),
    payload: t.jsonb().$type<LifecycleEmailPayload>(),
    firstAttemptAt: t.timestamp({ withTimezone: true }),
    leaseUntil: t.timestamp({ withTimezone: true }),
    leaseToken: t.text(),
    messageId: t.text(),
    nextDispatchAt: t.timestamp({ withTimezone: true }),
    providerEmailId: t.text(),
    providerStatus: t.text(),
    sentAt: t.timestamp({ withTimezone: true }),
    lastError: t.text(),
  }),
  (t) => [
    uniqueIndex("lifecycle_delivery_step_idx").on(t.enrollmentId, t.stepId),
    index("lifecycle_delivery_provider_idx").on(t.providerEmailId),
  ],
);
