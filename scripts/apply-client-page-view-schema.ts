/** Exact additive DDL. No unrelated schema push or existing pregen data changes. */
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
await db.execute(sql`
create table if not exists public.client_page_view (
  id text primary key,
  brand_id text not null references public.brand(id) on delete cascade,
  surface text not null,
  visit_id uuid not null,
  viewed_at timestamptz not null default now(),
  constraint client_page_view_surface_check check (surface in ('pitch','intake','social_connect','email_dns'))
)`);
await db.execute(
  sql`create unique index if not exists client_page_view_session_idx on public.client_page_view(brand_id,surface,visit_id)`,
);
await db.execute(
  sql`create index if not exists client_page_view_brand_idx on public.client_page_view(brand_id,viewed_at)`,
);
console.log("client page view schema ready");
