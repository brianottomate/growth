/**
 * Backfill `format` / `archetype` / `template` on platform_post rows that were
 * never classified (notably Zernio-synced owned posts, which ingest with null
 * format). Runs the AI classifier (src/server/content/classify) over each row's
 * stored signal — metadata + caption + cover image — no scrape payload needed.
 *
 * Run with `--conditions react-server` (classify.ts is server-only):
 *
 *   bun --conditions react-server scripts/classify-posts.ts             # all unclassified
 *   bun --conditions react-server scripts/classify-posts.ts --limit=50  # cap the run
 *   bun --conditions react-server scripts/classify-posts.ts --platform=instagram
 *   bun --conditions react-server scripts/classify-posts.ts --redo      # re-classify all
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { platformPostTable } from "@/server/db/schema";
import { classify } from "@/server/content/classify";
import { displayPoster } from "@/lib/utils/media";

const args = process.argv.slice(2);
const arg = (k: string) =>
  args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const limit = arg("limit") ? Number(arg("limit")) : undefined;
const platform = arg("platform");
const redo = args.includes("--redo");
const BATCH = 8;

async function main() {
  type Platform = (typeof platformPostTable.platform.enumValues)[number];
  const where = [
    redo ? undefined : isNull(platformPostTable.format),
    platform ? eq(platformPostTable.platform, platform as Platform) : undefined,
  ].filter(Boolean);

  const rows = await db.query.platformPostTable.findMany({
    where: where.length ? and(...where) : undefined,
    columns: {
      id: true,
      platform: true,
      text: true,
      media: true,
      metadata: true,
    },
    limit,
  });

  console.log(
    `Classifying ${rows.length} posts${platform ? ` (${platform})` : ""}${redo ? " [redo]" : ""}…`,
  );

  let done = 0;
  let tagged = 0;
  const counts: Record<string, number> = {};

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (r) => {
        const c = await classify({
          platform: r.platform,
          // The raw scrape payload isn't persisted; pass what the row kept.
          fields: (r.metadata as Record<string, unknown>) ?? undefined,
          text: r.text ?? undefined,
          imageUrl: displayPoster(r.media) ?? undefined,
        });
        done++;
        if (c.format || c.archetype) {
          tagged++;
          const key = c.format ?? c.archetype ?? "?";
          counts[key] = (counts[key] ?? 0) + 1;
          await db
            .update(platformPostTable)
            .set({
              format: c.format ?? null,
              archetype: c.archetype ?? null,
              template: c.template ?? null,
            })
            .where(eq(platformPostTable.id, r.id));
        }
      }),
    );
    console.log(`  ${done}/${rows.length} (${tagged} tagged)`);
  }

  console.log("\nDone. Format/archetype distribution from this run:");
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}\t${n}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
