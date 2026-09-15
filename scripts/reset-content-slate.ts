/**
 * Clear the content *planning* slate so a new operator meets an empty desk
 * instead of someone else's half-finished month.
 *
 * What this deliberately does NOT touch: the 2k+ `platform_post` rows that were
 * synced in from the real social accounts. Those are the record of what actually
 * went out, they feed every analytics surface, and the sync would just bring
 * them back anyway. Same for brands, channels, media, and amplifiers.
 *
 * What it clears is the layer a human made and abandoned: stale model
 * suggestions, planned posts, and the unpublished platform spots hanging off
 * them.
 *
 * Dry run by default — prints what it would delete and exits.
 *
 *   bun --conditions=react-server scripts/reset-content-slate.ts
 *   bun --conditions=react-server scripts/reset-content-slate.ts --apply
 *
 * Flags:
 *   --apply            actually delete (writes a JSON backup first)
 *   --include-series   also drop the 28 series definitions
 *   --include-published-plans  also drop content_post rows already published
 *                              (their platform_post history survives either way,
 *                               it just stops pointing back at a plan)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  contentPostTable,
  contentSuggestionTable,
  platformPostTable,
  seriesTable,
} from "@/server/db/schema";

const apply = process.argv.includes("--apply");
const includeSeries = process.argv.includes("--include-series");
const includePublishedPlans = process.argv.includes(
  "--include-published-plans",
);

// A published plan is a historical record, not clutter. Keep it unless asked.
const plannedPostFilter = includePublishedPlans
  ? undefined
  : ne(contentPostTable.status, "published");

const plannedPosts = await db
  .select({ id: contentPostTable.id, status: contentPostTable.status })
  .from(contentPostTable)
  .where(plannedPostFilter);
const plannedIds = plannedPosts.map((p) => p.id);

// platform_post.content_post_id is ON DELETE SET NULL, so deleting the plan
// would leave these unpublished spots orphaned in the timeline rather than
// removing them. They have to go explicitly, and only the unpublished ones —
// a published spot is history no matter what created it.
const orphanSpots = plannedIds.length
  ? await db
      .select({ id: platformPostTable.id, status: platformPostTable.status })
      .from(platformPostTable)
      .where(
        and(
          inArray(platformPostTable.contentPostId, plannedIds),
          ne(platformPostTable.status, "published"),
        ),
      )
  : [];

const suggestions = await db
  .select({ id: contentSuggestionTable.id })
  .from(contentSuggestionTable)
  .where(eq(contentSuggestionTable.status, "pending"));

const series = includeSeries
  ? await db
      .select({ id: seriesTable.id, name: seriesTable.name })
      .from(seriesTable)
  : [];

const preserved = await db
  .select({ n: sql<number>`count(*)::int` })
  .from(platformPostTable)
  .where(
    sql`${platformPostTable.contentPostId} is null or ${platformPostTable.status} = 'published'`,
  );

console.log("Content slate reset —", apply ? "APPLYING" : "dry run");
console.log("");
console.log("  would delete:");
console.log(`    content_suggestion (pending)      ${suggestions.length}`);
console.log(`    content_post                      ${plannedIds.length}`);
console.log(`    platform_post (unpublished spots) ${orphanSpots.length}`);
if (includeSeries)
  console.log(`    series                            ${series.length}`);
console.log("");
console.log(`  preserved synced/published history  ${preserved[0]?.n ?? 0}`);
console.log("");

if (!apply) {
  console.log("Dry run. Re-run with --apply to delete.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(process.cwd(), "reports");
const backupPath = path.join(backupDir, `content-slate-${stamp}.json`);

// Full rows, not just ids — this file is the only way back.
const backup = {
  takenAt: new Date().toISOString(),
  flags: { includeSeries, includePublishedPlans },
  contentSuggestion: await db
    .select()
    .from(contentSuggestionTable)
    .where(eq(contentSuggestionTable.status, "pending")),
  contentPost: plannedIds.length
    ? await db
        .select()
        .from(contentPostTable)
        .where(inArray(contentPostTable.id, plannedIds))
    : [],
  platformPost: orphanSpots.length
    ? await db
        .select()
        .from(platformPostTable)
        .where(
          inArray(
            platformPostTable.id,
            orphanSpots.map((s) => s.id),
          ),
        )
    : [],
  series: includeSeries ? await db.select().from(seriesTable) : [],
};

await mkdir(backupDir, { recursive: true });
await writeFile(backupPath, JSON.stringify(backup, null, 2));
console.log(`Backup written to ${backupPath}`);

// Order matters: suggestions reference platform_post (cascade), and the spots
// have to go before the plans they hang off.
if (suggestions.length) {
  await db
    .delete(contentSuggestionTable)
    .where(eq(contentSuggestionTable.status, "pending"));
}
if (orphanSpots.length) {
  await db.delete(platformPostTable).where(
    inArray(
      platformPostTable.id,
      orphanSpots.map((s) => s.id),
    ),
  );
}
if (plannedIds.length) {
  await db
    .delete(contentPostTable)
    .where(inArray(contentPostTable.id, plannedIds));
}
if (includeSeries && series.length) {
  await db.delete(seriesTable).where(isNotNull(seriesTable.id));
}

console.log("Slate cleared.");
