/**
 * Add `featured`, the listing-detail cache (`amenities`, `description`) and
 * the catalog card overrides to `home`. Additive and idempotent. Exists so the
 * columns are in place before the release that reads them deploys, without
 * relying on the production build's schema push (see reference: growth prod
 * schema push race).
 *
 * Until these columns, a home had a row only once someone picked it, so every
 * existing row is a featured home. The backfill runs only on the run that
 * adds the column; after that `featured` is the operator's to change.
 *
 * Development and production share one Neon database, so this is a
 * production operation.
 *
 *   bun --conditions=react-server scripts/apply-home-catalog-columns.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

const existing = await db.execute<{ column_name: string }>(sql`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'home'
    and column_name = 'featured'
`);

await db.execute(sql`
  alter table public.home
    add column if not exists featured boolean not null default false,
    add column if not exists amenities jsonb,
    add column if not exists description text,
    add column if not exists catalog_title text,
    add column if not exists catalog_subtitle text,
    add column if not exists catalog_template_id text,
    add column if not exists catalog_image_position text,
    add column if not exists catalog_show_logo boolean,
    add column if not exists catalog_image_asset_id text,
    add column if not exists catalog_mode text,
    add column if not exists catalog_finished_asset_id text,
    add column if not exists catalog_excluded boolean not null default false
`);

const finishedFk = await db.execute(sql`
  select 1 from pg_constraint
  where conname = 'home_catalog_finished_asset_id_media_asset_id_fk'
`);
if (finishedFk.rows.length === 0)
  await db.execute(sql`
    alter table public.home
      add constraint home_catalog_finished_asset_id_media_asset_id_fk
      foreign key (catalog_finished_asset_id) references public.media_asset(id)
      on delete set null
  `);

if (existing.rows.length === 0) {
  await db.execute(sql`update public.home set featured = true`);
  await db.execute(sql`
    alter table public.home
      add constraint home_catalog_image_asset_id_media_asset_id_fk
      foreign key (catalog_image_asset_id) references public.media_asset(id)
      on delete set null
  `);
}

const columns = await db.execute<{ column_name: string }>(sql`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'home'
    and (column_name like 'catalog_%'
      or column_name in ('featured', 'amenities', 'description'))
  order by column_name
`);
console.log(columns.rows.map((row) => row.column_name).join(", "));
