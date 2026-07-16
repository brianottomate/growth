import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { brandTable } from "./brand-schema";
import { deliveryProviderEnum } from "./channel-schema";
import { lifecycleWorkspaceEnum } from "./lifecycle-schema";
import { createId } from "./utils";

// ---- TRANSACTIONAL DOMAIN ------------------------------------------
//
// The registry of product-triggered ("owed") emails — one row per message the
// backend sends 1:1 in response to a product event or obligation. Growth never
// sends these; the monolith does. This table is the audit + migration tracker:
// what triggers each message, where its template lives, which pipe delivers
// it, and how far along the CIO-UI → react-email → in-house migration it is.
// Boundary vs lifecycle (the unsubscribe test), trigger taxonomy, and the
// status ladder are specified in docs/transactional-emails.md.

export const transactionalDomainEnum = pgEnum("transactional_domain", [
  "auth",
  "booking",
  "payments",
  "invoicing",
  "agreements",
  "statements",
  "os_tasks",
  "os_notifications",
  "org",
  "other",
]);
export type TransactionalDomain =
  (typeof transactionalDomainEnum.enumValues)[number];

export const transactionalCriticalityEnum = pgEnum(
  "transactional_criticality",
  ["auth_blocking", "legal_financial", "operational", "informational"],
);
export type TransactionalCriticality =
  (typeof transactionalCriticalityEnum.enumValues)[number];

// Migration ladder: legacy CIO-UI HTML → react-email HTML pushed into the
// existing CIO message (env-var flip) → sent in-house via Postmark/Resend.
export const transactionalStatusEnum = pgEnum("transactional_status", [
  "live_legacy",
  "live_rebranded",
  "live_inhouse",
  "dead", // env var declared, no call site
  "retired",
]);
export type TransactionalStatus =
  (typeof transactionalStatusEnum.enumValues)[number];

// Transactional timing is owed, not chosen: `event` fires at the moment of a
// product event; `anchored` fires at an offset from a domain date (check-in,
// payment due); `condition` fires when a state has persisted (task overdue,
// still-unverified) — anchored plus a still-true check at send time.
export const transactionalTriggerKindEnum = pgEnum(
  "transactional_trigger_kind",
  ["event", "anchored", "condition"],
);
export type TransactionalTriggerKind =
  (typeof transactionalTriggerKindEnum.enumValues)[number];

export const transactionalTemplateSourceEnum = pgEnum(
  "transactional_template_source",
  ["cio_ui", "design_system", "none"],
);
export type TransactionalTemplateSource =
  (typeof transactionalTemplateSourceEnum.enumValues)[number];

/** A send call site in a product repo. The code is the system of record. */
export type TransactionalCodeRef = {
  repo: string; // e.g. "wandercom/wander"
  path: string;
  line?: number;
  role?: "trigger" | "sender" | "template" | "registry";
  note?: string; // e.g. "reschedule confirm re-uses this template"
};

/**
 * The message_data / template-variable contract. Migration safety = these
 * keys stay stable while templates and providers change underneath them.
 */
export type TransactionalDataContractEntry = {
  key: string;
  required: boolean;
  example?: string;
  note?: string;
};

export type TransactionalProviderRef = {
  envVar?: string; // e.g. "CIO_MAGIC_LINK_MESSAGE_ID" (Doppler-resolved)
  defaultId?: string; // hardcoded fallback in envs.ts, where one exists
  template?: string; // provider-side template name (Postmark/Resend)
  from?: string;
  replyTo?: string;
  note?: string;
};

export const transactionalMessageTable = pgTable(
  "transactional_message",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("txm")),

    brandId: t
      .text()
      .references(() => brandTable.id, { onDelete: "cascade" })
      .notNull(),

    // Stable slug, e.g. "auth.magic_link", "invoicing.hnhl_due_soon".
    key: t.text().notNull(),
    name: t.text().notNull(),
    // Exact current subject when source-visible; placeholders are allowed.
    subject: t.text(),
    description: t.text(),

    workspace: lifecycleWorkspaceEnum().default("marketplace").notNull(),
    domain: transactionalDomainEnum().default("other").notNull(),
    criticality: transactionalCriticalityEnum()
      .default("operational")
      .notNull(),

    // -- trigger (with the time dimension) --
    triggerKind: transactionalTriggerKindEnum().default("event").notNull(),
    // The product event or persisted state, in plain words.
    triggerEvent: t.text(),
    // For anchored/condition: the domain date the send hangs off.
    triggerAnchor: t.text(), // "check_in" | "payment_due" | "task_due" | …
    // Signed offset from the anchor (negative = before). Null for `event`.
    triggerOffsetMinutes: t.integer(),
    // Human override when minutes can't express it ("morning of check-in").
    triggerLabel: t.text(),

    // -- delivery today --
    provider: deliveryProviderEnum().default("customerio").notNull(),
    providerRef: t.jsonb().$type<TransactionalProviderRef>(),
    codeRefs: t.jsonb().$type<TransactionalCodeRef[]>(),

    // -- template truth --
    templateSource: transactionalTemplateSourceEnum()
      .default("cio_ui")
      .notNull(),
    // @wandercom/design-system-emails registry key (EmailTemplateName),
    // e.g. "marketplace.transactional.guest.email-code". For live_legacy rows
    // this is the *candidate* template the rebrand should use.
    templateKey: t.text(),
    dataContract: t.jsonb().$type<TransactionalDataContractEntry[]>(),
    // Placeholder props for the react-email preview render. Values are
    // placeholders ("{{magic_link_url}}"), never real recipient data.
    previewProps: t.jsonb().$type<Record<string, unknown>>(),

    // -- migration + hygiene --
    status: transactionalStatusEnum().default("live_legacy").notNull(),
    linearRef: t.text(), // e.g. "PLAT-3703"
    notes: t.text(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: t.timestamp(),
  }),
  (table) => [
    uniqueIndex("transactional_message_key_idx").on(table.brandId, table.key),
    index("transactional_message_domain_idx").on(table.domain),
    index("transactional_message_status_idx").on(table.status),
    index("transactional_message_provider_idx").on(table.provider),
  ],
);

export type TransactionalMessage =
  typeof transactionalMessageTable.$inferSelect;
export type TransactionalMessageInsert =
  typeof transactionalMessageTable.$inferInsert;

export const transactionalMessageRelations = relations(
  transactionalMessageTable,
  ({ one }) => ({
    brand: one(brandTable, {
      fields: [transactionalMessageTable.brandId],
      references: [brandTable.id],
    }),
  }),
);
