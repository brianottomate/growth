/**
 * Exact additive DDL for wander.com homes: `home.review_count`, `home.tier`,
 * `home.management` and `home.cheapest_stay`.
 *
 * Development and production currently share one Neon database, so running
 * this script is an intentional production operation. It adds four nullable
 * columns and nothing else, which is why it exists instead of a db:push from
 * a branch: push would diff the whole schema against a database other
 * branches also shape.
 *
 *   bun --conditions=react-server scripts/apply-home-marketplace-columns.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table public.home
    add column if not exists review_count integer,
    add column if not exists tier text,
    add column if not exists management text,
    add column if not exists cheapest_stay jsonb
`);

console.log("home marketplace columns are ready.");
