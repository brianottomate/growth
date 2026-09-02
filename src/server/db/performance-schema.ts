import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organizationTable } from "./auth-schema";
import { brandTable } from "./brand-schema";
import { createId } from "./utils";

// ---- PERFORMANCE (sponsored placements sold to property managers) ----------
//
// The paid counterpart of the List+ sales page: a property manager pays to be
// featured across Wander's own marketing surfaces (Meta ads, lifecycle email,
// influencer collabs). The spreadsheet this replaces tracked
// Customer/Onboarded/Properties/Ads/Emails/Billing per customer.
//
// A performance ACCOUNT is the commercial entity — deliberately NOT a brand.
// It attaches to delivery through the nullable performanceCycleId FK on
// campaign / lifecycle_campaign / amplification_target, and the spend rollup
// never filters on brand, so the same commercial layer serves both products:
//
//   List+          delivery on WANDER's channels; campaigns carry
//                  brandId = Wander and the customer is a sponsor.
//   Performance+   delivery as the CLIENT; campaigns carry the client's own
//                  brandId, run from Wander's shared ad account, and appear
//                  under the client's own Page.
//
// `brandId` here is the amplifier.promotedBrandId graduation pattern: a brand
// row holding the customer's identity, promotable to real connected channels.
// Performance+ is that promotion, which is why ad_account is a per-brand
// allowlist rather than a 1:1 brand↔account map.

export const performanceAccountStatusEnum = pgEnum(
  "performance_account_status",
  ["prospect", "onboarding", "active", "paused", "churned"],
);
export type PerformanceAccountStatus =
  (typeof performanceAccountStatusEnum.enumValues)[number];

export const performanceAccountTable = pgTable(
  "performance_account",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("perf")),
    organizationId: t
      .text()
      .references(() => organizationTable.id, { onDelete: "cascade" })
      .notNull(),

    // The customer's identity/enrichment brand row (scraped logo, palette,
    // voice). Restrict, not cascade: deleting a brand must not silently drop
    // a paying customer's commercial record.
    brandId: t.text().references(() => brandTable.id, { onDelete: "restrict" }),

    name: t.text().notNull(), // "Away & Stay"
    contactName: t.text(), // "Brad Levine"
    contactEmail: t.text(),
    website: t.text(),

    // Plan slug, free text until plans stabilize ("performance_plus", "pro").
    plan: t.text(),
    status: performanceAccountStatusEnum().default("prospect").notNull(),

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
    index("performance_account_org_idx").on(table.organizationId),
    index("performance_account_status_idx").on(table.status),
    index("performance_account_brand_idx").on(table.brandId),
  ],
);

export type PerformanceAccount = typeof performanceAccountTable.$inferSelect;
export type PerformanceAccountInsert =
  typeof performanceAccountTable.$inferInsert;

// ---- PROPERTY (one wander.com listing the account sponsors) ----------------

/**
 * One home the account wants promoted, on whichever surface it is bookable.
 *
 * `wanderUrl` is a wander.com listing (List+, where Wander holds the
 * inventory relationship). `siteUrl` is a listing on the customer's own
 * WanderOS booking site (Performance+). Both are nullable because intake
 * collects home NAMES and we refuse to guess a URL from a title — a
 * fabricated link 404s inside a live ad. So a row is identified by a title
 * OR a URL (`performance_property_identified` enforces that much), and the
 * URL requirement belongs where it actually bites: nothing can be advertised
 * until someone resolves the home against its booking site.
 *
 * `propertyId` is the monolith's property identifier — the join key for
 * booking attribution (Order Completed webhook) and traffic rollups. It is
 * nullable because sales enters properties by URL first; the resolver that
 * maps a URL to its canonical id backfills it, and reports must treat rows
 * without it as "no attribution yet", never as zero. Performance+ homes live
 * on the customer's own domain and may never get one.
 */
export const performancePropertyTable = pgTable(
  "performance_property",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("perfprop")),
    accountId: t
      .text()
      .references(() => performanceAccountTable.id, { onDelete: "cascade" })
      .notNull(),

    wanderUrl: t.text(), // https://www.wander.com/property/... (List+)
    siteUrl: t.text(), // https://<client-domain>/... (Performance+)
    propertyId: t.text(), // monolith id; backfilled, see doc above
    title: t.text(), // display name for cards/reports
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
    index("performance_property_account_idx").on(table.accountId),
    // Postgres treats NULLs as distinct in a unique index, so each URL column
    // dedupes only the rows that actually carry it. That is the behaviour we
    // want: a List+ row and a Performance+ row never collide with each other.
    uniqueIndex("performance_property_account_url_idx").on(
      table.accountId,
      table.wanderUrl,
    ),
    uniqueIndex("performance_property_account_site_url_idx").on(
      table.accountId,
      table.siteUrl,
    ),
    check(
      "performance_property_identified",
      sql`${table.wanderUrl} is not null or ${table.siteUrl} is not null or ${table.title} is not null`,
    ),
    index("performance_property_property_idx").on(table.propertyId),
  ],
);

export type PerformanceProperty = typeof performancePropertyTable.$inferSelect;
export type PerformancePropertyInsert =
  typeof performancePropertyTable.$inferInsert;

// ---- CYCLE (one billed delivery period — the attachment point) --------------

export const performanceCycleStatusEnum = pgEnum("performance_cycle_status", [
  "planned",
  "live",
  "reporting",
  "closed",
]);
export type PerformanceCycleStatus =
  (typeof performanceCycleStatusEnum.enumValues)[number];

/**
 * One billed period ("2026-08"). Everything delivered for the customer —
 * campaigns, lifecycle campaigns, amplification targets — FKs to the cycle,
 * so the report is one query over its attachments.
 *
 * `billedAmount` and `mediaBudget` are BOTH stored (whole dollars, matching
 * campaign.budget): $500/mo billed with $400/mo of media is a take rate the
 * old spreadsheet had no column for, and reports must be honest about which
 * number spend is measured against.
 */
export const performanceCycleTable = pgTable(
  "performance_cycle",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("perfcyc")),
    accountId: t
      .text()
      .references(() => performanceAccountTable.id, { onDelete: "cascade" })
      .notNull(),

    period: t.text().notNull(), // "YYYY-MM" — human key, unique per account
    startAt: t.timestamp({ withTimezone: true }),
    endAt: t.timestamp({ withTimezone: true }),

    billedAmount: t.integer(), // whole dollars the customer pays
    mediaBudget: t.integer(), // whole dollars that reach ad platforms

    /**
     * Observed spend across every campaign attached to this cycle, in CENTS.
     *
     * Cents rather than dollars because this is the number compared against
     * `mediaBudget` to decide whether a customer is being overspent, and
     * `campaign.spend` is already rounded to whole dollars ($24.66 stored as
     * 25). The rollup reads the unrounded `campaign.stats.spend` instead and
     * keeps the precision as an integer, so no float drift accumulates across
     * a portfolio.
     *
     * Null means never computed, which is different from zero.
     */
    actualSpendCents: t.integer(),
    actualSpendAt: t.timestamp({ withTimezone: true }),

    status: performanceCycleStatusEnum().default("planned").notNull(),
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
  }),
  (table) => [
    index("performance_cycle_account_idx").on(table.accountId),
    uniqueIndex("performance_cycle_account_period_idx").on(
      table.accountId,
      table.period,
    ),
    index("performance_cycle_status_idx").on(table.status),
  ],
);

export type PerformanceCycle = typeof performanceCycleTable.$inferSelect;
export type PerformanceCycleInsert = typeof performanceCycleTable.$inferInsert;

// ---- REPORT (customer-facing snapshot for one cycle) ------------------------

export const performanceReportStatusEnum = pgEnum(
  "performance_report_status",
  ["draft", "published"],
);
export type PerformanceReportStatus =
  (typeof performanceReportStatusEnum.enumValues)[number];

/** Deterministic numbers computed at generation time; the narrative is written
 * around them (affiliate-report pattern). Snapshot, not a live join — what was
 * reported must stay readable after the underlying rows move on. */
export type PerformanceReportMetrics = {
  spend?: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  ctr?: number;
  emailSends?: number;
  propertyViews?: number;
  bookings?: number;
  [key: string]: number | undefined;
};

/**
 * Customers get no Growth access: a report is served at a tokenized public URL
 * (the pregen claim-link pattern) and delivered by email. `token` is the whole
 * credential — treat it like one.
 */
export const performanceReportTable = pgTable(
  "performance_report",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("perfrpt")),
    cycleId: t
      .text()
      .references(() => performanceCycleTable.id, { onDelete: "cascade" })
      .notNull(),
    // Denormalized so account-level report lists skip the cycle join.
    accountId: t
      .text()
      .references(() => performanceAccountTable.id, { onDelete: "cascade" })
      .notNull(),

    periodLabel: t.text().notNull(), // "August 2026", "Week 35"
    token: t.text().notNull(),

    metrics: t.jsonb().$type<PerformanceReportMetrics>(),
    narrative: t.text(),
    recommendations: t.text(),

    status: performanceReportStatusEnum().default("draft").notNull(),
    publishedAt: t.timestamp(),

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
    index("performance_report_cycle_idx").on(table.cycleId),
    index("performance_report_account_idx").on(table.accountId),
    uniqueIndex("performance_report_token_idx").on(table.token),
  ],
);

export type PerformanceReport = typeof performanceReportTable.$inferSelect;
export type PerformanceReportInsert =
  typeof performanceReportTable.$inferInsert;

// ---- INTAKE (the client's onboarding submission) ----------------------------

export const performanceIntakeStatusEnum = pgEnum("performance_intake_status", [
  "submitted",
  "verified",
  "applied",
]);
export type PerformanceIntakeStatus =
  (typeof performanceIntakeStatusEnum.enumValues)[number];

/** What the client typed, verbatim. Never edited after submission. */
export type PerformanceIntakeAnswers = {
  detailsConfirmed?: boolean;
  reportEmails?: string;
  /** Listing URLs on the client's own booking site, not names. */
  propertyUrls?: string[];
  /** "Advertise everything", set instead of naming individual listings. */
  allProperties?: boolean;
  propertyNotes?: string;
  budget?: string;
  budgetFlexible?: string;
  billingAcknowledged?: boolean;
  invoiceEmail?: string;
  ugcPermission?: string;
  /** Drive or Dropbox links. Both may be the same folder; this is human intake. */
  creativeDriveUrl?: string;
  guestListDriveUrl?: string;
  anythingElse?: string;
  accountsConnected?: boolean;
  [key: string]: unknown;
};


/**
 * A completed Performance+ intake: the RECEIPT, not the state.
 *
 * `answers` holds the submission verbatim and is never rewritten, because the
 * questions will change and a receipt that mutates with the form is worthless.
 * Live state belongs in the tables that own it — contact on the account,
 * money on the cycle, homes on performance_property, logo on the brand — and
 * `applyIntake` is what promotes one into the other. Reading a budget off this
 * row after the first month would read a stale number.
 *
 * Only four things are typed out of the blob, and each earns it:
 *
 *   mediaBudgetDollars   sets the campaign spending limit and the invoice, so
 *                        it has to be queryable and enforceable, not parsed
 *                        out of prose at spend time.
 *   guestListConsentAt   Meta's Custom Audience terms require the attestation;
 *                        producing it later means a timestamp, not a blob.
 *   billingAcknowledgedAt  the client's agreement to be pre-billed.
 *   verified*            observed from Zernio AFTER the grant, so these are
 *                        facts rather than claims, and push code reads them.
 *
 * Everything qualitative stays in `answers` for the agent to read whole.
 * Columns should follow queries; they are cheap to backfill from the blob and
 * expensive to guess at now.
 */
export const performanceIntakeTable = pgTable(
  "performance_intake",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("perfintake")),
    accountId: t
      .text()
      .references(() => performanceAccountTable.id, { onDelete: "cascade" })
      .notNull(),
    // The brand whose Page the ads will run under. Nullable because an intake
    // can arrive before the brand row exists; apply resolves it.
    brandId: t.text().references(() => brandTable.id, { onDelete: "set null" }),
    /**
     * The brand's slug AS IT WAS at submission, for reading a row without a
     * join. A snapshot, like everything else on a receipt: a later rename does
     * not rewrite it, and it survives the brand row being deleted, which is
     * the point. Nullable because `brand.slug` is (reference brands carry
     * none), so anything displaying it falls back to `brandId`. Never resolve
     * a write through this column — `brandId` is the key.
     */
    brandSlug: t.text(),

    status: performanceIntakeStatusEnum().default("submitted").notNull(),

    submittedAt: t
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    submittedByName: t.text(),
    submittedByEmail: t.text(),

    answers: t.jsonb().$type<PerformanceIntakeAnswers>().notNull(),
    /**
     * SHA-256 of the answers, so a double-clicked submit or a retried request
     * is recognisable as the same submission. Nullable for rows written before
     * this existed.
     */
    answersFingerprint: t.text(),

    /** Whole dollars per month that reach the ad platforms. */
    mediaBudgetDollars: t.integer(),
    /** Null when the client asked us to recommend one instead of naming it. */
    budgetIsRecommendation: t.boolean().default(false).notNull(),

    guestListConsentAt: t.timestamp({ withTimezone: true }),
    billingAcknowledgedAt: t.timestamp({ withTimezone: true }),
    /**
     * No longer asked. The Leadsie grant either includes the Instagram
     * account or it does not, and the client's answer never told us which,
     * so asking was a question whose answer we then ignored. Kept because
     * rows written while it was asked still carry it.
     */
    instagramLinkConfirmedAt: t.timestamp({ withTimezone: true }),

    /**
     * The client SAID they granted access. Deliberately separate from
     * `zernioVerifiedAt`, which is us seeing it: the gap between the two is
     * the most common onboarding failure, and collapsing them into one flag
     * hides exactly the case worth chasing.
     */
    accessClaimedAt: t.timestamp({ withTimezone: true }),
    zernioVerifiedAt: t.timestamp({ withTimezone: true }),
    verifiedPageId: t.text(),
    verifiedAdAccountId: t.text(),
    verifiedPixelId: t.text(),

    appliedAt: t.timestamp({ withTimezone: true }),
    appliedBy: t.text(),
    /** What apply actually wrote, so a re-read explains itself. */
    appliedSummary: t.jsonb().$type<string[]>(),

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
    index("performance_intake_account_idx").on(table.accountId),
    index("performance_intake_status_idx").on(table.status),
    index("performance_intake_brand_idx").on(table.brandId),
  ],
);

export type PerformanceIntake = typeof performanceIntakeTable.$inferSelect;
export type PerformanceIntakeInsert =
  typeof performanceIntakeTable.$inferInsert;

// ---- RELATIONS ---------------------------------------------------------------

export const performanceAccountRelations = relations(
  performanceAccountTable,
  ({ one, many }) => ({
    organization: one(organizationTable, {
      fields: [performanceAccountTable.organizationId],
      references: [organizationTable.id],
    }),
    brand: one(brandTable, {
      fields: [performanceAccountTable.brandId],
      references: [brandTable.id],
    }),
    properties: many(performancePropertyTable),
    cycles: many(performanceCycleTable),
    reports: many(performanceReportTable),
    intakes: many(performanceIntakeTable),
  }),
);

export const performancePropertyRelations = relations(
  performancePropertyTable,
  ({ one }) => ({
    account: one(performanceAccountTable, {
      fields: [performancePropertyTable.accountId],
      references: [performanceAccountTable.id],
    }),
  }),
);

export const performanceCycleRelations = relations(
  performanceCycleTable,
  ({ one, many }) => ({
    account: one(performanceAccountTable, {
      fields: [performanceCycleTable.accountId],
      references: [performanceAccountTable.id],
    }),
    reports: many(performanceReportTable),
  }),
);

export const performanceReportRelations = relations(
  performanceReportTable,
  ({ one }) => ({
    cycle: one(performanceCycleTable, {
      fields: [performanceReportTable.cycleId],
      references: [performanceCycleTable.id],
    }),
    account: one(performanceAccountTable, {
      fields: [performanceReportTable.accountId],
      references: [performanceAccountTable.id],
    }),
  }),
);

export const performanceIntakeRelations = relations(
  performanceIntakeTable,
  ({ one }) => ({
    account: one(performanceAccountTable, {
      fields: [performanceIntakeTable.accountId],
      references: [performanceAccountTable.id],
    }),
    brand: one(brandTable, {
      fields: [performanceIntakeTable.brandId],
      references: [brandTable.id],
    }),
  }),
);
