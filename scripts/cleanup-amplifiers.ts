/**
 * cleanup-amplifiers.ts — remove the AI-generated "role bucket" amplifiers that
 * the moment-planner seeded (e.g. "Existing Investors (Series A & B)",
 * "Luxury Travel Creators (1M+ reach)"). These aren't real people/accounts, so
 * handle-discovery can never resolve them — they belong as copy suggestions, not
 * rolodex rows. Real named contacts (e.g. "Daniel Ternyak") are kept.
 *
 *   bun --conditions react-server scripts/cleanup-amplifiers.ts            # dry run
 *   bun --conditions react-server scripts/cleanup-amplifiers.ts --commit   # delete
 *
 * Heuristic for "role bucket": the name has parentheses / slashes, or contains a
 * generic role word (investors, creators, press, partners, team, founders…).
 */
import { inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { amplifierTable } from "@/server/db/schema";

const ROLE_WORDS =
  /\b(investors?|creators?|press|partners?|team|founders?|executives?|users?|travelers?|tastemakers?)\b/i;

function isRoleBucket(name: string): boolean {
  return /[()/]/.test(name) || ROLE_WORDS.test(name);
}

async function main() {
  const commit = process.argv.includes("--commit");
  const all = await db.select().from(amplifierTable);

  const buckets = all.filter((a) => isRoleBucket(a.name));
  const keepers = all.filter((a) => !isRoleBucket(a.name));

  console.log(`\nTotal amplifiers: ${all.length}`);
  console.log(`\nKEEP (${keepers.length}):`);
  for (const a of keepers) console.log(`  ✓ ${a.name} [${a.type ?? "—"}]`);
  console.log(`\nDELETE (${buckets.length}):`);
  for (const a of buckets) console.log(`  ✗ ${a.name} [${a.type ?? "—"}]`);

  if (!commit) {
    console.log(
      `\nDry run — pass --commit to delete the ${buckets.length} bucket rows.\n`,
    );
    return;
  }
  if (buckets.length === 0) {
    console.log(`\nNothing to delete.\n`);
    return;
  }

  await db.delete(amplifierTable).where(
    inArray(
      amplifierTable.id,
      buckets.map((a) => a.id),
    ),
  );
  console.log(
    `\nDeleted ${buckets.length} role-bucket amplifiers (targets cascade).\n`,
  );
}

await main();
process.exit(0);
