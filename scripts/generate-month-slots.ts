/**
 * Expand the brand's cadence/mix targets into a month of empty calendar slots.
 *
 *   bun run scripts/generate-month-slots.ts 2026 8 [--dry]
 *
 * Idempotent top-up (see slot-generate.service): re-running only adds what the
 * targets say is missing.
 */
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { generateMonthSlots } from "@/server/services/slot-generate.service";

const [yearArg, monthArg, ...flags] = process.argv.slice(2);
const year = Number(yearArg);
const month = Number(monthArg);
const dryRun = flags.includes("--dry");
if (!year || !month || month < 1 || month > 12) {
  console.error("usage: bun run scripts/generate-month-slots.ts <year> <month 1-12> [--dry]");
  process.exit(1);
}

const brand = await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, "wander"),
});
if (!brand) throw new Error("wander brand not found");

const { rows, created } = await generateMonthSlots({
  brandId: brand.id,
  year,
  month,
  dryRun,
});

for (const r of rows)
  console.log(
    ` ${r.platform} · ${r.archetype}: target ${r.target}, existing ${r.existing} → +${r.created}`,
  );
console.log(`${dryRun ? "[dry] would create" : "created"} ${created} slots for ${year}-${String(month).padStart(2, "0")}`);
process.exit(0);
