/**
 * Exact additive DDL for a brand's markets.
 *
 * Development and production share one Neon database, so running this is an
 * intentional production operation. It adds one nullable column and nothing
 * else, which is why it exists instead of a db:push from a branch.
 *
 *   bun run db:apply:brand-markets
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(
  sql`alter table public.brand add column if not exists markets jsonb`,
);

console.log("brand markets are ready.");
