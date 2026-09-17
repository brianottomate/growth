/**
 * Exact additive DDL for `home.gallery_cache`.
 *
 * Development and production currently share one Neon database, so running
 * this script is an intentional production operation. It adds one nullable
 * JSONB column and nothing else, which is why it exists instead of a db:push
 * from a branch: push would diff the whole schema against a database other
 * branches also shape.
 *
 *   bun --conditions=react-server scripts/apply-home-gallery-cache.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table public.home
    add column if not exists gallery_cache jsonb
`);

console.log("home.gallery_cache is ready.");
