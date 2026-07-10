import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { createId } from "./utils";

// ---- FUNNEL DOMAIN --------------------------------------------------
//
// Operational state for the marketplace abandonment regimen (abandoned
// search / wishlist / cart / payment). Distinct from the lifecycle domain:
// lifecycle-schema is the strategy layer ("what journeys do we want"),
// this is the detection layer ("where is each user in the funnel right
// now, and what have we already fired").
//
// Dual-rail design (docs/funnel-abandonment.md):
//   • Amplitude per-event webhooks upsert `funnel_state` in real time
//     (primary rail — /api/workflows/amplitude-funnel-event).
//   • A daily BigQuery reconciliation heals missed events and records
//     every disagreement in `funnel_drift_log` (trust rail).
//   • A frequent sweep queries `funnel_state` with window predicates
//     ("searched ≥1h and ≤7d ago AND no checkout since") and uses
//     `funnel_send_log` as the idempotency ledger so it can run every
//     20 minutes forever without double-firing.

// The abandonment stage a send belongs to.
export const funnelStageEnum = pgEnum("funnel_stage", [
  "abandoned_search",
  "abandoned_wishlist",
  "abandoned_cart",
  "abandoned_payment",
]);
export type FunnelStage = (typeof funnelStageEnum.enumValues)[number];

// ---- FUNNEL STATE (one row per user, last-write-wins) ---------------
//
// Deliberately state, not events: 200k+ search events/week collapse into
// one row per active user. BigQuery keeps the full event history; this
// table only answers "where is this user in the funnel right now".
// Writers must guard on event timestamp (only advance a stage column if
// the incoming event is newer) so webhook retries and out-of-order
// deliveries cannot regress state.

export const funnelStateTable = pgTable(
  "funnel_state",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("fst")),

    /** Wander user id (= Amplitude user_id, = BQ id_user). */
    userId: t.text().notNull(),
    /** May arrive later than the first event; healed from BQ if missing. */
    email: t.text(),

    // -- Search (from `Search Started`) --
    lastSearchTs: t.timestamp({ withTimezone: true }),
    lastSearchDestination: t.text(),
    lastSearchCheckin: t.date(),
    lastSearchCheckout: t.date(),
    /** True when the last search used flexible dates (month/weekend mode). */
    lastSearchFlexible: t.boolean(),
    /** SearchTrigger from the web searchJourneyStore (manual_submit, date_change, …). */
    lastSearchTrigger: t.text(),
    /** search_id of the search the last one refined; refiners are the hot segment. */
    lastSearchParentId: t.text(),
    /** Lifetime count of ingested Search Started events (not reset per journey). */
    searchCount: t.integer().default(0).notNull(),

    // -- Wishlist (from `Product Added To Wishlist`) --
    lastWishlistTs: t.timestamp({ withTimezone: true }),
    lastWishlistProperty: t.text(),

    // -- Checkout preview (from `Checkout Previewed`) --
    // Fires on the trip-summary view, authed or not (~4.5x checkout_started
    // volume): captures users who bounce at the auth wall or at price shock
    // and never reach Checkout Started. Anonymous previews never get here
    // (no user_id at ingest).
    lastCheckoutPreviewTs: t.timestamp({ withTimezone: true }),
    lastCheckoutPreviewProperty: t.text(),
    lastCheckoutPreviewCheckin: t.date(),
    lastCheckoutPreviewCheckout: t.date(),
    lastCheckoutPreviewValue: t.doublePrecision(),

    // -- Checkout (from `Checkout Started`) --
    lastCheckoutTs: t.timestamp({ withTimezone: true }),
    lastCheckoutProperty: t.text(),
    lastCheckoutCheckin: t.date(),
    lastCheckoutCheckout: t.date(),
    lastCheckoutValue: t.doublePrecision(),

    // -- Payment (from `Payment Info Entered`) --
    lastPaymentTs: t.timestamp({ withTimezone: true }),

    // -- Payment submit (from `Payment Submit Clicked`) --
    // Submit-clicked with no purchase following usually means a failed or
    // declined payment — the hottest abandonment signal there is.
    lastPaymentSubmitTs: t.timestamp({ withTimezone: true }),

    // -- Purchase (from `Order Completed`) — the completion signal that
    //    exits a user from every abandonment stage. --
    lastPurchaseTs: t.timestamp({ withTimezone: true }),

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
    uniqueIndex("funnel_state_user_idx").on(table.userId),
    index("funnel_state_email_idx").on(table.email),
    // The sweep filters on stage timestamps; keep them indexed.
    index("funnel_state_last_search_ts_idx").on(table.lastSearchTs),
    index("funnel_state_last_wishlist_ts_idx").on(table.lastWishlistTs),
    index("funnel_state_last_checkout_preview_ts_idx").on(
      table.lastCheckoutPreviewTs,
    ),
    index("funnel_state_last_checkout_ts_idx").on(table.lastCheckoutTs),
    index("funnel_state_last_payment_ts_idx").on(table.lastPaymentTs),
  ],
);

export type FunnelState = typeof funnelStateTable.$inferSelect;
export type FunnelStateInsert = typeof funnelStateTable.$inferInsert;

// ---- FUNNEL SEND LOG (idempotency ledger) ----------------------------
//
// One row per (user, stage, abandonment episode). `windowKey` is the
// triggering event's timestamp (ISO string), so a user who abandons a
// search in July and again in September gets two sends, while 72 sweep
// runs/day never double-fire the same episode: the sweep INSERTs with
// ON CONFLICT DO NOTHING and only acts where the insert won.
// Rolling-deleted after ~90 days by the heal job.

export const funnelSendLogTable = pgTable(
  "funnel_send_log",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("fsl")),

    userId: t.text().notNull(),
    email: t.text().notNull(),
    stage: funnelStageEnum().notNull(),
    /** ISO timestamp of the event that opened this abandonment episode. */
    windowKey: t.text().notNull(),
    /** What fired it: "sweep" | "bq_heal" | "webhook_hot_path". */
    source: t.text().notNull(),
    /** Result of the downstream action: "synced" | "failed" | "skipped" | "dry_run". */
    syncStatus: t.text(),
    error: t.text(),

    sentAt: t
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    uniqueIndex("funnel_send_log_episode_idx").on(
      table.userId,
      table.stage,
      table.windowKey,
    ),
    index("funnel_send_log_sent_at_idx").on(table.sentAt),
    index("funnel_send_log_email_idx").on(table.email),
  ],
);

export type FunnelSendLog = typeof funnelSendLogTable.$inferSelect;
export type FunnelSendLogInsert = typeof funnelSendLogTable.$inferInsert;

// ---- FUNNEL DRIFT LOG (BQ vs Neon disagreements) ---------------------
//
// Written by the daily heal job whenever BigQuery's view of a user's
// funnel disagrees with `funnel_state` (webhook dropped, BQ lagged, …).
// Exists to turn "do we trust the webhook rail / do we trust BQ" into a
// measurable number instead of a vibe. Expected to be near-empty.

export const funnelDriftLogTable = pgTable(
  "funnel_drift_log",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("fdl")),

    userId: t.text().notNull(),
    email: t.text(),
    /** Which stage column disagreed (e.g. "last_search_ts"). */
    field: t.text().notNull(),
    /** What Neon had (null = row/field missing entirely). */
    neonValue: t.text(),
    /** What BigQuery had. */
    bqValue: t.text(),
    /** "healed_from_bq" | "neon_ahead" (webhook beat the export — fine) | "ignored". */
    resolution: t.text().notNull(),

    detectedAt: t
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (table) => [
    index("funnel_drift_log_user_idx").on(table.userId),
    index("funnel_drift_log_detected_at_idx").on(table.detectedAt),
  ],
);

export type FunnelDriftLog = typeof funnelDriftLogTable.$inferSelect;
export type FunnelDriftLogInsert = typeof funnelDriftLogTable.$inferInsert;
