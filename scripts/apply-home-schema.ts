/**
 * Exact additive DDL for the homes domain: `home` and `home_media`.
 *
 * Development and production currently share one Neon database, so running
 * this script is an intentional production operation. It creates two tables,
 * two enums and their indexes and nothing else, which is why it exists
 * instead of a db:push from a branch: push would diff the whole schema
 * against a database other branches also shape.
 *
 *   bun --conditions=react-server scripts/apply-home-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  do $$
  begin
    if not exists (select 1 from pg_type where typname = 'home_source') then
      create type home_source as enum ('wanderos', 'wander', 'manual');
    end if;
    if not exists (select 1 from pg_type where typname = 'home_media_role') then
      create type home_media_role as enum ('hero', 'gallery', 'excluded');
    end if;
  end
  $$;
`);

await db.execute(sql`
  create table if not exists public.home (
    id text primary key,
    brand_id text not null references public.brand(id) on delete cascade,
    source home_source not null default 'wanderos',
    external_id text not null,
    property_id text,
    url text not null,
    url_key text not null,
    name text not null,
    city text,
    state text,
    country text,
    bedrooms integer,
    bathrooms real,
    guests integer,
    rating real,
    nightly_from integer,
    hero_source_url text,
    sort_order integer,
    synced_at timestamp with time zone,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now(),
    deleted_at timestamp
  );
`);

await db.execute(sql`
  create table if not exists public.home_media (
    id text primary key,
    home_id text not null references public.home(id) on delete cascade,
    asset_id text references public.media_asset(id) on delete cascade,
    source_url text,
    thumb_url text,
    role home_media_role not null default 'gallery',
    sort_order integer,
    focal_x integer,
    focal_y integer,
    added_by text references public."user"(id) on delete set null,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
  );
`);

await db.execute(
  sql`create index if not exists home_brand_idx on public.home (brand_id);`,
);
await db.execute(
  sql`create unique index if not exists home_brand_external_idx on public.home (brand_id, external_id);`,
);
await db.execute(
  sql`create unique index if not exists home_brand_url_idx on public.home (brand_id, url_key);`,
);
await db.execute(
  sql`create index if not exists home_media_home_idx on public.home_media (home_id);`,
);
await db.execute(
  sql`create unique index if not exists home_media_asset_idx on public.home_media (home_id, asset_id) where asset_id is not null;`,
);
await db.execute(
  sql`create unique index if not exists home_media_source_idx on public.home_media (home_id, source_url) where source_url is not null;`,
);

// Both of these carry decimals off the feed: half baths, and a rating like
// 8.6. Written as integers first, so widen an existing table in place.
await db.execute(
  sql`alter table public.home alter column bathrooms type real using bathrooms::real;`,
);
await db.execute(
  sql`alter table public.home alter column rating type real using rating::real;`,
);

console.log("home and home_media are ready.");
