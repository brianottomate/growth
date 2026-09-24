/**
 * Exact additive DDL for `brand.story`.
 *
 * Development and production currently share one Neon database, so running
 * this script is an intentional production operation. It adds one nullable
 * text column and nothing else.
 *
 *   bun --conditions=react-server scripts/apply-brand-story.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table public.brand
    add column if not exists story text
`);

console.log("brand.story is ready.");
process.exit(0);
