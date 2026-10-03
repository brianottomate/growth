/** Additive only; shared dev/prod DB. Existing assets remain approved. */
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

await db.execute(sql`do $$ begin
  create type public.media_review_status as enum ('suggested', 'approved', 'rejected');
exception when duplicate_object then null; end $$`);
await db.execute(sql`alter table public.media_asset
  add column if not exists review_status public.media_review_status not null default 'approved',
  add column if not exists discovered_source_url text`);
await db.execute(sql`create unique index if not exists media_asset_discovered_source_idx
  on public.media_asset (brand_id, discovered_source_url)`);
// Restore scrape provenance if an older deployment removed the new columns.
await db.execute(sql`update public.media_asset set
  discovered_source_url = metadata->>'sourceUrl',
  review_status = case
    when metadata ? 'rejectedAt' then 'rejected'::public.media_review_status
    when metadata ? 'approvedAt' then 'approved'::public.media_review_status
    else 'suggested'::public.media_review_status end
  where metadata->>'source' = 'firecrawl'
    and discovered_source_url is null
    and metadata->>'sourceUrl' is not null`);
console.log("Media review schema ready; existing assets remain approved.");
process.exit(0);
