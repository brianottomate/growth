/**
 * Exact additive DDL for the pregen send-batch marker.
 *
 * Growth is db:push-managed, so additive columns are applied explicitly and
 * idempotently rather than letting a broad push reconcile drift against a
 * production database.
 *
 *   bun --conditions=react-server scripts/apply-pregen-batch-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table leads.domain
    add column if not exists pregen_batch text
`);

await db.execute(sql`
  create index if not exists lead_domain_pregen_batch_idx
    on leads.domain (pregen_batch)
`);

console.log("leads.domain.pregen_batch is ready.");
