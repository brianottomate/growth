import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import { db } from "@/server/db";
import {
  brandTable,
  homeMediaTable,
  homeTable,
  homeGroupTable,
  homeGroupMemberTable,
} from "@/server/db/schema";
import type { HomeMediaRole, HomeSource } from "@/server/db/home-schema";
import {
  fetchWanderOsListingDetail,
  listWanderOsListingPhotos,
  type WanderOsListing,
} from "@/server/clients/wanderos-site.client";

import {
  brandListings,
  brandWebsiteId,
  normalizeListingUrl,
} from "./wanderos-listings.service";

// One home, as a page can work with it: the row and its photos with whatever
// has been decided about them.
//
// `ingestBrandHomes` gives every listing a row up front and is what syncs a
// row from the feed. Pages read rows; opening a home never writes.

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
  /** The hero, or null until one is set. */
  hero: HomePhoto | null;
  /** The carousel, in the order it runs. */
  carousel: HomePhoto[];
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
      // The site's own cover photo is the client's pick, so a home starts
      // with it as its hero instead of every reader guessing one later.
      heroSourceUrl: listing.imageUrl ?? null,
    })
    .onConflictDoUpdate({
      target: [homeTable.brandId, homeTable.externalId],
      // The feed owns these, so a later read wins. Decisions (the hero, the
      // media rows) survive every refresh: the hero is only filled when empty.
      set: {
        ...facts,
        heroSourceUrl: sql`coalesce(${homeTable.heroSourceUrl}, excluded.hero_source_url)`,
      },
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
 * One home for a page: its row and its photos. Read only.
 *
 * The stored gallery is merged with the media rows, so a photo nobody has
 * touched still shows up and a photo somebody ordered, cropped or excluded
 * keeps that decision. Uploaded library photos are appended.
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

  // The row is the home. Ingestion keeps it in step with the feed, so the
  // page reads it as is and a home gone from the feed still opens.
  const row = await db.query.homeTable.findFirst({
    where: and(
      eq(homeTable.brandId, brand.id),
      eq(homeTable.externalId, input.propertyId),
      isNull(homeTable.deletedAt),
    ),
  });
  if (!row) throw new HomeError(404, "Home not found");

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

  // The listing's full gallery, grouped by room, as ingestion stored it.
  const gallery = row.galleryCache ?? [];

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
        room: photo.room ?? null,
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
      name: row.name,
      url: row.url,
      city: row.city,
      state: row.state,
      country: row.country,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      guests: row.guests,
      rating: row.rating,
      nightlyFrom: row.nightlyFrom,
      heroSourceUrl: row.heroSourceUrl,
      photos,
      hero: photos.find((photo) => photo.isHero) ?? null,
      carousel,
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

/** Which photo the ads draw on. Null clears it; nothing is guessed in its place. */
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

/** Every home on the record for a brand, featured or not, for the setup grid. */
export async function listAllBrandHomes(brandId: string) {
  return db.query.homeTable.findMany({
    where: and(eq(homeTable.brandId, brandId), isNull(homeTable.deletedAt)),
    orderBy: (home, { asc: a }) => [a(home.createdAt), a(home.name)],
    columns: {
      id: true,
      source: true,
      externalId: true,
      name: true,
      url: true,
      city: true,
      state: true,
      bedrooms: true,
      bathrooms: true,
      guests: true,
      rating: true,
      nightlyFrom: true,
      heroSourceUrl: true,
      featured: true,
      galleryCache: true,
    },
  });
}

/** Every featured home for a brand, newest picks last, for the setup grid. */
export async function listBrandHomes(brandId: string): Promise<BrandHome[]> {
  const members = await db
    .select({ homeId: homeGroupMemberTable.homeId })
    .from(homeGroupMemberTable)
    .innerJoin(
      homeGroupTable,
      eq(homeGroupTable.id, homeGroupMemberTable.groupId),
    )
    .where(
      and(
        eq(homeGroupTable.brandId, brandId),
        eq(homeGroupTable.kind, "featured"),
      ),
    )
    .orderBy(asc(homeGroupMemberTable.sortOrder));
  if (!members.length) return [];
  const rows = await db.query.homeTable.findMany({
    where: and(
      eq(homeTable.brandId, brandId),
      inArray(
        homeTable.id,
        members.map((member) => member.homeId),
      ),
      isNull(homeTable.deletedAt),
    ),
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
  return members.flatMap((member) =>
    rows.filter((row) => row.id === member.homeId),
  );
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
  await db
    .update(homeTable)
    .set({ featured: true })
    .where(eq(homeTable.id, row.id));
  // Picking a home is a deliberate, one-at-a-time act, so the extra detail
  // fetch here is off the render path. It caches the full gallery the search
  // feed does not carry, so the setup cards show the real photo count.
  // An ingested home already has its gallery. Only a home picked before its
  // brand was ingested needs the detail read here.
  if (!row.galleryCache?.length)
    await refreshHomeGalleryCache({
      brandId: input.brandId,
      homeId: row.id,
      externalId: listing.id,
    });
  return row;
}

/**
 * Feature one home, or take it out of the featured set. The row keeps
 * everything else either way. One home per call, like a tick on its tile.
 */
export async function setHomeFeatured(input: {
  homeId: string;
  orgId: string;
  featured: boolean;
}) {
  const home = await ownedHome(input);
  await db
    .update(homeTable)
    .set({ featured: input.featured })
    .where(eq(homeTable.id, home.id));
  return { homeId: home.id, featured: input.featured };
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
        room: photo.room,
      })),
    })
    .where(eq(homeTable.id, input.homeId));
}

/**
 * Give every listing on a brand's feed a row, with what the search feed does
 * not carry: the full gallery, the amenity labels and the description, from
 * one listing-detail read per home. Photos stay URLs; nothing is re-hosted.
 * Decisions (featured, catalog overrides) are never written and a chosen
 * hero is kept; the site's cover only fills a home with none. Safe to rerun. `only` limits the run to some listing ids, for a canary.
 */
export async function ingestBrandHomes(input: {
  brandId: string;
  website: string | null;
  only?: string[];
}) {
  const websiteId = await brandWebsiteId(input.brandId);
  const listings = await brandListings({
    id: input.brandId,
    website: input.website,
  });
  if (!websiteId || listings.length === 0)
    throw new HomeError(404, "No WanderOS listings found for this brand");
  const selected = input.only
    ? listings.filter((listing) => input.only!.includes(listing.id))
    : listings;
  let withDetail = 0;
  const failed: { id: string; error: string }[] = [];
  // Ten detail reads at a time keeps a large brand off the listing API's back.
  for (let offset = 0; offset < selected.length; offset += 10) {
    await Promise.all(
      selected.slice(offset, offset + 10).map(async (listing) => {
        try {
          const row = await ensureHome({ brandId: input.brandId, listing });
          const detail = await fetchWanderOsListingDetail({
            websiteId,
            propertyId: listing.id,
          });
          // The feed's cover is a resized copy of one gallery photo. While the
          // hero is still that cover, point it at the gallery's own file so
          // the home page can mark it among the photos.
          const cover =
            row.heroSourceUrl === listing.imageUrl
              ? detail.photos.find((photo) =>
                  sameAsset(photo.url, row.heroSourceUrl),
                )
              : undefined;
          // A detail read that comes back empty keeps what the row had.
          const set = {
            ...(detail.photos.length
              ? {
                  galleryCache: detail.photos.map((photo) => ({
                    url: photo.url,
                    thumbUrl: photo.thumbUrl,
                    room: photo.room,
                  })),
                }
              : {}),
            ...(cover ? { heroSourceUrl: cover.url } : {}),
            ...(detail.amenities.length ? { amenities: detail.amenities } : {}),
            ...(detail.description ? { description: detail.description } : {}),
          };
          if (Object.keys(set).length === 0) return;
          await db.update(homeTable).set(set).where(eq(homeTable.id, row.id));
          withDetail++;
        } catch (error) {
          failed.push({
            id: listing.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }
  return { listings: selected.length, withDetail, failed };
}

/**
 * Two URLs for one photo at different sizes. WanderOS serves each asset as
 * `https://assets.wander.com/<assetId>/<size>.webp`.
 */
function sameAsset(a: string, b: string | null) {
  if (!b) return false;
  const dir = (url: string) => url.slice(0, url.lastIndexOf("/"));
  return dir(a) === dir(b);
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
        featured: true,
        ...facts,
      })
      .onConflictDoUpdate({
        target: [homeTable.brandId, homeTable.externalId],
        set: { ...facts, featured: true },
      })
      .returning();
    rows.push(row!);
  }
  return rows;
}

/**
 * Un-pick a featured home. The row stays: it is still on the feed, and its
 * catalog card and hero live on it.
 */
export async function removeBrandHome(input: {
  brandId: string;
  homeId: string;
}) {
  await db
    .update(homeTable)
    .set({ featured: false })
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
