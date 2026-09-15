/**
 * Add `fee_paid_at` and `media_paid_at` to `performance_cycle`. Purely
 * additive and idempotent. Exists so the columns are in place before the
 * release that reads them deploys, without relying on the production build's
 * schema push (see reference: growth prod schema push race).
 *
 * Development and production share one Neon database, so this is a
 * production operation.
 *
 *   bun --conditions=react-server scripts/apply-cycle-paid-columns.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table public.performance_cycle
    add column if not exists fee_paid_at timestamp with time zone,
    add column if not exists media_paid_at timestamp with time zone
`);

const columns = await db.execute<{ column_name: string }>(sql`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'performance_cycle'
    and column_name in ('fee_paid_at', 'media_paid_at')
  order by column_name
`);
console.log(
  columns.rows.map((row) => row.column_name).join(", ") || "no columns added",
);
