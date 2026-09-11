/**
 * Exact additive DDL for the `launch` table and the three child FKs.
 *
 * Development and production currently share one Neon database, so running
 * this is an intentional production operation. It only creates a table and
 * adds three nullable columns, which is why it exists instead of a db:push
 * from a branch: push diffs the WHOLE schema against a database other
 * branches also shape.
 *
 *   bun --conditions=react-server scripts/apply-launch-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  create table if not exists public.launch (
    id text primary key,
    organization_id text not null references public.organization(id) on delete cascade,
    product_id text not null references public.product(id) on delete cascade,
    name text not null,
    slug text not null,
    tier integer not null default 3,
    target_date date,
    maturity text not null default 'ga',
    status text not null default 'draft',
    marketing_owner_id text references public."user"(id) on delete set null,
    release_theme text,
    brief jsonb not null default '{}'::jsonb,
    deliverables jsonb not null default '[]'::jsonb,
    source_url text,
    shipped_at timestamp with time zone,
    created_by_id text references public."user"(id) on delete set null,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now(),
    deleted_at timestamp
  )
`);

await db.execute(
  sql`create index if not exists launch_org_idx on public.launch (organization_id)`,
);
await db.execute(
  sql`create index if not exists launch_product_idx on public.launch (product_id)`,
);
await db.execute(
  sql`create index if not exists launch_status_idx on public.launch (status)`,
);
await db.execute(
  sql`create index if not exists launch_target_date_idx on public.launch (target_date)`,
);
await db.execute(sql`
  create unique index if not exists launch_org_slug_active_idx
    on public.launch (organization_id, slug)
    where deleted_at is null
`);

// Children point at the launch, so one launch can carry several series across
// several brands without the launch holding arrays of ids.
for (const table of ["content_post", "series", "campaign"] as const) {
  await db.execute(
    sql`alter table public.${sql.raw(table)}
      add column if not exists launch_id text references public.launch(id) on delete set null`,
  );
  await db.execute(
    sql`create index if not exists ${sql.raw(`${table}_launch_idx`)}
      on public.${sql.raw(table)} (launch_id)`,
  );
}

console.log("launch table and child launch_id columns are ready.");
