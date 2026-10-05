/** Exact additive DDL; does not push unrelated branch schema. */
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
await db.execute(
  sql`alter table public.home add column if not exists ai_notes jsonb`,
);
console.log("Home AI notes column is ready.");
