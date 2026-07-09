import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { userTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { createId } from "./utils";

// ---- AFFILIATE PROGRAM OPS -----------------------------------------
//
// Operational layer for running partner/affiliate programs in-house (first:
// Wander's Impact.com program, taken over from Acceleration Partners 8/1/26 —
// see docs/affiliate-program-takeover.md). Deliberately mirrors the listening
// architecture: a generic brand+network-scoped core with the network specifics
// pushed to the edges (client file, prompts, config jsonb). `network` is
// free-text like mention.provider — adding a second network (ShareASale, a
// referral program, …) is a new value + client, never a migration.
//
// NOT the conversion-attribution path: Order Completed events fire server-side
// from the monolith to Impact and stay there. These tables are the ops desk —
// inbound email triage, application review, monitoring, corrections.

// ---- PROGRAM --------------------------------------------------------

/** Loosely-typed program config — network contacts, ops addresses, thresholds. */
export interface PartnerProgramConfig {
  /** Network-side CSM / support contacts, for reference in the UI. */
  contacts?: Array<{ name: string; role?: string; email?: string }>;
  /** Impact batch-email address for CSV corrections (legacy fallback path). */
  correctionBatchEmail?: string;
  /** Inbound address partner mail is forward-copied to (Resend receiving). */
  inboundAddress?: string;
  /** Public-facing program contact (what partners write to). */
  programEmail?: string;
  notes?: string;
}

export const partnerProgramTable = pgTable(
  "partner_program",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("prg")),

    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id),

    name: t.text().notNull(), // "Wander Affiliate Program"
    // The swap point (cf. mention.provider): "impact" today; free-text so a new
    // network never needs a migration.
    network: t.text().notNull().default("impact"),
    // The network's own id for the program/campaign (Impact ProgramId).
    externalProgramId: t.text(),

    status: t.text().$type<"active" | "paused">().notNull().default("active"),
    config: t.jsonb().$type<PartnerProgramConfig>(),

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
  (table) => [index("partner_program_brand_idx").on(table.brandId)],
);

export type PartnerProgram = typeof partnerProgramTable.$inferSelect;
export type PartnerProgramInsert = typeof partnerProgramTable.$inferInsert;

// ---- PARTNER (network cache + our notes) ----------------------------
//
// Cache of the network's partner records (Impact MediaPartners) plus our own
// grouping/notes. Synced by cron; `raw` keeps the full network payload.
// Conceptually adjacent to `amplifier` (influencers/partners for content
// collabs) but kept separate: an affiliate partner is a commission counterparty
// with network state. Link via an optional amplifierId later if a creator is both.

export const affiliatePartnerTable = pgTable(
  "affiliate_partner",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("apt")),

    programId: t
      .text()
      .notNull()
      .references(() => partnerProgramTable.id),

    externalId: t.text().notNull(), // Impact MediaPartner id
    name: t.text(),
    // Network's partner state, free-text: ACTIVE | PENDING | DECLINED | …
    state: t.text(),
    website: t.text(),
    email: t.text(),
    // Our own segmentation (content / loyalty / coupon / …) and working notes.
    partnerGroup: t.text(),
    notes: t.text(),

    raw: t.jsonb(),
    lastSyncedAt: t.timestamp(),

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
    uniqueIndex("affiliate_partner_program_external_uq").on(
      table.programId,
      table.externalId,
    ),
    index("affiliate_partner_state_idx").on(table.state),
  ],
);

export type AffiliatePartner = typeof affiliatePartnerTable.$inferSelect;
export type AffiliatePartnerInsert = typeof affiliatePartnerTable.$inferInsert;

// ---- ITEM (the ops triage queue) -------------------------------------
//
// One row = one unit of affiliate ops work. Kinds share a lifecycle (the
// mention grammar the team already triages with: open → handled/dismissed with
// assignee + audit) but differ in provenance:
//   email        — a message forward-copied from the program inbox
//   application  — a partner application to review (email notification or
//                  PENDING-state sync)
//   fraud_flag   — a suspicious transaction/referrer surfaced by the fraud cron
//   correction   — a staged void/correction batch awaiting approval
//   finding      — anything an operator/cron wants a human to look at
//                  (tracking break, balance alert, terms drift, …)

export const AFFILIATE_ITEM_KINDS = [
  "email",
  "application",
  "fraud_flag",
  "correction",
  "finding",
] as const;
export type AffiliateItemKind = (typeof AFFILIATE_ITEM_KINDS)[number];

export const AFFILIATE_ITEM_STATUSES = ["open", "handled", "dismissed"] as const;
export type AffiliateItemStatus = (typeof AFFILIATE_ITEM_STATUSES)[number];

export const affiliateItemTable = pgTable(
  "affiliate_item",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("afi")),

    programId: t
      .text()
      .notNull()
      .references(() => partnerProgramTable.id),
    // Resolved link to a known partner (by sender email / external id) — best
    // effort, filled when we can match.
    partnerId: t.text().references(() => affiliatePartnerTable.id),

    kind: t.text().$type<AffiliateItemKind>().notNull(),
    // Idempotency key per kind: email:<resendEmailId>, application:<externalId>,
    // fraud:<actionId>, … Re-delivery/re-runs upsert instead of duplicating.
    dedupKey: t.text().notNull(),

    title: t.text(), // email subject / partner name / finding headline
    snippet: t.text(), // first ~600 chars of the body / description

    // ---- Email provenance (kind=email; null otherwise) ----
    fromEmail: t.text(),
    fromName: t.text(),
    // Normalized subject (Re:/Fwd: stripped, lowercased) — groups a back-and-
    // forth into one visual thread in the UI.
    threadKey: t.text(),
    receivedAt: t.timestamp(),
    sourceEmailId: t.text(), // Resend received-email id

    // ---- Triage (filled by triage.scoreItems; nullable until scored) ----
    relevance: t.integer(), // 0..10
    intentTag: t.text(),
    suggestedAction: t.text(), // engage | monitor | skip
    rationale: t.text(),
    // AI-drafted reply (kind=email, engage-worthy only). Human edits and sends
    // from the real inbox; proof-of-work lands in replyNote.
    suggestedReply: t.text(),

    status: t.text().$type<AffiliateItemStatus>().notNull().default("open"),

    // ---- Assignment / audit (mention grammar) ----
    assigneeId: t.text().references(() => userTable.id),
    resolvedById: t.text().references(() => userTable.id),
    resolvedAt: t.timestamp(),
    replyNote: t.text(), // what we actually did ("replied from Gmail 7/14")
    decisionNote: t.text(), // the judgment, esp. why we deliberately passed

    // ---- Broadcast trail ----
    slackTs: t.text(),
    slackChannel: t.text(),

    raw: t.jsonb(), // full payload (email text, network record, cron evidence)

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
    uniqueIndex("affiliate_item_dedup_uq").on(table.programId, table.dedupKey),
    index("affiliate_item_status_idx").on(table.status),
    index("affiliate_item_kind_idx").on(table.kind),
    index("affiliate_item_thread_idx").on(table.threadKey),
  ],
);

export type AffiliateItem = typeof affiliateItemTable.$inferSelect;
export type AffiliateItemInsert = typeof affiliateItemTable.$inferInsert;

// ---- DAILY METRICS (written by the monitor cron; empty until it lands) ----
//
// One row per program-day (partnerId null) or partner-day. No unique constraint
// yet — Postgres treats NULLs as distinct, so the writer upserts defensively;
// revisit with NULLS NOT DISTINCT when the cron lands.

export const affiliateMetricDailyTable = pgTable(
  "affiliate_metric_daily",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("amd")),

    programId: t
      .text()
      .notNull()
      .references(() => partnerProgramTable.id),
    partnerId: t.text().references(() => affiliatePartnerTable.id),

    date: t.date().notNull(),
    clicks: t.integer(),
    actions: t.integer(),
    revenue: t.real(),
    commission: t.real(),
    raw: t.jsonb(),

    createdAt: t
      .timestamp()
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    index("affiliate_metric_program_date_idx").on(table.programId, table.date),
  ],
);

export type AffiliateMetricDaily = typeof affiliateMetricDailyTable.$inferSelect;
export type AffiliateMetricDailyInsert =
  typeof affiliateMetricDailyTable.$inferInsert;
