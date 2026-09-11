/**
 * Exact additive DDL for drafting ads against a brand.
 *
 * Development and production currently share one Neon database, so running
 * this script is an intentional production operation. It drops one NOT NULL,
 * adds two columns and one enum, and nothing else, which is why it exists
 * instead of a db:push from a branch: push would diff the whole schema
 * against a database other branches also shape.
 *
 *   bun --conditions=react-server scripts/apply-ad-draft-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  do $$
  begin
    if not exists (select 1 from pg_type where typname = 'ad_status') then
      create type ad_status as enum ('drawn', 'kept', 'approved');
    end if;
  end
  $$;
`);

// An ad may now exist before a campaign does: that is what a draft is.
await db.execute(sql`alter table public.ad alter column campaign_id drop not null;`);

await db.execute(sql`
  alter table public.ad
    add column if not exists home_id text references public.home(id) on delete set null
`);
await db.execute(sql`
  alter table public.ad
    add column if not exists status ad_status not null default 'drawn'
`);

// Every ad that already exists was built inside a campaign, so it is past
// being a draft; calling them all "drawn" would lose that.
await db.execute(sql`
  update public.ad set status = 'approved'
  where campaign_id is not null and status = 'drawn'
`);

await db.execute(sql`create index if not exists ad_home_idx on public.ad (home_id);`);

console.log("ad drafts are ready.");
