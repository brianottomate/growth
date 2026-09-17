/**
 * Exact additive DDL for `persona.demand_geography`.
 *
 * Development and production currently share one Neon database, so running
 * this script is an intentional production operation. It adds one nullable
 * JSONB column and nothing else, which is why it exists instead of a db:push
 * from a branch: push would diff the whole schema against a database other
 * branches also shape.
 *
 *   bun --conditions=react-server scripts/apply-persona-demand-geography.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table public.persona
    add column if not exists demand_geography jsonb
`);

console.log("persona.demand_geography is ready.");
