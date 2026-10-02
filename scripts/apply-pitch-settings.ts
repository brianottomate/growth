/** Exact additive migration. The old column stays until the new production schema is deployed. */
import { sql } from "drizzle-orm";
import { withTransaction } from "@/server/db";
import { brandPitchTable } from "@/server/db/schema";
import { pitchFieldsSchema, pitchOverrides } from "@/lib/pitch-settings";

await withTransaction(async (tx) => {
  await tx.execute(sql`create table if not exists public.brand_pitch (
    brand_id text primary key references public.brand(id) on delete cascade,
    overrides jsonb not null default '{}'::jsonb,
    revision integer not null default 1 constraint brand_pitch_revision_positive check (revision > 0),
    updated_at timestamptz not null default now(),
    updated_by text references public."user"(id) on delete set null
  )`);
  const column = await tx.execute(
    sql`select 1 from information_schema.columns where table_schema='public' and table_name='brand' and column_name='pitch_settings'`,
  );
  if (column.rows.length) {
    const legacy = await tx.execute(
      sql`select id, pitch_settings from public.brand where pitch_settings is not null`,
    );
    for (const row of legacy.rows) {
      const settings = row.pitch_settings as Record<string, unknown>;
      // Invalid historical configs stop migration instead of silently losing data.
      const overrides = pitchOverrides(pitchFieldsSchema.parse(settings));
      const revision =
        typeof settings.revision === "number" ? settings.revision : 1;
      await tx
        .insert(brandPitchTable)
        .values({
          brandId: String(row.id),
          overrides,
          revision,
          updatedAt:
            typeof settings.updatedAt === "string"
              ? new Date(settings.updatedAt)
              : new Date(),
          updatedBy:
            typeof settings.updatedBy === "string" ? settings.updatedBy : null,
        })
        .onConflictDoNothing();
    }
    console.log(
      `Migrated ${legacy.rows.length} legacy pitch records without overwriting existing rows.`,
    );
  }
});
console.log("brand_pitch is ready; sparse overrides preserved.");
process.exit(0);
