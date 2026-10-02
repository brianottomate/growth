import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { adTable } from "@/server/db/schema";
import { brandListings } from "@/server/services/wanderos-listings.service";
import { DELIVERY_LABEL } from "@/lib/performance-stage";
import {
  brandAvatarUrl,
  type PerformanceBrand,
  type loadPerformanceBrand,
} from "./brands/[brandSlug]/_data";
import type { WorkspaceData } from "./launch-workspace";

/** Shared live launch brief for the Overview and prototype workspace. */
export async function loadLaunchWorkspace({
  brand,
  deskBrand,
}: {
  brand: PerformanceBrand;
  deskBrand: Awaited<ReturnType<typeof loadPerformanceBrand>>["deskBrand"];
}): Promise<WorkspaceData> {
  const [listings, avatarUrl, ads] = await Promise.all([
    brandListings({ id: brand.id, website: brand.website }),
    brandAvatarUrl(brand),
    db.query.adTable.findMany({
      where: eq(adTable.brandId, brand.id),
      columns: { campaignId: true },
      with: { home: { columns: { externalId: true } } },
    }),
  ]);
  const homes = listings
    .filter((home) => home.imageUrl)
    .map((home) => ({
      id: home.id,
      name: home.name,
      imageUrl: home.imageUrl!,
      thumbUrl: home.thumbUrl ?? null,
      city: home.city ?? null,
      state: home.state ?? null,
      bedrooms: home.bedrooms ?? null,
      bathrooms: home.bathrooms ?? null,
      guests: home.guests ?? null,
      rating: home.rating ?? null,
    }));

  // Include homes used by campaign ads as well as the unattached ad set.
  // Feed previews remain explicitly unselected when no ad has a home.
  const boundExternalIds = new Set(
    ads.flatMap((ad) => (ad.home?.externalId ? [ad.home.externalId] : [])),
  );
  const starting = homes.filter((home) => boundExternalIds.has(home.id));

  const data: WorkspaceData = {
    brand: {
      id: brand.id,
      name: brand.name,
      slug: brand.slug ?? brand.id,
      website: brand.website,
      avatarUrl,
      delivery: deskBrand?.delivery ?? "not_started",
      deliveryLabel: DELIVERY_LABEL[deskBrand?.delivery ?? "not_started"],
    },
    budget: {
      total: deskBrand?.campaigns.reduce((s, c) => s + c.budget, 0) || null,
      spend: deskBrand?.campaigns.reduce((s, c) => s + c.spend, 0) || null,
    },
    campaigns: (deskBrand?.campaigns ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      state: c.state,
      budget: c.budget,
      spend: c.spend,
      adCount: c.adCount,
      platforms: c.platforms.map((p) => ({
        platform: p.platform,
        status: p.status,
      })),
    })),
    homes,
    starting: starting.length > 0 ? starting : homes.slice(0, 3),
    startingSource: starting.length > 0 ? "ads" : "feed",
    adCount: ads.filter((ad) => ad.campaignId === null).length,
    marketCity: modeCity(homes),
  };

  return data;
}

/** The city most of this brand's homes sit in, for the market label. */
function modeCity(homes: { city: string | null; state: string | null }[]) {
  const counts = new Map<string, number>();
  for (const home of homes) {
    const label = [home.city, home.state].filter(Boolean).join(", ");
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: string | null = null;
  let top = 0;
  for (const [label, count] of counts) {
    if (count > top) {
      top = count;
      best = label;
    }
  }
  return best;
}
