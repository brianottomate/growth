# CIO Abandoned Cart Workflow Endpoint

HTTP endpoint called by Customer.io's "Abandoned cart rebuild" workflow via HTTP Request actions. CIO handles all branching, delays, and lead qualification — this endpoint receives qualified leads and syncs them to Outreach.

## Architecture

```
CIO "Abandoned cart rebuild" workflow
  │
  ├─ 1hr delay
  ├─ Order completed? → YES → Exit
  ├─ Connected with demand sales? → YES → Exit
  │
  ├─ Hot lead (2+ checkouts in 5 days)
  │   ├─ Past booker → HTTP POST → this endpoint
  │   └─ Never booked → HTTP POST → this endpoint
  │
  ├─ 1st abandoned checkout → 7-email drip
  │   └─ HTTP POST → this endpoint (before drip)
  │
  └─ Repeat abandoner (2+ all-time)
      ├─ Past booker → 4-email drip + HTTP POST
      └─ Never booked → 4-email drip + HTTP POST
```

The HTTP Request action can be placed at any point in the workflow where you want to trigger the Outreach sync. CIO decides **when** and **who** — this endpoint handles the **what** (sync to Outreach, assign BDR).

## Endpoint

```
POST /api/workflows/cio-abandoned-cart
```

### Authentication

Bearer token in the `Authorization` header. The token must match `CUSTOMERIO_WEBHOOK_BEARER_TOKEN` in Vercel env vars.

```
Authorization: Bearer <CUSTOMERIO_WEBHOOK_BEARER_TOKEN>
```

### Request Body

JSON payload with Liquid-templated customer data from CIO. Only `email` is required — everything else enriches the sync.

```json
{
  "email": "{{customer.email}}",
  "event_type": "abandoned_cart",
  "workflow_step": "hot_lead_previous_booker",
  "first_name": "{{customer.first_name}}",
  "last_name": "{{customer.last_name}}",
  "phone": "{{customer.phone}}",
  "property_name": "{{customer.last_checkout_started_property_name}}",
  "cio_customer_id": "{{customer.id}}"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `email` | Yes | Customer email — used to look up/create Outreach prospect |
| `event_type` | No | Defaults to `"abandoned_cart"`. Passed to sync pipeline for field mapping |
| `workflow_step` | No | Which CIO branch fired (e.g. `hot_lead_previous_booker`, `first_checkout_email_1`). Useful for logging |
| `first_name` | No | Enriches Outreach prospect if not already known |
| `last_name` | No | Enriches Outreach prospect if not already known |
| `phone` | No | Enriches Outreach prospect; also affects BDR assignment (phone vs no-phone pools) |
| `property_name` | No | Last checkout property — mapped to Outreach custom fields |
| `cio_customer_id` | No | CIO internal ID for debugging |

### Response

Returns `200 OK` immediately. Processing happens in the background via `waitUntil()`.

```json
{
  "success": true,
  "email": "user@example.com",
  "eventType": "abandoned_cart",
  "message": "Processing in background"
}
```

### Health Check

```
GET /api/workflows/cio-abandoned-cart
```

Returns service status and timestamp.

## What the Sync Pipeline Does

When this endpoint is called, `processLead()` runs in the background:

1. **Fetch lead data** — Parallel calls to BigQuery, Customer.io, and Minerva (enrichment)
2. **Enrich phone** — Backfill from Minerva if missing
3. **Check Outreach** — Search for existing prospect by email
4. **Assign BDR** — Preserve existing Outreach owner, or round-robin from load-balanced pool
5. **Create/update Outreach prospect** — 30+ field mapping with stage assignment
6. **Write back to CIO** — Update BDR assignment attributes for parity

## CIO HTTP Request Action Setup

In the Customer.io workflow editor, add an HTTP Request action:

1. **Method**: POST
2. **URL**: `https://<your-vercel-domain>/api/workflows/cio-abandoned-cart`
3. **Headers**:
   - `Content-Type: application/json`
   - `Authorization: Bearer <your-token>`
4. **Body**: Use the JSON template above with Liquid variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CUSTOMERIO_WEBHOOK_BEARER_TOKEN` | Yes | Shared secret for bearer auth |
| `CUSTOMERIO_WEBHOOK_SECRET` | Yes | HMAC secret (for CIO reporting webhooks, not used by this route) |
| `CUSTOMER_IO_APP_KEY` | Yes | CIO App API key (read customer data) |
| `CUSTOMER_IO_SITE_ID` | Yes | CIO Track API site ID |
| `CUSTOMER_IO_API_KEY` | Yes | CIO Track API key (write-back BDR assignment) |
| `BIGQUERY_PROJECT_ID` | Yes | For lead data enrichment |

## Verification After Deploy

1. Hit the health check: `GET /api/workflows/cio-abandoned-cart` — should return `{"status": "ok"}`
2. Add the HTTP Request action to one branch in the CIO workflow
3. Trigger with a known test email
4. Check Vercel logs for `[CIO Workflow] Received:` and `[CIO Workflow] Sync result:`
5. Verify prospect was created/updated in Outreach
6. Roll out to remaining branches
