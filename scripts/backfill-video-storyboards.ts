/**
 * Cut storyboards for library videos that have none (anything not uploaded
 * through a browser that cut one). Waves of ten; one asset at a time inside a
 * wave, since each cut already runs its seeks in parallel.
 *
 *   bun run media:backfill:storyboards              # dry run: list them
 *   bun run media:backfill:storyboards --apply
 *   bun run media:backfill:storyboards --apply --id media_x
 *
 * Production and development share one database: --apply writes prod.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { mediaAssetTable } from "@/server/db/schema";
import { storyboardVideoAsset } from "@/server/services/video-rendition.service";

const apply = process.argv.includes("--apply");
const idFlag = process.argv.indexOf("--id");
const onlyId = idFlag >= 0 ? process.argv[idFlag + 1] : undefined;

const assets = await db
  .select({
    id: mediaAssetTable.id,
    url: mediaAssetTable.url,
    r2Key: mediaAssetTable.r2Key,
    duration: mediaAssetTable.duration,
  })
  .from(mediaAssetTable)
  .where(
    and(
      eq(mediaAssetTable.kind, "video"),
      eq(mediaAssetTable.provider, "r2"),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
      isNull(mediaAssetTable.storyboard),
      isNotNull(mediaAssetTable.url),
      isNotNull(mediaAssetTable.r2Key),
      onlyId ? eq(mediaAssetTable.id, onlyId) : undefined,
    ),
  );

console.log(`${assets.length} videos without a storyboard`);
for (const asset of assets)
  console.log(`  ${asset.id}  ${asset.duration ?? "?"}s  ${asset.url}`);
if (!apply) {
  console.log("Dry run. Pass --apply to cut and store them.");
  process.exit(0);
}

let failed = 0;
for (let wave = 0; wave < assets.length; wave += 10) {
  console.log(`Wave ${wave / 10 + 1}`);
  for (const asset of assets.slice(wave, wave + 10)) {
    const started = Date.now();
    try {
      const storyboard = await storyboardVideoAsset(
        { id: asset.id, r2Key: asset.r2Key! },
        asset.url!,
      );
      console.log(
        `  ✓ ${asset.id}  ${storyboard.frames.length} frames on ${storyboard.boards.length} boards  ${Math.round((Date.now() - started) / 1000)}s`,
      );
    } catch (error) {
      failed++;
      console.error(
        `  ✗ ${asset.id}  ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
console.log(`Done: ${assets.length - failed} cut, ${failed} failed`);
process.exit(failed ? 1 : 0);
