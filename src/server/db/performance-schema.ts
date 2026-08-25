import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

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
// The delivery work runs on Wander's channels under Wander's brand, so
// campaigns keep brandId = Wander and attach to the customer through the
// nullable performanceCycleId FK on initiative / lifecycle_campaign /
// amplification_target. `brandId` here is the amplifier.promotedBrandId
// graduation pattern: a brand row holding the customer's scraped identity
// (List+ Firecrawl output), promotable to real connected channels later.
// The ad_account allowlist stays 1:1 brand↔account; sponsorship never widens it.

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
 * `propertyId` is the monolith's property identifier — the join key for
 * booking attribution (Order Completed webhook) and traffic rollups. It is
 * nullable because sales enters properties by wander.com URL first; the
 * resolver that maps a URL to its canonical id backfills it, and reports must
 * treat rows without it as "no attribution yet", never as zero.
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

    wanderUrl: t.text().notNull(), // https://www.wander.com/property/...
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
    uniqueIndex("performance_property_account_url_idx").on(
      table.accountId,
      table.wanderUrl,
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
 * initiatives, lifecycle campaigns, amplification targets — FKs to the cycle,
 * so the report is one query over its attachments.
 *
 * `billedAmount` and `mediaBudget` are BOTH stored (whole dollars, matching
 * initiative.budget): $500/mo billed with $400/mo of media is a take rate the
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
