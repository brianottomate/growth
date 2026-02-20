# Growth Platform: CIO → Outreach Sync

## Status: Building Blocks Phase

**Date**: Feb 16, 2026

---

## What We Did Today

### 1. Explored both codebases

- Mapped the full Python `wander-growth-api` architecture (50+ routes, 18 cron jobs, 175K+ leads)
- Mapped the TypeScript `playground` — has Outreach auth/read but zero CIO integration

### 2. Built the Customer.io client (`customerio.client.ts`)

- **Read**: `getCustomerByEmail()`, `getCustomerAttributes()`, `getCustomerActivities()`
- **Write**: `identifyCustomer()`, `updateCustomerAttributes()`, `updateBdrAssignment()`, `trackEvent()`
- **Relationships**: `addBdrRelationship()`, `addRelationship()`, `removeRelationship()` (Entity API v2)
- **Webhook**: `verifyWebhookSignature()` — HMAC-SHA256 with constant-time comparison
- **Broadcast**: `triggerBroadcast()`
- Uses `customerio-node@4.2.0` SDK (TrackClient + APIClient) + raw fetch for Entity API

### 3. Stubbed out supporting clients

- `bigquery.client.ts` — lead data enrichment (primary source in Python pipeline)
- `minerva.client.ts` — phone/location/income enrichment (last-resort fallback)
- `sanity.client.ts` — BDR team config + round-robin assignment

### 4. Updated env.ts

Added env vars for Customer.io, BigQuery, Minerva, Sanity

### 5. Confirmed MCP access to Customer.io

- Can query workspaces: Wander (142511), WanderOS, External, Wander Sites
- Found the "Abandoned cart rebuild" campaign (ID: 129) — complex branching workflow with hot lead detection, SMS/email drips, Slack notifications

---

## Architecture Decision: Vercel + Neon

| Layer    | Choice                         | Why                                                   |
| -------- | ------------------------------ | ----------------------------------------------------- |
| Compute  | Vercel Pro + Fluid Compute     | 15min execution, `waitUntil()`, already deployed here |
| Database | Neon PostgreSQL                | Already using, Drizzle ORM, branching for previews    |
| Cron     | Vercel Cron                    | Pro plan, every-minute granularity                    |
| Queues   | Not yet (QStash/Inngest later) | Backfill cron catches failures for now                |
| Storage  | Cloudflare R2                  | Org-wide, already in use                              |

---

## Next Steps

### Tier 1 — The Webhook Pipeline (core value)

- [ ] **`POST /api/workflows/cio-abandoned-cart` route** — HMAC validation → 200 OK → `waitUntil(processLead())`
- [ ] **Outreach write methods** — `createProspect()`, `updateProspect()`, `searchByEmail()` in `outreach.client.ts`
- [ ] **Field mapper** — CIO attributes → Outreach prospect fields (30+ custom fields)
- [ ] **Sync event DB table** — `sync_events` in Drizzle schema for audit trail
- [ ] **Compose the sync flow** — Kristian wants to compose this himself, building blocks are ready

### Tier 2 — Cron Jobs

- [ ] Daily comprehensive sync (port from Python's 3 AM job)
- [ ] Backfill sync (catch `late_sync` / `never_synced`)
- [ ] Orphaned event cleanup

### Tier 3 — Enrichment & BDR

- [ ] Implement BigQuery client (rich lead data — booking history, activity counts)
- [ ] Implement Sanity client (BDR config for round-robin)
- [ ] Implement Minerva client (phone/location/income enrichment)
- [ ] BDR assignment service with DB-backed round-robin state

### Tier 4 — Future

- [ ] HubSpot client (CRM integration)
- [ ] Wander Sites contacts database (100K+ property management contacts)

---

## Key Reference Files

| What                     | Where                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Python webhook pipeline  | `wander-growth-api/app/routes/outreach_realtime_sync.py`                           |
| Python CIO client        | `wander-growth-api/app/services/CustomerIO/customer_client.py`                     |
| Python cron jobs         | `wander-growth-api/app/cron/jobs.py`                                               |
| Python field mapper      | `wander-growth-api/app/services/Outreach/field_data_mapper.py`                     |
| Python sync orchestrator | `wander-growth-api/app/services/Outreach/sync/services/processing_orchestrator.py` |
| TS Outreach client       | `playground/src/server/clients/outreach.client.ts`                                 |
| TS CIO client (new)      | `playground/src/server/clients/customerio.client.ts`                               |
| CIO MCP workspace ID     | `142511` (Wander)                                                                  |
| Abandoned cart campaign  | CIO campaign ID `129`                                                              |
