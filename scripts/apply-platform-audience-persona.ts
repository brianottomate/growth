/**
 * Exact additive DDL for `platform_audience.persona_id`.
 *
 * Development and production share one Neon database, so running this is an
 * intentional production operation. Run it AFTER the PR merges to dev: a
 * release built from a dev without the column would drop it again on its
 * `drizzle-kit push --force`.
 *
 *   bun --conditions=react-server scripts/apply-platform-audience-persona.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table public.platform_audience
    add column if not exists persona_id text
      references public.persona(id) on delete set null
`);
await db.execute(sql`
  create index if not exists platform_audience_persona_idx
    on public.platform_audience (persona_id)
`);

console.log("platform_audience.persona_id is ready.");
