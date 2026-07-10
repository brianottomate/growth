import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { createId } from "./utils";

// ---- AD ACCOUNTS: aggregator allowlist ------------------------------
//
// Ad aggregators (Zernio today) connect to platforms via a HUMAN's OAuth —
// Meta/LinkedIn grants expose every ad account that person can manage, not
// just Wander's. The 2026-07-10 Zernio probe found the Meta connection
// (authorized via Kristian's personal Facebook) enumerating SIX ad accounts,
// including "Homi" (Kristian's personal project) — and Zernio's /ads/tree
// ignored its own scopedAdAccountIds filter.
//
// This table is the durable, default-DENY registry of which external ad
// accounts our code is allowed to consume. Every aggregator read must filter
// through it (see zernioAllowedAdAccounts() in ads-analytics.service /
// spend-tracker connectors README): an account with no row here, or with
// isAllowed = false, is dropped (and logged) — personal/unknown accounts can
// never pollute Wander reporting.
//
// Rows are operator-managed config (Drizzle Studio or a seed script), not
// synced state. Keep explicit isAllowed=false rows for known-foreign accounts
// so the denial is self-documenting rather than an absence.
//
// If this ever gets a UI (Kristian, 2026-07-10): the ALLOWED accounts are the
// content — show them prominently; the denied rows are just an audit trail —
// tuck them into a small collapsed "denied / ignored" section. Enforcement is
// default-deny either way, so the deny list is documentation, not a control.

export const adAccountTable = pgTable(
  "ad_account",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("adacct")),

    /** Aggregator platform key, e.g. "facebook" | "google" | "pinterest" | "linkedin" | "twitter". */
    platform: t.text().notNull(),
    /** Platform-native ad account id, e.g. "act_885632589057558" (Meta) or a CID (Google). */
    externalId: t.text().notNull(),
    /** Display name as the platform reports it, for humans. */
    name: t.text(),

    /** Default-deny: only rows with isAllowed = true are consumed. */
    isAllowed: t.boolean().notNull().default(false),
    /** Why this row exists — provenance of the allow/deny decision. */
    note: t.text(),

    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }),
  (table) => [
    uniqueIndex("ad_account_platform_external_id_idx").on(
      table.platform,
      table.externalId,
    ),
  ],
);
