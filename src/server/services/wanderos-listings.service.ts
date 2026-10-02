import "server-only";

import { plausibleWanderOsId } from "@/lib/wanderos-site-detection";
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
 * Both answers stick until someone asks again. A client can migrate onto
 * WanderOS later, and rather than guess an interval at which that becomes
 * likely, re-checking is a button: `recheckBrandWebsite` looks again, and
 * `setBrandWebsiteId` takes an id by hand for a site whose HTML we cannot
 * read. An expiry would only be a rule invented to avoid asking.
 */
export async function brandWebsiteId(brandId: string): Promise<string | null> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: {
      id: true,
      website: true,
      wanderOsWebsiteId: true,
      wanderOsEnabled: true,
      wanderOsCheckedAt: true,
    },
  });
  if (!brand?.website) return null;
  if (brand.wanderOsWebsiteId && !plausibleWanderOsId(brand.wanderOsWebsiteId))
    return discoverAndRemember(brand.id, brand.website);
  if (brand.wanderOsWebsiteId)
    return brand.wanderOsEnabled ? brand.wanderOsWebsiteId : null;
  // Looked before and found nothing. Asking again is a decision someone makes.
  if (brand.wanderOsCheckedAt) return null;
  return discoverAndRemember(brand.id, brand.website);
}

async function discoverAndRemember(
  brandId: string,
  website: string,
): Promise<string | null> {
  const discovered = await wanderOsWebsiteId(website);
  await db
    .update(brandTable)
    .set({
      wanderOsWebsiteId: discovered,
      wanderOsEnabled: Boolean(discovered),
      wanderOsCheckedAt: new Date(),
    })
    .where(eq(brandTable.id, brandId));
  return discovered;
}

/** What the setup page shows, and what a re-check gives back. */
export type BrandWebsiteState = {
  website: string | null;
  websiteId: string | null;
  checkedAt: Date | null;
  enabled: boolean;
};

export async function brandWebsiteState(
  brandId: string,
): Promise<BrandWebsiteState> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: {
      website: true,
      wanderOsWebsiteId: true,
      wanderOsEnabled: true,
      wanderOsCheckedAt: true,
    },
  });
  return {
    website: brand?.website ?? null,
    websiteId: brand?.wanderOsWebsiteId ?? null,
    checkedAt: brand?.wanderOsCheckedAt ?? null,
    enabled: brand?.wanderOsEnabled ?? false,
  };
}

/** Look at their site again, whatever we concluded last time. */
export async function recheckBrandWebsite(
  brandId: string,
): Promise<BrandWebsiteState> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { id: true, website: true },
  });
  if (!brand?.website) return brandWebsiteState(brandId);
  await discoverAndRemember(brand.id, brand.website);
  return brandWebsiteState(brandId);
}

/**
 * Set the id by hand.
 *
 * The automatic read is a regex over someone else's HTML, so it will
 * eventually meet a site it cannot read. An operator who can find the id in a
 * network tab should not be blocked by that. An empty string clears it back to
 * "not a WanderOS site".
 */
export async function setBrandWebsiteId(input: {
  brandId: string;
  websiteId: string | null;
}): Promise<BrandWebsiteState> {
  const value = input.websiteId?.trim() || null;
  if (value && !/^\d{6,}$/.test(value)) {
    throw new Error("A WanderOS website id is a run of digits.");
  }
  await db
    .update(brandTable)
    .set({
      wanderOsWebsiteId: value,
      wanderOsEnabled: Boolean(value),
      wanderOsCheckedAt: new Date(),
    })
    .where(eq(brandTable.id, input.brandId));
  return brandWebsiteState(input.brandId);
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
