import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";
import { fetchWanderOsListingDetail } from "@/server/clients/wanderos-site.client";
import { brandListings, brandWebsiteId } from "./wanderos-listings.service";
import { fetchCatalogAddresses } from "./catalog-addresses.service";
import type { CatalogHome } from "@/lib/catalog-studio";
import { amenitySource } from "@/lib/home-amenities";

export type HomeInventory = {
  homes: CatalogHome[];
  syncedAt: string;
  addressesFetchedAt?: string;
  enrichmentError?: string;
};

/** Source facts are distinct from picked homes and user hero/copy decisions. */
export async function brandHomeInventory(
  brand: { id: string; website: string | null },
  refresh = false,
): Promise<HomeInventory> {
  const row = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brand.id),
    columns: { performanceSettings: true },
  });
  let inventory = row?.performanceSettings?.homeInventory;
  // Inventories saved before cards led on amenities have none; read them
  // once, without redoing the listing and address sync.
  if (inventory && !refresh && inventory.homes.some((h) => !h.amenities)) {
    inventory = {
      ...inventory,
      homes: await withAmenities(brand.id, inventory.homes),
    };
    await saveInventory(brand.id, inventory);
  }
  if (!inventory || refresh) {
    const listings = await brandListings(brand);
    if (!listings.length && inventory?.homes.length)
      throw new Error(
        "No homes returned by the website. Your saved homes have been kept; try refreshing again.",
      );
    const previous = new Map(inventory?.homes.map((home) => [home.id, home]));
    const homes: CatalogHome[] = listings.map((home) => ({
      ...previous.get(home.id),
      ...home,
    }));
    const next: HomeInventory = {
      homes,
      syncedAt: new Date().toISOString(),
      addressesFetchedAt: inventory?.addressesFetchedAt,
    };
    next.homes = await withAmenities(brand.id, homes);
    try {
      next.homes = await fetchCatalogAddresses(next.homes);
      next.addressesFetchedAt = new Date().toISOString();
    } catch (error) {
      console.error(
        "Home address enrichment failed",
        error instanceof Error ? error.message : error,
      );
      next.enrichmentError =
        "Address enrichment is pending. BigQuery could not be read; saved address data is preserved. Refresh homes after access is restored.";
    }
    await saveInventory(brand.id, next);
    inventory = next;
  }
  const choices = await db.query.homeTable.findMany({
    where: eq(homeTable.brandId, brand.id),
    columns: { externalId: true, heroSourceUrl: true },
  });
  return {
    ...inventory,
    homes: inventory.homes.map((home) => ({
      ...home,
      imageUrl:
        choices.find((choice) => choice.externalId === home.id)
          ?.heroSourceUrl ?? home.imageUrl,
    })),
  };
}

async function saveInventory(brandId: string, inventory: HomeInventory) {
  await db
    .update(brandTable)
    .set({
      performanceSettings: sql`jsonb_set(coalesce(${brandTable.performanceSettings}, '{}'::jsonb), '{homeInventory}', ${JSON.stringify(inventory)}::jsonb)`,
    })
    .where(eq(brandTable.id, brandId));
}

/**
 * Each home's amenity labels from its listing detail, which the search feed
 * does not carry. A home whose detail cannot be read keeps what it had, so a
 * flaky call never blanks a card's headline.
 */
async function withAmenities(
  brandId: string,
  homes: CatalogHome[],
): Promise<CatalogHome[]> {
  const websiteId = await brandWebsiteId(brandId);
  if (!websiteId)
    return homes.map((home) => ({ ...home, amenities: home.amenities ?? [] }));
  const out: CatalogHome[] = [];
  // Eight at a time: a 50-home portfolio in a few seconds without hammering
  // the client's site API.
  for (let i = 0; i < homes.length; i += 8) {
    const batch = await Promise.all(
      homes.slice(i, i + 8).map(async (home) => {
        const detail = await fetchWanderOsListingDetail({
          websiteId,
          propertyId: home.id,
        });
        const amenities = amenitySource(detail.amenities, detail.description);
        return amenities.length
          ? { ...home, amenities }
          : { ...home, amenities: home.amenities ?? [] };
      }),
    );
    out.push(...batch);
  }
  return out;
}
