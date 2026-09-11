import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { adTable, brandTable } from "@/server/db/schema";
import type { AdCreativeContent } from "@/server/db/ads-schema";
import type { MediaItem } from "@/server/db/content-schema";
import { db } from "@/server/db";
import {
  buildPerformanceAdPlan,
  PERFORMANCE_AD_DEFAULTS,
} from "@/lib/performance-ads";
import { homeCatalogPreviewUrl } from "@/lib/home-ad-previews";
import { fetchWanderOsListingDetail } from "@/server/clients/wanderos-site.client";

import { writeAdSetCopy, type CopyHome } from "./ad-set-copy.service";
import { ensureHome } from "./homes.service";
import { brandListings, brandWebsiteId } from "./wanderos-listings.service";

// Building the set a Performance client actually runs.
//
// The shape is not invented here: `buildPerformanceAdPlan` has encoded it
// since the first hand-built campaign — a static and a carousel per home,
// then BOTH a portfolio carousel and a catalog ad, because the first fixes
// the story and the second lets Meta rank the same homes per viewer. It was
// written, tested and never called. This calls it.
//
// Every ad lands as a row with no campaign. That is the point: the set is
// reviewed and adjusted against the brand, and attached to the month it runs
// in only once someone is happy with it.

/** How many photos of one home its own carousel walks through. */
const HOME_CAROUSEL_CARDS = 6;

export class AdSetError extends Error {
  constructor(
    public status: 404 | 422,
    message: string,
  ) {
    super(message);
  }
}

export type BuiltAd = {
  id: string;
  name: string;
  kind: "static" | "carousel" | "all_properties_carousel" | "catalog";
  homeName: string | null;
  cards: number;
};

/**
 * Draw the whole set for a brand from the homes given, words and all.
 *
 * One model call writes every caption together so the homes do not repeat
 * each other. Cards are composition URLs rather than frozen files: they
 * redraw when a template improves, and nothing is committed to bytes until
 * the set is approved or pushed.
 */
export async function buildAdSet(input: {
  brandId: string;
  orgId: string;
  /** WanderOS listing ids, in the order the portfolio carousel should run. */
  propertyIds: string[];
  userId?: string | null;
}): Promise<{ brandId: string; ads: BuiltAd[]; replaced: number }> {
  if (input.propertyIds.length === 0) {
    throw new AdSetError(422, "An ad set needs at least one home");
  }
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, website: true },
  });
  if (!brand) throw new AdSetError(404, "Brand not found");

  const listings = await brandListings({
    id: brand.id,
    website: brand.website,
  });
  const chosen = input.propertyIds.flatMap((id) => {
    const listing = listings.find((row) => row.id === id);
    return listing ? [listing] : [];
  });
  if (chosen.length === 0) {
    throw new AdSetError(422, "None of those homes are on their site");
  }

  // The detail endpoint is what carries amenities and the full gallery; the
  // search feed the roster uses carries neither.
  const websiteId = await brandWebsiteId(brand.id);
  const details = await Promise.all(
    chosen.map(async (listing) => {
      const detail = websiteId
        ? await fetchWanderOsListingDetail({
            websiteId,
            propertyId: listing.id,
          })
        : { photos: [], description: null, amenities: [] };
      const home = await ensureHome({ brandId: brand.id, listing });
      const photos = detail.photos.length
        ? detail.photos.map((photo) => photo.url)
        : (listing.gallery ?? []).map((photo) => photo.url);
      // A home's own hero wins over the feed's first photo when one is picked.
      const hero = home.heroSourceUrl ?? photos[0] ?? listing.imageUrl ?? null;
      return { listing, home, detail, photos, hero };
    }),
  );
  const usable = details.filter((row) => row.hero);
  if (usable.length === 0) {
    throw new AdSetError(422, "None of those homes have a photo to draw on");
  }

  const copy = await writeAdSetCopy({
    brandName: brand.name,
    homes: usable.map(({ listing, detail }): CopyHome => ({
      name: listing.name,
      place: [listing.city, listing.state].filter(Boolean).join(", "),
      bedrooms: listing.bedrooms ?? null,
      bathrooms: listing.bathrooms ?? null,
      guests: listing.guests ?? null,
      nightlyFrom: listing.nightlyFrom ?? null,
      amenities: detail.amenities,
      description: detail.description,
    })),
  });

  const plan = buildPerformanceAdPlan({
    customer: brand.name,
    properties: usable.map(({ listing }) => ({
      name: listing.name,
      url: listing.url,
    })),
  });

  /** A card: the composition that draws it, redrawn on read. */
  const card = (
    sourceUrl: string,
    title: string,
    subtitle?: string,
  ): MediaItem => ({
    url: homeCatalogPreviewUrl({
      brandId: brand.id,
      source: { url: sourceUrl },
      formatId: "square",
      copy: {
        eyebrow: brand.name,
        title,
        subtitle: subtitle ?? "",
        rating: null,
      },
    }),
    type: "image",
  });

  // A rebuild replaces the last set rather than stacking a second one beside
  // it. Anything already approved or attached to a campaign is left alone.
  const stale = await db.query.adTable.findMany({
    where: and(eq(adTable.brandId, brand.id), isNull(adTable.campaignId)),
    columns: { id: true, status: true },
  });
  const replaceable = stale.filter((ad) => ad.status !== "approved");
  if (replaceable.length > 0) {
    // `ad` has no soft delete, and a replaced draft is not history worth
    // keeping: it was never on a platform and nobody approved it.
    await db.delete(adTable).where(
      inArray(
        adTable.id,
        replaceable.map((ad) => ad.id),
      ),
    );
  }

  const built: BuiltAd[] = [];
  for (const item of plan) {
    const index = item.propertyIndex;
    const home = index != null ? usable[index] : null;
    const homeCopy = index != null ? copy.homes[index] : null;

    let content: AdCreativeContent;
    if (item.kind === "static" && home && homeCopy) {
      content = {
        headline: homeCopy.headline,
        body: homeCopy.primaryText,
        linkUrl: home.listing.url,
        callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
        propertyName: home.listing.name,
        media: [card(home.hero!, homeCopy.cardTitle)],
      };
    } else if (item.kind === "carousel" && home && homeCopy) {
      // One home's own carousel is a walk through its rooms, which is the
      // shape a listing carousel takes and which needs the full gallery.
      const photos = home.photos.slice(0, HOME_CAROUSEL_CARDS);
      content = {
        headline: homeCopy.headline,
        body: homeCopy.primaryText,
        linkUrl: home.listing.url,
        callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
        propertyName: home.listing.name,
        media: (photos.length >= 2 ? photos : [home.hero!]).map((photo) =>
          card(photo, homeCopy.cardTitle),
        ),
      };
    } else if (item.kind === "all_properties_carousel") {
      content = {
        headline: copy.portfolioHeadline,
        body: copy.portfolioPrimaryText,
        callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
        media: usable.map(({ hero, listing }, i) =>
          card(hero!, copy.homes[i]?.cardTitle ?? listing.name),
        ),
      };
    } else {
      // The catalog ad's cards are Meta's to render from the product set; the
      // set's own cards stand in so the review shows what it will look like.
      content = {
        headline: copy.catalogHeadline,
        body: copy.catalogPrimaryText,
        callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
        media: usable.map(({ hero, listing }, i) =>
          card(hero!, copy.homes[i]?.cardTitle ?? listing.name),
        ),
      };
    }

    const [row] = await db
      .insert(adTable)
      .values({
        brandId: brand.id,
        campaignId: null,
        homeId: home?.home.id ?? null,
        name: item.name,
        type: "creative",
        status: "drawn",
        content,
      })
      .returning({ id: adTable.id });

    built.push({
      id: row!.id,
      name: item.name,
      kind: item.kind,
      homeName: home?.listing.name ?? null,
      cards: content.media.length,
    });
  }

  return { brandId: brand.id, ads: built, replaced: replaceable.length };
}

/** The brand's drafted set, newest build first. */
export async function listAdSet(input: { brandId: string; orgId: string }) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!brand) throw new AdSetError(404, "Brand not found");
  return db.query.adTable.findMany({
    where: and(eq(adTable.brandId, brand.id), isNull(adTable.campaignId)),
    orderBy: (t, { asc }) => asc(t.createdAt),
    with: { home: { columns: { id: true, name: true, externalId: true } } },
  });
}

/** Approve one ad, or put it back. Approved is what survives a rebuild. */
export async function setAdStatus(input: {
  adId: string;
  orgId: string;
  status: "drawn" | "approved";
}) {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
    columns: { id: true, brandId: true },
    with: { brand: { columns: { organizationId: true } } },
  });
  if (!ad || ad.brand?.organizationId !== input.orgId) {
    throw new AdSetError(404, "Ad not found");
  }
  await db
    .update(adTable)
    .set({ status: input.status })
    .where(eq(adTable.id, ad.id));
  return { adId: ad.id, status: input.status };
}

/** Replace the words on one ad, leaving its cards alone. */
export async function setAdCopy(input: {
  adId: string;
  orgId: string;
  headline?: string;
  body?: string;
}) {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
    columns: { id: true, content: true },
    with: { brand: { columns: { organizationId: true } } },
  });
  if (!ad || ad.brand?.organizationId !== input.orgId) {
    throw new AdSetError(404, "Ad not found");
  }
  const content = ad.content;
  if (!("media" in content))
    throw new AdSetError(422, "That ad has no creative copy");
  await db
    .update(adTable)
    .set({
      content: {
        ...content,
        headline: input.headline ?? content.headline,
        body: input.body ?? content.body,
      },
    })
    .where(eq(adTable.id, ad.id));
  return { adId: ad.id };
}
