/**
 * Exact additive DDL for the pregen judge verdict.
 *
 * Growth is db:push-managed and that push only runs on a production build, so
 * the judge page would 500 on missing columns between merging to `dev` and the
 * next release. Applying the three columns explicitly and idempotently closes
 * that window without letting a broad push reconcile drift against the shared
 * database.
 *
 *   bun --conditions=react-server scripts/apply-pregen-verdict-schema.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

// `create type` has no `if not exists`, so the catch is the idempotency.
await db.execute(sql`
  do $$ begin
    create type leads.pregen_verdict as enum ('send_worthy', 'regenerate', 'skip');
  exception when duplicate_object then null;
  end $$
`);

await db.execute(sql`
  alter table leads.pregen_build
    add column if not exists verdict leads.pregen_verdict,
    add column if not exists verdict_at timestamp,
    add column if not exists verdict_by text
`);

await db.execute(sql`
  create index if not exists pregen_build_verdict_idx
    on leads.pregen_build (verdict)
`);

console.log("leads.pregen_build verdict columns are ready.");
