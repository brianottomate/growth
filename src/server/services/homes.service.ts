import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import { db } from "@/server/db";
import { brandTable, homeMediaTable, homeTable } from "@/server/db/schema";
import type { HomeMediaRole, HomeSource } from "@/server/db/home-schema";
import {
  listWanderOsListingPhotos,
  type WanderOsListing,
} from "@/server/clients/wanderos-site.client";

import {
  brandListings,
  brandWebsiteId,
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
  /** The room this photo is of, when the gallery groups it into one. */
  room: string | null;
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

  // The search feed carries a preview set, around five. The listing's own
  // endpoint carries the gallery the property page shows, forty-odd for a
  // large home, grouped by room. Fall back to the preview when it fails.
  const websiteId = listing ? await brandWebsiteId(brand.id) : null;
  const detail = websiteId
    ? await listWanderOsListingPhotos({
        websiteId,
        propertyId: input.propertyId,
      })
    : [];
  const gallery =
    detail.length > 0
      ? detail
      : (listing?.gallery ?? []).map((photo) => ({ ...photo, room: null }));

  const hero = row.heroSourceUrl;
  const feedPhotos: HomePhoto[] = gallery.flatMap((photo) => {
    const decided = bySourceUrl.get(photo.url);
    if (decided?.role === "excluded") return [];
    return [
      {
        key: photo.url,
        url: photo.url,
        thumbUrl: decided?.thumbUrl ?? photo.thumbUrl,
        from: "feed" as const,
        room: photo.room,
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
        room: null,
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

// ---- SETUP: committing a working set of homes -----------------------------
//
// The setup page turns a brand from "no homes yet" into a handful the ads run
// on. Two sources, one table: the client's WanderOS feed (facts and geo come
// for free, `ensureHome` owns that), or shells typed in when there is no feed
// to read. Both write `home` rows; nothing here reaches an ad platform.

/** A home for display on the setup page: the row's own facts, no photos. */
export type BrandHome = {
  id: string;
  source: HomeSource;
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
  /** The full photo set, cached at pick time; null until a home is (re)picked. */
  galleryCache: { url: string; thumbUrl: string }[] | null;
};

/** Every committed home for a brand, newest picks last, for the setup grid. */
export async function listBrandHomes(brandId: string): Promise<BrandHome[]> {
  const rows = await db.query.homeTable.findMany({
    where: and(eq(homeTable.brandId, brandId), isNull(homeTable.deletedAt)),
    orderBy: (home, { asc: a }) => [a(home.sortOrder), a(home.createdAt)],
    columns: {
      id: true,
      source: true,
      externalId: true,
      name: true,
      url: true,
      city: true,
      state: true,
      country: true,
      bedrooms: true,
      bathrooms: true,
      guests: true,
      rating: true,
      nightlyFrom: true,
      heroSourceUrl: true,
      galleryCache: true,
    },
  });
  return rows;
}

/**
 * Commit one of the client's WanderOS listings as a home. Reads the feed
 * itself rather than trusting an id off the page, so a stale tab cannot write
 * a listing that is not theirs. Idempotent: re-picking a home refreshes it.
 *
 * One home per call on purpose: a person picks a tile at a time, and an agent
 * lists the feed, reviews it, then fires one pick per home it wants — each its
 * own observable, reversible act rather than one opaque batch.
 */
export async function addWanderOsHome(input: {
  brandId: string;
  website: string | null;
  externalId: string;
}) {
  const listings = await brandListings({
    id: input.brandId,
    website: input.website,
  });
  const listing = listings.find((row) => row.id === input.externalId);
  if (!listing) throw new HomeError(404, "That home is not on their feed");
  const row = await ensureHome({ brandId: input.brandId, listing });
  // Picking a home is a deliberate, one-at-a-time act, so the extra detail
  // fetch here is off the render path. It caches the full gallery the search
  // feed does not carry, so the setup cards show the real photo count.
  await refreshHomeGalleryCache({
    brandId: input.brandId,
    homeId: row.id,
    externalId: listing.id,
  });
  return row;
}

/**
 * Fill a home's `galleryCache` from the listing detail endpoint. The search
 * feed carries a five-photo preview; the detail endpoint carries the full
 * gallery. Best-effort: a home whose detail cannot be read keeps what it has.
 */
export async function refreshHomeGalleryCache(input: {
  brandId: string;
  homeId: string;
  externalId: string;
}) {
  const websiteId = await brandWebsiteId(input.brandId);
  if (!websiteId) return;
  const photos = await listWanderOsListingPhotos({
    websiteId,
    propertyId: input.externalId,
  });
  if (photos.length === 0) return;
  await db
    .update(homeTable)
    .set({
      galleryCache: photos.map((photo) => ({
        url: photo.url,
        thumbUrl: photo.thumbUrl,
      })),
    })
    .where(eq(homeTable.id, input.homeId));
}

/** One typed-in home, before it is a row. Only the name is required. */
export type HomeShellInput = {
  name: string;
  url?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  guests?: number | null;
  nightlyFrom?: number | null;
  heroSourceUrl?: string | null;
};

function shellSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "home"
  );
}

/**
 * Create shell homes for a brand with no feed we can read: a name, and
 * whatever else the operator (or the agent parsing their paste) could pull
 * out. A home with no URL gets a synthetic key so two of them never collide,
 * and re-typing the same one refreshes it rather than doubling it.
 */
export async function createManualHomes(input: {
  brandId: string;
  homes: HomeShellInput[];
}) {
  const rows: Awaited<ReturnType<typeof ensureHome>>[] = [];
  for (const shell of input.homes) {
    const name = shell.name.trim();
    if (!name) continue;
    const typedUrl = shell.url?.trim() || null;
    const url = typedUrl ?? `manual://${input.brandId}/${shellSlug(name)}`;
    const externalId = typedUrl
      ? normalizeListingUrl(typedUrl)
      : `manual:${shellSlug(name)}`;
    const facts = {
      url,
      urlKey: normalizeListingUrl(url),
      name,
      city: shell.city ?? null,
      state: shell.state ?? null,
      country: shell.country ?? null,
      bedrooms: shell.bedrooms ?? null,
      bathrooms: shell.bathrooms ?? null,
      guests: shell.guests ?? null,
      nightlyFrom: shell.nightlyFrom ?? null,
      heroSourceUrl: shell.heroSourceUrl ?? null,
      syncedAt: new Date(),
    };
    const [row] = await db
      .insert(homeTable)
      .values({
        brandId: input.brandId,
        source: "manual",
        externalId,
        ...facts,
      })
      .onConflictDoUpdate({
        target: [homeTable.brandId, homeTable.externalId],
        set: facts,
      })
      .returning();
    rows.push(row!);
  }
  return rows;
}

/** Drop a committed home. The feed still carries it; this only un-picks it. */
export async function removeBrandHome(input: {
  brandId: string;
  homeId: string;
}) {
  await db
    .delete(homeTable)
    .where(
      and(eq(homeTable.id, input.homeId), eq(homeTable.brandId, input.brandId)),
    );
  return { homeId: input.homeId };
}

// ---- Parsing a paste into shells ------------------------------------------

const homeShellSchema = z.object({
  homes: z
    .array(
      z.object({
        name: z.string().describe("The home's name, as a guest would see it."),
        url: z
          .string()
          .nullable()
          .describe("Listing URL if the text carries one, else null."),
        city: z.string().nullable(),
        state: z
          .string()
          .nullable()
          .describe("Two-letter code when it is a US state, else the name."),
        country: z.string().nullable(),
        bedrooms: z.number().int().nullable(),
        guests: z.number().int().nullable(),
        nightlyFrom: z
          .number()
          .int()
          .nullable()
          .describe("Cheapest nightly rate in whole dollars, if stated."),
      }),
    )
    .describe("One entry per distinct home the text names."),
});

/**
 * Turn a copy-pasted blob (an email, a list, a table) into home shells. Pulls
 * only what the text actually states and leaves the rest null; it never
 * invents a location or a rate. This is the agent standing in for a feed we
 * cannot read, so the operator can start before the client sends a thing.
 */
export async function parseHomeShells(text: string): Promise<HomeShellInput[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const { output } = await generateText({
    model: anthropic("claude-sonnet-5"),
    output: Output.object({ name: "HomeShells", schema: homeShellSchema }),
    system: [
      "You extract vacation-rental homes from whatever an operator pastes.",
      "Return one entry per distinct home. Use only facts the text states.",
      "Never guess a location, rate, or count; leave anything unstated as null.",
      "The name is what a guest would call the home, not a filename or slug.",
    ].join(" "),
    prompt: `Extract the homes from this text:\n\n${trimmed}`,
  });
  return output.homes.map((home) => ({
    name: home.name,
    url: home.url,
    city: home.city,
    state: home.state,
    country: home.country,
    bedrooms: home.bedrooms,
    guests: home.guests,
    nightlyFrom: home.nightlyFrom,
  }));
}
