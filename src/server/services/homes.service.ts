import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, homeMediaTable, homeTable } from "@/server/db/schema";
import type { HomeMediaRole } from "@/server/db/home-schema";
import type { WanderOsListing } from "@/server/clients/wanderos-site.client";

import {
  brandListings,
  normalizeListingUrl,
} from "./wanderos-listings.service";

// One home, as a page can work with it: the row, the feed's live facts, and
// its photos with whatever has been decided about them.
//
// Rows are created lazily by `ensureHome`, so opening a home is what puts it
// on the record. That keeps a two-hundred-listing brand from carrying two
// hundred rows nobody has touched, and it means the page works the first
// time it is opened rather than after a sync.

export class HomeError extends Error {
  constructor(
    public status: 404 | 422,
    message: string,
  ) {
    super(message);
  }
}

/** A photo on the page: from the client's feed, or from our library. */
export type HomePhoto = {
  /** Stable per photo: the library asset id, else the source URL. */
  key: string;
  url: string;
  thumbUrl: string;
  from: "feed" | "library";
  role: HomeMediaRole;
  sortOrder: number | null;
  assetId: string | null;
  /** The photo the creatives draw on. One per home, or none. */
  isHero: boolean;
  /** Chosen for the carousel, at `sortOrder`. */
  inCarousel: boolean;
};

export type HomeDetail = {
  id: string;
  brandId: string;
  externalId: string;
  name: string;
  url: string;
  city: string | null;
  state: string | null;
  country: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  rating: number | null;
  nightlyFrom: number | null;
  heroSourceUrl: string | null;
  /** Every photo worth showing: the feed's, plus uploads, minus the excluded. */
  photos: HomePhoto[];
  /** The hero, or null while the creatives fall back to the first photo. */
  hero: HomePhoto | null;
  /** The carousel, in the order it runs. */
  carousel: HomePhoto[];
  /** True when the feed no longer carries this listing. */
  offFeed: boolean;
};

/** The row for one feed listing, created on first sight and refreshed after. */
export async function ensureHome(input: {
  brandId: string;
  listing: WanderOsListing;
}) {
  const { brandId, listing } = input;
  const facts = {
    url: listing.url,
    urlKey: normalizeListingUrl(listing.url),
    name: listing.name,
    city: listing.city ?? null,
    state: listing.state ?? null,
    country: listing.country ?? null,
    bedrooms: listing.bedrooms ?? null,
    bathrooms: listing.bathrooms ?? null,
    guests: listing.guests ?? null,
    rating: listing.rating ?? null,
    nightlyFrom: listing.nightlyFrom ?? null,
    syncedAt: new Date(),
  };
  const [row] = await db
    .insert(homeTable)
    .values({
      brandId,
      source: "wanderos",
      externalId: listing.id,
      ...facts,
    })
    .onConflictDoUpdate({
      target: [homeTable.brandId, homeTable.externalId],
      // The feed owns these, so a later read wins. Decisions (the hero, the
      // media rows) are not in this set and survive every refresh.
      set: facts,
    })
    .returning();
  return row!;
}

/** The brand, or null when it is not this organization's to open. */
async function brandFor(input: { brandSlug: string; orgId: string }) {
  return (
    (await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.slug, input.brandSlug),
        eq(brandTable.organizationId, input.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true, slug: true, website: true },
    })) ?? null
  );
}

/**
 * One home for a page: its row, the feed's current facts, and its photos.
 *
 * The feed's gallery is read live and merged with the stored rows, so a photo
 * nobody has touched still shows up and a photo somebody ordered, cropped or
 * excluded keeps that decision. Uploaded library photos are appended.
 */
export async function loadBrandHome(input: {
  brandSlug: string;
  propertyId: string;
  orgId: string;
}): Promise<{
  brand: NonNullable<Awaited<ReturnType<typeof brandFor>>>;
  home: HomeDetail;
}> {
  const brand = await brandFor(input);
  if (!brand) throw new HomeError(404, "Brand not found");

  const listings = await brandListings({
    id: brand.id,
    website: brand.website,
  });
  const listing = listings.find((row) => row.id === input.propertyId) ?? null;

  // A home already on the record but gone from the feed still opens, so a
  // campaign that references it does not dead-end.
  const existing = await db.query.homeTable.findFirst({
    where: and(
      eq(homeTable.brandId, brand.id),
      eq(homeTable.externalId, input.propertyId),
      isNull(homeTable.deletedAt),
    ),
  });
  if (!listing && !existing) throw new HomeError(404, "Home not found");
  const row = listing
    ? await ensureHome({ brandId: brand.id, listing })
    : existing!;

  const stored = await db.query.homeMediaTable.findMany({
    where: eq(homeMediaTable.homeId, row.id),
    orderBy: [asc(homeMediaTable.sortOrder), asc(homeMediaTable.createdAt)],
  });
  const assetIds = stored
    .map((media) => media.assetId)
    .filter((id): id is string => Boolean(id));
  const assets = assetIds.length
    ? await db.query.mediaAssetTable.findMany({
        where: (t, { inArray }) => inArray(t.id, assetIds),
        columns: { id: true, url: true, thumbnailUrl: true },
      })
    : [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const bySourceUrl = new Map(
    stored.flatMap((media) =>
      media.sourceUrl ? [[media.sourceUrl, media]] : [],
    ),
  );

  const hero = row.heroSourceUrl;
  const feedPhotos: HomePhoto[] = (listing?.gallery ?? []).flatMap((photo) => {
    const decided = bySourceUrl.get(photo.url);
    if (decided?.role === "excluded") return [];
    return [
      {
        key: photo.url,
        url: photo.url,
        thumbUrl: decided?.thumbUrl ?? photo.thumbUrl,
        from: "feed" as const,
        role: decided?.role ?? "gallery",
        sortOrder: decided?.sortOrder ?? null,
        assetId: null,
        isHero: hero === photo.url,
        inCarousel: decided?.role === "carousel",
      },
    ];
  });
  const libraryPhotos: HomePhoto[] = stored.flatMap((media) => {
    if (!media.assetId || media.role === "excluded") return [];
    const asset = assetById.get(media.assetId);
    if (!asset?.url) return [];
    return [
      {
        key: media.assetId,
        url: asset.url,
        thumbUrl: asset.thumbnailUrl ?? asset.url,
        from: "library" as const,
        role: media.role,
        sortOrder: media.sortOrder,
        assetId: media.assetId,
        isHero: hero === asset.url,
        inCarousel: media.role === "carousel",
      },
    ];
  });

  const photos = [...libraryPhotos, ...feedPhotos];
  const carousel = photos
    .filter((photo) => photo.inCarousel)
    .sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
    );

  return {
    brand,
    home: {
      id: row.id,
      brandId: row.brandId,
      externalId: row.externalId,
      name: listing?.name ?? row.name,
      url: listing?.url ?? row.url,
      city: listing?.city ?? row.city,
      state: listing?.state ?? row.state,
      country: listing?.country ?? row.country,
      bedrooms: listing?.bedrooms ?? row.bedrooms,
      bathrooms: listing?.bathrooms ?? row.bathrooms,
      guests: listing?.guests ?? row.guests,
      rating: listing?.rating ?? row.rating,
      nightlyFrom: listing?.nightlyFrom ?? row.nightlyFrom,
      heroSourceUrl: row.heroSourceUrl,
      photos,
      hero: photos.find((photo) => photo.isHero) ?? null,
      carousel,
      offFeed: !listing,
    },
  };
}

/** The homes already on the record for a brand, by feed id. */
export async function brandHomeRows(brandId: string) {
  const rows = await db.query.homeTable.findMany({
    where: and(eq(homeTable.brandId, brandId), isNull(homeTable.deletedAt)),
    columns: { id: true, externalId: true, heroSourceUrl: true },
  });
  return new Map(rows.map((row) => [row.externalId, row]));
}

/** Which photo the ads draw on. Null clears it back to the feed's first. */
export async function setHomeHero(input: {
  homeId: string;
  orgId: string;
  sourceUrl: string | null;
}) {
  const home = await ownedHome(input);
  await db
    .update(homeTable)
    .set({ heroSourceUrl: input.sourceUrl })
    .where(eq(homeTable.id, home.id));
  return { homeId: home.id, heroSourceUrl: input.sourceUrl };
}

/**
 * Record a decision about one of this home's photos: its order, or that it is
 * out. A feed photo gets its first row here; a library photo is attached the
 * same way with an asset id.
 */
export async function setHomeMedia(input: {
  homeId: string;
  orgId: string;
  assetId?: string | null;
  sourceUrl?: string | null;
  thumbUrl?: string | null;
  role?: HomeMediaRole;
  sortOrder?: number | null;
  addedBy?: string | null;
}) {
  const home = await ownedHome(input);
  if (!input.assetId && !input.sourceUrl) {
    throw new HomeError(422, "A photo needs an asset or a URL");
  }
  const where = input.assetId
    ? and(
        eq(homeMediaTable.homeId, home.id),
        eq(homeMediaTable.assetId, input.assetId),
      )
    : and(
        eq(homeMediaTable.homeId, home.id),
        eq(homeMediaTable.sourceUrl, input.sourceUrl!),
      );
  const existing = await db.query.homeMediaTable.findFirst({ where });
  const patch = {
    role: input.role ?? existing?.role ?? "gallery",
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? null,
    thumbUrl: input.thumbUrl ?? existing?.thumbUrl ?? null,
  };
  if (existing) {
    await db
      .update(homeMediaTable)
      .set(patch)
      .where(eq(homeMediaTable.id, existing.id));
    return { homeId: home.id, mediaId: existing.id };
  }
  const [created] = await db
    .insert(homeMediaTable)
    .values({
      homeId: home.id,
      assetId: input.assetId ?? null,
      sourceUrl: input.sourceUrl ?? null,
      addedBy: input.addedBy ?? null,
      ...patch,
    })
    .returning();
  return { homeId: home.id, mediaId: created!.id };
}

/**
 * The carousel, replaced wholesale in the order given. Anything that was in
 * it and is not in the list drops back to being an ordinary photo.
 *
 * One call rather than one per photo: reordering is a single decision about
 * a sequence, and sending it a nudge at a time invites half-saved orders.
 */
export async function setHomeCarousel(input: {
  homeId: string;
  orgId: string;
  photos: {
    sourceUrl?: string | null;
    assetId?: string | null;
    thumbUrl?: string | null;
  }[];
  addedBy?: string | null;
}) {
  const home = await ownedHome(input);
  const existing = await db.query.homeMediaTable.findMany({
    where: eq(homeMediaTable.homeId, home.id),
  });
  const keyOf = (row: { assetId?: string | null; sourceUrl?: string | null }) =>
    row.assetId ?? row.sourceUrl ?? "";
  const wanted = new Set(input.photos.map(keyOf).filter(Boolean));

  // Out of the carousel, but still one of the home's photos.
  for (const row of existing) {
    if (row.role !== "carousel") continue;
    if (wanted.has(keyOf(row))) continue;
    await db
      .update(homeMediaTable)
      .set({ role: "gallery", sortOrder: null })
      .where(eq(homeMediaTable.id, row.id));
  }

  let index = 0;
  for (const photo of input.photos) {
    if (!photo.assetId && !photo.sourceUrl) continue;
    await setHomeMedia({
      homeId: home.id,
      orgId: input.orgId,
      assetId: photo.assetId ?? null,
      sourceUrl: photo.sourceUrl ?? null,
      thumbUrl: photo.thumbUrl ?? null,
      role: "carousel",
      sortOrder: index,
      addedBy: input.addedBy ?? null,
    });
    index += 1;
  }
  return { homeId: home.id, count: index };
}

/** The home, only when its brand belongs to the caller's organization. */
async function ownedHome(input: { homeId: string; orgId: string }) {
  const home = await db.query.homeTable.findFirst({
    where: and(eq(homeTable.id, input.homeId), isNull(homeTable.deletedAt)),
    columns: { id: true, brandId: true },
    with: { brand: { columns: { organizationId: true } } },
  });
  if (!home) throw new HomeError(404, "Home not found");
  if (home.brand?.organizationId !== input.orgId) {
    throw new HomeError(404, "Home not found");
  }
  return home;
}
