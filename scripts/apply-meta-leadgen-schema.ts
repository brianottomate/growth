/**
 * Exact additive DDL for `leads.meta_leadgen_lead`.
 *
 * Development and production share one Neon database, so running this is an
 * intentional production operation. It only creates a table.
 *
 *   bun run db:apply:meta-leadgen
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  create table if not exists leads.meta_leadgen_lead (
    id text primary key,
    leadgen_id text not null,
    page_id text not null,
    form_id text,
    form_name text,
    ad_id text,
    campaign_name text,
    received_via text not null,
    lead_created_at timestamp,
    field_data jsonb,
    email text,
    units integer,
    qualified boolean,
    capi_sent_at timestamp,
    routed_at timestamp,
    last_error text,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
  )
`);
await db.execute(sql`
  create unique index if not exists meta_leadgen_lead_leadgen_id_idx
    on leads.meta_leadgen_lead (leadgen_id)
`);
await db.execute(sql`
  create index if not exists meta_leadgen_lead_form_idx
    on leads.meta_leadgen_lead (form_id)
`);
await db.execute(sql`
  create index if not exists meta_leadgen_lead_created_idx
    on leads.meta_leadgen_lead (created_at)
`);

console.log("leads.meta_leadgen_lead is in place");
process.exit(0);
