/**
 * Exact additive DDL for `brand.ad_previews`.
 *
 * Development and production currently share one Neon database, so running
 * this script is an intentional production operation. It adds one nullable
 * JSONB column and nothing else, which is why it exists instead of a db:push
 * from a branch: push would diff the whole schema against a database other
 * branches also shape.
 *
 *   bun --conditions=react-server scripts/apply-brand-ad-previews-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table public.brand
    add column if not exists ad_previews jsonb
`);

console.log("brand.ad_previews is ready.");
