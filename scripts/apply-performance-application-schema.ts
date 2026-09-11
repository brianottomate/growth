/**
 * Exact additive DDL for `performance_application`.
 *
 * Development and production currently share one Neon database, so running
 * this script is an intentional production operation. It creates one new table
 * and its index and touches nothing else, which is why it exists instead of a
 * db:push from a branch.
 *
 *   bun --conditions=react-server scripts/apply-performance-application-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  create table if not exists performance_application (
    id text primary key,
    email text not null,
    name text,
    website_url text,
    property_count integer,
    markets_today text,
    monthly_spend text,
    source text not null,
    query_params text,
    created_at timestamptz not null default now()
  )
`);

await db.execute(sql`
  create index if not exists performance_application_created_idx
    on performance_application (created_at)
`);

const columns = await db.execute(sql`
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'performance_application'
  order by ordinal_position
`);

console.log("performance_application:");
console.table((columns as unknown as { rows: unknown[] }).rows ?? columns);
process.exit(0);
