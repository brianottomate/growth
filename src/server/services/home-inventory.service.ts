import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";
import { brandListings } from "./wanderos-listings.service";
import { fetchCatalogAddresses } from "./catalog-addresses.service";
import type { CatalogHome } from "@/lib/catalog-studio";

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
    try {
      next.homes = await fetchCatalogAddresses(homes);
      next.addressesFetchedAt = new Date().toISOString();
    } catch (error) {
      console.error(
        "Home address enrichment failed",
        error instanceof Error ? error.message : error,
      );
      next.enrichmentError =
        "Address enrichment is pending. BigQuery could not be read; saved address data is preserved. Refresh homes after access is restored.";
    }
    await db
      .update(brandTable)
      .set({
        performanceSettings: sql`jsonb_set(coalesce(${brandTable.performanceSettings}, '{}'::jsonb), '{homeInventory}', ${JSON.stringify(next)}::jsonb)`,
      })
      .where(eq(brandTable.id, brand.id));
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
