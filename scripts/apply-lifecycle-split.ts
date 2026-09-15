/**
 * Split `brand.performance_stage` into `business_stage` + `delivery_stage`.
 *
 * Additive and idempotent: creates the two enums and four columns if missing,
 * then fills them from the old column for rows that have nothing yet. The old
 * column and enum are NOT dropped here; the schema no longer declares them, so
 * the production build's `drizzle-kit push` removes them when the code that
 * reads the new columns deploys. Run this first, then publish the release.
 *
 * Development and production share one Neon database, so this is a
 * production operation.
 *
 *   bun --conditions=react-server scripts/apply-lifecycle-split.ts
 */
import { sql } from "drizzle-orm";

import {
  BUSINESS_STAGES,
  DELIVERY_STAGES,
  LEGACY_SPLIT,
  LEGACY_STAGES,
} from "@/lib/performance-stage";
import { db } from "@/server/db";

const enumValues = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

await db.execute(sql`
  do $$ begin
    if not exists (select 1 from pg_type where typname = 'business_stage') then
      create type public.business_stage as enum (${enumValues(BUSINESS_STAGES)});
    end if;
    if not exists (select 1 from pg_type where typname = 'delivery_stage') then
      create type public.delivery_stage as enum (${enumValues(DELIVERY_STAGES)});
    end if;
  end $$
`);

await db.execute(sql`
  alter table public.brand
    add column if not exists business_stage public.business_stage,
    add column if not exists business_stage_at timestamp with time zone,
    add column if not exists delivery_stage public.delivery_stage,
    add column if not exists delivery_stage_at timestamp with time zone
`);

const hasLegacy = await db.execute<{ present: boolean }>(sql`
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brand' and column_name = 'performance_stage'
  ) as present
`);

if (hasLegacy.rows[0]?.present) {
  const businessCase = sql.join(
    LEGACY_STAGES.map(
      (stage) =>
        sql`when ${stage} then ${LEGACY_SPLIT[stage].business}::public.business_stage`,
    ),
    sql` `,
  );
  const deliveryCase = sql.join(
    LEGACY_STAGES.map(
      (stage) =>
        sql`when ${stage} then ${LEGACY_SPLIT[stage].delivery}::public.delivery_stage`,
    ),
    sql` `,
  );
  const result = await db.execute(sql`
    update public.brand
    set
      business_stage = case performance_stage::text ${businessCase} end,
      business_stage_at = performance_stage_at,
      delivery_stage = case performance_stage::text ${deliveryCase} end,
      delivery_stage_at = performance_stage_at
    where performance_stage is not null
      and business_stage is null
      and delivery_stage is null
  `);
  console.log(
    `remapped ${result.rowCount ?? 0} brand(s) from performance_stage`,
  );
} else {
  console.log("performance_stage already gone; nothing to remap");
}

const after = await db.execute<{
  name: string;
  business_stage: string | null;
  delivery_stage: string | null;
}>(sql`
  select name, business_stage, delivery_stage
  from public.brand
  where deleted_at is null and (business_stage is not null or relationship in ('client', 'prospect'))
  order by business_stage, name
`);
console.table(after.rows);
