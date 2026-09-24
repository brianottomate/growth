/**
 * One-off: move catalogs onto `home` rows.
 *
 * 1. Ingest every brand that has homes or a catalog, so each listing has a row.
 * 2. For a brand with a saved `performanceSettings.catalogStudio` draft, write
 *    each card's edits onto its row as overrides. Only what differs from the
 *    card's computed default is written; a "<name> in <place>" headline from
 *    before cards led on amenities counts as a default. A card drawn on a feed
 *    photo other than the hero makes that photo the hero, unless the home
 *    already has one.
 * 3. Drop the draft key.
 *
 * Idempotent. Pass --dry to print what it would write.
 *
 *   bun --conditions=react-server scripts/migrate-catalog-to-homes.ts [--dry]
 */
import { and, eq, isNull, sql } from "drizzle-orm";

import { catalogDraft, type CatalogCard } from "@/lib/catalog-studio";
import { place } from "@/lib/home-ad-previews";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";
import { brandHomeInventory } from "@/server/services/home-inventory.service";
import { ingestBrandHomes } from "@/server/services/homes.service";

const dry = process.argv.includes("--dry");

const brands = await db.execute<{
  id: string;
  name: string;
  website: string | null;
  draft: { cards?: CatalogCard[] } | null;
}>(sql`
  select b.id, b.name, b.website, b.performance_settings->'catalogStudio' as draft
  from brand b
  where b.deleted_at is null and b.website is not null
    and (b.performance_settings ? 'homeInventory'
      or b.performance_settings ? 'catalogStudio'
      or exists (select 1 from home h where h.brand_id = b.id))
  order by b.name
`);

for (const brand of brands.rows) {
  const ingest = dry
    ? null
    : await ingestBrandHomes({ brandId: brand.id, website: brand.website })
        .then((r) => ({ listings: r.listings, failed: r.failed.length }))
        .catch((error: unknown) => ({ error: String(error) }));
  console.log(brand.name, JSON.stringify(ingest));
  if (!brand.draft?.cards?.length) continue;

  const inventory = await brandHomeInventory(brand);
  const rows = await db.query.homeTable.findMany({
    where: and(eq(homeTable.brandId, brand.id), isNull(homeTable.deletedAt)),
  });
  const byListing = new Map(rows.map((row) => [row.externalId, row]));
  const homes = inventory.homes.map((home) => ({
    ...home,
    amenities: byListing.get(home.id)?.amenities ?? home.amenities,
  }));
  const defaults = new Map(
    catalogDraft(homes).cards.map((card) => [card.homeId, card]),
  );

  for (const saved of brand.draft.cards) {
    const home = homes.find((h) => h.id === saved.homeId);
    const row = byListing.get(saved.homeId);
    const base = defaults.get(saved.homeId);
    if (!home || !row || !base) {
      console.log("  skip (off feed)", saved.homeId);
      continue;
    }
    const where = place(home);
    const nameHeadline =
      saved.title === home.name ||
      (!!where && saved.title === `${home.name} in ${where}`);
    const set: Partial<typeof homeTable.$inferInsert> = {
      ...(saved.title !== base.title && !nameHeadline
        ? { catalogTitle: saved.title }
        : {}),
      ...(saved.subtitle !== base.subtitle
        ? { catalogSubtitle: saved.subtitle }
        : {}),
      ...(saved.templateId !== base.templateId
        ? { catalogTemplateId: saved.templateId }
        : {}),
      ...(saved.imagePosition !== base.imagePosition
        ? { catalogImagePosition: saved.imagePosition }
        : {}),
      ...(saved.showLogo !== base.showLogo
        ? { catalogShowLogo: saved.showLogo }
        : {}),
      ...(!saved.included ? { catalogExcluded: true } : {}),
      ...(saved.mode ? { catalogMode: saved.mode } : {}),
      ...(saved.finishedArtwork
        ? { catalogFinishedAssetId: saved.finishedArtwork.assetId }
        : {}),
      ...(saved.assetId ? { catalogImageAssetId: saved.assetId } : {}),
      ...(!saved.assetId &&
      saved.imageUrl !== base.imageUrl &&
      !row.heroSourceUrl
        ? { heroSourceUrl: saved.imageUrl }
        : {}),
    };
    if (Object.keys(set).length === 0) continue;
    console.log("  ", home.name, JSON.stringify(set));
    if (!dry)
      await db.update(homeTable).set(set).where(eq(homeTable.id, row.id));
  }
  if (!dry)
    await db
      .update(brandTable)
      .set({
        performanceSettings: sql`${brandTable.performanceSettings} - 'catalogStudio'`,
      })
      .where(eq(brandTable.id, brand.id));
}
process.exit(0);
