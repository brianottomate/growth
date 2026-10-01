/**
 * Exact additive DDL for routing ideas to platforms, audience negatives, and
 * the text pools a pushed Google ad carried.
 *
 * Development and production share one Neon database, so running this is an
 * intentional production operation. Three nullable columns, nothing else.
 *
 *   bun run db:apply:ads-neutral-compile
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(
  sql`alter table public.ad add column if not exists platforms channel_platform[]`,
);
await db.execute(
  sql`alter table public.audience add column if not exists excluded_keywords jsonb`,
);
await db.execute(
  sql`alter table public.platform_ad add column if not exists copy jsonb`,
);

console.log("ads neutral compile columns are ready.");
