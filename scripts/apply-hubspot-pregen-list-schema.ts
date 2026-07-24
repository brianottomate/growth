/**
 * Exact additive DDL for the pregen HubSpot-list projection.
 *
 * Growth is still db:push-managed and the configured Neon MCP project is not
 * the database used by this runtime. Keep this operation explicit and
 * idempotent instead of allowing a broad interactive push to reconcile drift.
 *
 *   bun --conditions=react-server scripts/apply-hubspot-pregen-list-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table leads.contact
    add column if not exists hubspot_contact_id text
`);

await db.execute(sql`
  create index if not exists lead_contact_hubspot_idx
    on leads.contact (hubspot_contact_id)
`);

await db.execute(sql`
  create table if not exists leads.hubspot_list_membership (
    id text primary key,
    list_id text not null,
    list_name text not null,
    object_type text not null,
    object_id text not null,
    cohort text not null,
    domain_id text references leads.domain(id) on delete set null,
    contact_id text references leads.contact(id) on delete set null,
    imported_at timestamp default now() not null,
    updated_at timestamp default now() not null,
    constraint hubspot_list_membership_list_object_idx
      unique (list_id, object_id)
  )
`);

await db.execute(sql`
  create index if not exists hubspot_list_membership_domain_idx
    on leads.hubspot_list_membership (domain_id)
`);

await db.execute(sql`
  create index if not exists hubspot_list_membership_contact_idx
    on leads.hubspot_list_membership (contact_id)
`);

await db.execute(sql`
  create index if not exists hubspot_list_membership_cohort_type_idx
    on leads.hubspot_list_membership (cohort, object_type)
`);

console.log("HubSpot pregen list schema is ready.");
