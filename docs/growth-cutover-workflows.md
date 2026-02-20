# Growth API Cutover: Priority Workflows

## Scope

The `wander-growth-api` shutdown path is now focused on four workflows in `playground`:

1. `daily_comprehensive_sync`
2. `outreach_auto_healing`
3. `bdr_alignment_backfill` (round-robin for unassigned leads)
4. Customer.io abandoned-cart webhook (`checkout_started` path)

## Current Primitive Layer in Playground

### Already in place

- `src/server/services/sync.service.ts`
  - Core lead primitive: `processLead({ email, eventType, eventData })`
  - Handles BQ enrichment, CIO fallback, Outreach upsert, CIO BDR writeback
- `src/server/services/outreach/bdr-assignment.service.ts`
  - Round-robin assignment primitive
- `src/app/api/workflows/cio-abandoned-cart/route.ts`
  - CIO webhook ingress + signature verification + `waitUntil(processLead())`

### Added in this pass

- `src/server/clients/bigquery.client.ts`
  - `fetchRecentSyncCandidates()`
  - `fetchUnassignedBdrCandidates()`
- `src/server/services/growth-workflows.service.ts`
  - Workflow composer for:
    - `daily_comprehensive_sync`
    - `outreach_auto_healing`
    - `bdr_alignment_backfill`
- `src/app/api/cron/growth/route.ts`
  - Secure cron trigger endpoint for the three workflows
  - Uses `ADMIN_TOKEN` auth (`Authorization: Bearer <token>`)

## Runtime Entry Points

### 1) Abandoned cart / realtime ingestion

- `POST /api/workflows/cio-abandoned-cart`
- Expected event type: `checkout_started`
- Behavior: acknowledge fast, process async

### 2) Scheduled workflows

- `GET /api/cron/growth?job=daily_comprehensive_sync`
- `GET /api/cron/growth?job=outreach_auto_healing`
- `GET /api/cron/growth?job=bdr_alignment_backfill`

Common query params:

- `dryRun=true|false`
- `limit=<n>`
- `hoursBack=<n>`
- `concurrency=<n>`

## What This Gives You

- Strong primitive boundary: lead processing is centralized in `processLead`
- Workflow composition lives separately from transport (webhook vs cron)
- No dependency on Python cron scheduler for the priority jobs

## Known Gaps (next hardening)

- BDR roster is still hardcoded; migrate to Sanity/DB-backed source of truth
- Round-robin state is in-memory; persist for multi-instance fairness
- Add durable `sync_events` audit table for replay/reconciliation visibility
- Add idempotency key handling for webhook retries
