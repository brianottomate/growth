/**
 * Exact additive DDL for signing catalog cards off.
 *
 * Development and production share one Neon database, so running this is an
 * intentional production operation. It adds one nullable column and nothing
 * else, which is why it exists instead of a db:push from a branch.
 *
 *   bun run db:apply:catalog-approval
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(
  sql`alter table public.home add column if not exists catalog_approval jsonb`,
);

console.log("catalog approval is ready.");
