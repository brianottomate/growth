/**
 * Exact additive DDL for `brand.performance_settings`.
 *
 * Development and production currently share one Neon database, so running
 * this script is an intentional production operation. It renames the
 * short-lived `performance_tracker` column when that is what exists, and
 * otherwise adds `performance_settings`; either way it ends with one nullable
 * JSONB column and touches nothing else, which is why it exists instead of a
 * db:push from a branch.
 *
 *   bun --conditions=react-server scripts/apply-performance-settings-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  do $$
  begin
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'brand'
        and column_name = 'performance_tracker'
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'brand'
        and column_name = 'performance_settings'
    ) then
      alter table public.brand rename column performance_tracker to performance_settings;
    end if;
    alter table public.brand add column if not exists performance_settings jsonb;
  end
  $$
`);

console.log("brand.performance_settings is ready.");
