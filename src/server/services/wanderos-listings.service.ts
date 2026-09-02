import "server-only";

import { eq } from "drizzle-orm";

import {
  listWanderOsListings,
  wanderOsWebsiteId,
  type WanderOsListing,
} from "@/server/clients/wanderos-site.client";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";

/**
 * A brand's homes, read from their own booking site.
 *
 * The website id is discovered by fetching their homepage and reading it out
 * of the asset URLs it serves, which is a network round trip to learn
 * something that does not change. So the answer is cached on the brand, and a
 * MISS is cached too: most brands are not on WanderOS, and re-fetching every
 * one of their homepages on every intake, pitch and campaign read would be the
 * expensive half of a feature nobody asked for.
 *
 * A miss goes stale after a week, because a client can migrate onto WanderOS
 * after we first looked. A hit does not: ids are stable, and a wrong one shows
 * up immediately as an empty listing set rather than as wrong data.
 */
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function brandWebsiteId(brandId: string): Promise<string | null> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: {
      id: true,
      website: true,
      wanderOsWebsiteId: true,
      wanderOsCheckedAt: true,
    },
  });
  if (!brand?.website) return null;
  if (brand.wanderOsWebsiteId) return brand.wanderOsWebsiteId;

  const checkedAt = brand.wanderOsCheckedAt?.getTime() ?? 0;
  if (checkedAt && Date.now() - checkedAt < MISS_TTL_MS) return null;

  const discovered = await wanderOsWebsiteId(brand.website);
  await db
    .update(brandTable)
    .set({ wanderOsWebsiteId: discovered, wanderOsCheckedAt: new Date() })
    .where(eq(brandTable.id, brand.id));
  return discovered;
}

/**
 * Every published listing on a brand's site, or an empty list for a brand we
 * did not build a site for.
 *
 * Never throws: not being a WanderOS site, an unreachable site and a failed
 * search all mean the same thing to every caller, which is that this brand's
 * homes have to come from somewhere else.
 */
export async function brandListings(input: {
  id: string;
  website: string | null;
}): Promise<WanderOsListing[]> {
  if (!input.website) return [];
  try {
    const websiteId = await brandWebsiteId(input.id);
    if (!websiteId) return [];
    return await listWanderOsListings({ websiteId, siteUrl: input.website });
  } catch (error) {
    console.error("brand listings failed", input.id, error);
    return [];
  }
}

/** Compare listing URLs the way the property dedupe does. */
export function normalizeListingUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}
