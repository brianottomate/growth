/**
 * Exact additive DDL for per-brand Google Ads accounts under Wander's MCC.
 *
 * Development and production share one Neon database, so running this is an
 * intentional production operation. Re-running it is safe.
 *
 *   bun run db:apply:google-brand-accounts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(
  sql`alter table public.ad_account add column if not exists manager_external_id text`,
);
await db.execute(
  sql`alter table public.ad_account add column if not exists created_by_us boolean not null default false`,
);
await db.execute(
  sql`alter table public.conversion_mapping add column if not exists ad_account_id text`,
);
await db.execute(sql`
  do $$ begin
    alter table public.conversion_mapping
      add constraint conversion_mapping_ad_account_id_ad_account_id_fk
      foreign key (ad_account_id) references public.ad_account(id) on delete set null;
  exception when duplicate_object then null;
  end $$
`);
await db.execute(
  sql`alter table public.conversion_mapping add column if not exists external_resource_name text`,
);

console.log("google brand account columns are ready.");
process.exit(0);
