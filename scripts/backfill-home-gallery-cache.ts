/**
 * One-off: fill `home.gallery_cache` for WanderOS homes picked before the
 * cache existed. New picks fill it themselves in `addWanderOsHome`; this is
 * only for the homes already committed. Each home is one detail fetch against
 * Wander's own API, so it runs sequentially and is safe to re-run — homes that
 * already have a cache are skipped, and a home whose detail cannot be read is
 * left as it is.
 *
 *   bun --conditions=react-server scripts/backfill-home-gallery-cache.ts
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { homeTable } from "@/server/db/schema";
import { refreshHomeGalleryCache } from "@/server/services/homes.service";

const homes = await db.query.homeTable.findMany({
  where: and(
    eq(homeTable.source, "wanderos"),
    isNull(homeTable.deletedAt),
    isNull(homeTable.galleryCache),
  ),
  columns: { id: true, brandId: true, externalId: true, name: true },
});

console.log(`Backfilling ${homes.length} homes.`);

let filled = 0;
for (const home of homes) {
  await refreshHomeGalleryCache({
    brandId: home.brandId,
    homeId: home.id,
    externalId: home.externalId,
  });
  const [row] = await db
    .select({ count: homeTable.galleryCache })
    .from(homeTable)
    .where(eq(homeTable.id, home.id));
  const n = Array.isArray(row?.count) ? row.count.length : 0;
  if (n > 0) filled += 1;
  console.log(`  ${home.name}: ${n} photos`);
}

console.log(`Done. Filled ${filled}/${homes.length}.`);
