/**
 * Exact additive DDL for the full HubSpot company snapshot + webhook mirror.
 *
 * Development and production currently share one Neon database, so this is an
 * intentional production operation. It is idempotent and additive; do not
 * replace it with a broad unattended `drizzle-kit push`.
 *
 *   bun --conditions=react-server scripts/apply-hubspot-company-sync-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table leads.domain
    add column if not exists hubspot_synced_at timestamp
`);

await db.execute(sql`
  alter table leads.domain
    add column if not exists hubspot_last_modified_at timestamp
`);

await db.execute(sql`
  create index if not exists lead_domain_hubspot_record_idx
    on leads.domain (hubspot_record_id)
`);

await db.execute(sql`
  create index if not exists lead_domain_hubspot_freshness_idx
    on leads.domain (hubspot_synced_at)
    where in_hubspot = true
`);

console.log("HubSpot company sync schema is ready.");
