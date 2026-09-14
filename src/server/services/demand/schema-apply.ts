/**
 * Exact additive DDL for `demand_crm_link` (src/server/db/demand-schema.ts).
 *
 * Production builds create the table via `drizzle-kit push`; before the
 * first release, and on preview deployments (which never push schema), it
 * has to be created explicitly. Idempotent and additive, so it is safe to
 * run from the apply script or the lab harness any number of times.
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

export async function demandCrmLinkTableExists(): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(sql`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'demand_crm_link'
    ) as "exists"
  `);
  return rows.rows[0]?.exists === true;
}

export async function applyDemandCrmLinkSchema(): Promise<void> {
  await db.execute(sql`
    create table if not exists demand_crm_link (
      id text primary key,
      email text not null,
      user_id text,
      hubspot_contact_id text,
      last_event_type text,
      last_synced_at timestamp with time zone,
      last_error text,
      attempt_count integer not null default 0,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now()
    )
  `);
  await db.execute(sql`
    create unique index if not exists demand_crm_link_email_idx
      on demand_crm_link (email)
  `);
  await db.execute(sql`
    create index if not exists demand_crm_link_hubspot_contact_idx
      on demand_crm_link (hubspot_contact_id)
  `);
  await db.execute(sql`
    create index if not exists demand_crm_link_user_idx
      on demand_crm_link (user_id)
  `);
}
