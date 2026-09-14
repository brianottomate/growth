import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { createId } from "./utils";

// ---- DEMAND SALES DOMAIN ---------------------------------------------
//
// Operational state for the demand-sales (guest → BDR) sync into HubSpot.
// Deliberately tiny: the pipeline's idempotency ledger is `funnel_send_log`
// and its detection state is `funnel_state` (funnel-schema.ts); this domain
// only remembers which HubSpot contact a lead landed on so repeat syncs go
// straight to the record instead of through CRM search, which is the shared
// 5 req/s revenue-path budget (docs/hubspot-gateway-plan.md).
//
// Phase 2 (the User Events custom object) will key event records on
// `funnel_send_log (userId, stage, windowKey)` and needs exactly this
// contact id to associate them.

export const demandCrmLinkTable = pgTable(
  "demand_crm_link",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("dcl")),

    /** Lower-cased email — the identity the whole pipeline keys on. */
    email: t.text().notNull(),
    /** Wander user id when the lead carried one. */
    userId: t.text(),
    hubspotContactId: t.text(),

    /** Event type of the most recent sync attempt. */
    lastEventType: t.text(),
    lastSyncedAt: t.timestamp({ withTimezone: true }),
    /** Null after a successful write; the failure message otherwise. */
    lastError: t.text(),
    attemptCount: t.integer().default(0).notNull(),

    createdAt: t
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    uniqueIndex("demand_crm_link_email_idx").on(table.email),
    index("demand_crm_link_hubspot_contact_idx").on(table.hubspotContactId),
    index("demand_crm_link_user_idx").on(table.userId),
  ],
);

export type DemandCrmLink = typeof demandCrmLinkTable.$inferSelect;
export type DemandCrmLinkInsert = typeof demandCrmLinkTable.$inferInsert;
