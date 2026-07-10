# Funnel abandonment regimen (search / wishlist / cart / payment)

Unified detection layer for marketplace abandonment, replacing "CIO is the only
brain" with a dual-rail design we own. Strategy context lives in the lifecycle
domain (`lifecycle-schema.ts`, `/app/lifecycle`); this is the operational layer.

## Why

- The abandoned-search cohort (~1,231 signed-in users/wk who search but never
  start checkout) is ~5× the abandoned-cart cohort (~231/wk) that today's whole
  AC regimen targets. Wishlist adds ~294/wk. Payment-info-no-purchase (~15/wk)
  is the hottest, smallest segment. (BQ, 7d window, verified 2026-07-09.)
- Today CIO decides *when and who* fires (delays + "did they order?" checks),
  and it's a lossy hop — the signup pipeline already bypasses it for exactly
  that reason (`/api/workflows/amplitude-user-signed-up`, ~50% loss via
  Segment→CIO). Funnel numbers (Amplitude/BQ) and CRM (Outreach) don't match.
- Wishlist-only and search-only leads have **no** batch safety net: the batch
  candidate query only reads `checkout_started`/`payment_info_entered`, and
  wishlist events aren't even in `analytics.funnel_events`.

## Architecture (dual rail)

```
Amplitude webhook destinations (per event, real time)
        │
        ▼
POST /api/workflows/amplitude-funnel-event      ← PRIMARY RAIL (this PR)
        │  ts-guarded upsert
        ▼
funnel_state (Neon, 1 row/user) ──► funnel_abandonment_sweep (cron ~20min)
        ▲                                │  window predicates + NOT-completed
        │ heal + drift log               │  anti-join funnel_send_log (ledger)
        │                                ▼
BigQuery daily reconciliation      sends: CIO event (email drip) /
(funnel_state_heal, raw Segment    processLead → Outreach (high-intent)
 export tables)                    ← TRUST RAIL
```

- **Detection is a query, not a timer.** "Abandoned search" = `last_search_ts
  BETWEEN now()-7d AND now()-1h AND last_checkout_ts IS NULL AND
  last_purchase_ts IS NULL`. The delay is a `WHERE` clause; the "did they
  complete?" check is a null-check on completion columns. No per-lead timers,
  no queue, nothing to lose on deploy.
- **`funnel_send_log` is the idempotency ledger.** Unique on
  `(user, stage, windowKey)` where windowKey = the triggering event's
  timestamp. Sweep INSERTs `ON CONFLICT DO NOTHING`, acts only where the
  insert won. A new abandonment episode (new event ts) fires again; 72 sweep
  runs/day never double-fire one episode.
- **BQ is the backstop, not the trigger.** The daily heal compares BQ's raw
  Segment export tables against `funnel_state`, backfills missed events, and
  writes every disagreement to `funnel_drift_log` — turning "do we trust the
  webhook rail" into a number. Read the **raw** tables
  (`wander_com.search_started` ∪ `react_native.search_started`, both
  `product_added_to_wishlist` tables, `funnel_events` for checkout/payment/
  purchase): the derived `analytics.funnel_events` transform is data-team-owned
  and drops event payloads (search rows there have NULL property/city/dates).

## Event sources

Tracking shape shipped in `wandercom/tracking#49` (core 0.33.0), wired by
`wandercom/wander.com` (web) and `wandercom/mobile#910` (mobile):

| Event | Key properties for us |
|---|---|
| `Search Started` | `destination`, `checkin_date`/`checkout_date` or `search_flexible`, `search_id`, `search_entrypoint`, `search_trigger`, `search_parent_id` |
| `Product Added To Wishlist` | `name` (property) |
| `Checkout Started` | `name`, `checkin_date`, `checkout_date`, `value` |
| `Payment Info Entered` | (timestamp is the signal) |
| `Order Completed` | (stage exit — clears every abandonment window) |

`search_parent_id`/`search_trigger` distinguish first-touch searches from
refinements — refiners with dates picked are the hot abandoned-search segment.

## Amplitude destination setup

Clone the existing "User Signed Up" webhook destination once per event.
Same URL for all five: `https://<growth-domain>/api/workflows/amplitude-funnel-event`.
Same `Authorization: Bearer <CUSTOMERIO_WEBHOOK_BEARER_TOKEN>` header.
Payload template (FreeMarker, adjust the properties block per event):

```json
{
  "event_name": "search_started",
  "timestamp": "${input.event_time}",
  "user_id": <user id>,
  "email": <user email>,
  "properties": {
    "destination": <event prop>,
    "checkin_date": <event prop>,
    "checkout_date": <event prop>,
    "search_flexible": <event prop>,
    "search_trigger": <event prop>,
    "search_parent_id": <event prop>
  }
}
```

Wishlist/checkout destinations send `property_name` (from the event's `name`)
and, for checkout, `checkin_date`/`checkout_date`/`value`. Unknown events are
accepted and ignored (200, `ignored_event`) so a misconfigured destination
can't retry-storm.

## Phases

- **Phase 0 (this PR — dark):** `funnel-schema.ts` (funnel_state,
  funnel_send_log, funnel_drift_log) + the ingest route. State accumulates;
  nothing sends. Destinations for checkout/payment/order/wishlist can be
  created immediately; search gets rich payloads once tracking-core 0.33.0 is
  live on wander.com.
- **Phase 1:** `funnel_abandonment_sweep` (new job in the `runGrowthWorkflow`
  registry, cron ~20 min, `dryRun` default ON) + `funnel_state_heal` (daily,
  offset from the 03:00 sync; also does rolling deletes: send_log >90d).
  Watch drift + dry-run counts for ~2 weeks.
- **Phase 2:** flip on abandoned-search email (biggest cohort, lowest stakes)
  via CIO-as-dumb-target (sweep fires a CIO Track event, CIO campaign renders
  the drip — detection has left CIO, only delivery remains). Payment hot path:
  ingest route triggers `processLead` immediately on `payment_info_entered`.
- **Phase 3:** migrate cart off the CIO workflow once dry-run counts match its
  behavior; Outreach sync for the high-intent search slice (dated search +
  refinements, or search + wishlist) — never the full 1.2k/wk cohort, which
  would flood BDR round-robin. New Outreach fields go in free slots
  `custom54–57`; add `abandoned_search`/`abandoned_wishlist` to
  `SYNC_TAG_MAPPING`/`TAG_PRIORITIES` in `outreach/field-mapping.ts`.

Until Phase 3 completes, the existing `cio-abandoned-cart` route and CIO
campaign keep running untouched — cutover is earned by drift/dry-run data.

## Ops notes

- ⚠️ `growth/.env` `DATABASE_URL` points at **prod Neon**. Schema here is
  additive; apply via the normal flow (`db:generate`/`db:migrate` or
  `db:push`) deliberately, not as a side effect of local iteration.
- The ingest upsert is ts-guarded per stage column: Amplitude retries (same
  ts) and out-of-order deliveries can't regress state. `searchCount` only
  increments when the guard passes, so retries don't inflate it.
- Identity: keyed on `user_id` (= BQ `id_user`). Anonymous searches never
  reach us (Amplitude destination sends user_id; signed-out events have none)
  — fine: every send needs an email anyway.
