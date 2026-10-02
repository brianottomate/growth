import "server-only";
import { wanderOsIdFromHtml } from "@/lib/wanderos-site-detection";

// ---- WANDEROS SITE SEARCH --------------------------------------------------
//
// A client's booking site exposes its own listing search, unauthenticated,
// which is how the site itself renders. Reading it is how the intake form can
// offer "pick your homes" instead of asking someone to paste 200 URLs.
//
// Two facts make it work without any per-client configuration:
//   * the site's HTML carries its website id (it appears in every asset URL)
//   * that id is the only credential the search endpoint wants

const SEARCH_URL = "https://api.wander.com/saas/website/search";
const LISTING_URL = "https://api.wander.com/saas/website/listings";

export type WanderOsListing = {
  id: string;
  slug: string;
  name: string;
  /** Canonical listing URL, the shape the site's own links use. */
  url: string;
  bedrooms?: number;
  bathrooms?: number;
  /** Sleeps, as the feed calls it: `occupancy`. */
  guests?: number;
  /** 0–5 as the feed reports it; absent for homes with no reviews yet. */
  rating?: number;
  reviewCount?: number;
  imageUrl?: string;
  /** The 640px variant of the same hero, for a picker that only looks. */
  thumbUrl?: string;
  /**
   * Every photo the feed carries, largest variant first, hero included. The
   * feed has always returned the whole gallery; only photo zero used to be
   * read. A carousel of one home's rooms needs the rest.
   */
  gallery?: { url: string; thumbUrl: string }[];
  /** Where the home is, as the feed states it. */
  city?: string;
  /** Two-letter state code, e.g. "CO". */
  state?: string;
  /** ISO-3166 alpha-2, e.g. "US". */
  country?: string;
  /**
   * Cheapest nightly rate in whole dollars, before fees. The feed quotes cents
   * for a sample stay, so this is the base rate rather than the total.
   */
  nightlyFrom?: number;
};

/**
 * The website id for a booking site, read from its own HTML.
 *
 * Returns null rather than throwing for anything that is not a WanderOS site,
 * which is the common case for a brand we have not built for.
 */
/** The feed quotes money in cents; nothing downstream wants cents. */
export function centsToDollars(value: number | undefined): number | undefined {
  return typeof value === "number" && value > 0
    ? Math.round(value / 100)
    : undefined;
}

export async function wanderOsWebsiteId(
  siteUrl: string,
): Promise<string | null> {
  try {
    const response = await fetch(siteUrl, {
      headers: { accept: "text/html" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const html = await response.text();
    // The id appears in asset URLs (assets-websites.wander.com/<id>/...),
    // which is the most stable place it shows up.
    return wanderOsIdFromHtml(html);
  } catch {
    return null;
  }
}

/**
 * Every published listing on a WanderOS site.
 *
 * Paginated at the source, so this walks pages until `has_more` is false or
 * the cap is hit. The cap exists because this runs inside a request a client
 * is waiting on, and a portfolio in the thousands is not worth the wait.
 */
export async function listWanderOsListings(input: {
  websiteId: string;
  siteUrl: string;
  maxPages?: number;
}): Promise<WanderOsListing[]> {
  const origin = new URL(input.siteUrl).origin;
  const listings: WanderOsListing[] = [];
  const maxPages = input.maxPages ?? 12;

  for (let page = 1; page <= maxPages; page++) {
    const response = await fetch(`${SEARCH_URL}?page=${page}&take=24`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wander-client": "wander-customer-website",
        "x-website-id": input.websiteId,
      },
      body: JSON.stringify({ filters: {} }),
      cache: "no-store",
    });
    if (!response.ok) break;

    const body = (await response.json()) as {
      results?: {
        id?: string | number;
        slug?: string;
        name?: string;
        bedrooms?: number;
        bathrooms?: number;
        occupancy?: number;
        overallRating?: number;
        totalReviews?: number;
        // Media carries sized variants, not a bare `url`: lowResUrl is 640px
        // and mediumResUrl 1200px or the full upload (`fullres.webp`), all
        // webp on assets.wander.com.
        medias?: { lowResUrl?: string; mediumResUrl?: string; type?: string }[];
        address?: {
          city?: string;
          state?: string;
          country?: string;
          countryShortCode?: string;
        };
        // Absent whenever the home has no bookable dates in the sampled
        // window, which is ordinary rather than an error.
        cheapestPrice?: { nightPrice?: number; baseNightPrice?: number } | null;
      }[];
      pagination?: { has_more?: boolean };
    };

    for (const row of body.results ?? []) {
      const id = row.id != null ? String(row.id) : null;
      if (!id || !row.slug || !row.name) continue;
      listings.push({
        id,
        slug: row.slug,
        name: row.name,
        // The shape the site's own links use: /property/<id>/<slug>.
        url: `${origin}/property/${id}/${row.slug}`,
        bedrooms: row.bedrooms,
        bathrooms: row.bathrooms,
        guests: row.occupancy,
        rating: row.overallRating,
        reviewCount: row.totalReviews,
        // The larger variant: a 1080×1350 card cut from the 640px one is
        // upscaled twice over, and the feed row it also feeds wants ≥500px.
        imageUrl: row.medias?.[0]?.mediumResUrl ?? row.medias?.[0]?.lowResUrl,
        thumbUrl: row.medias?.[0]?.lowResUrl ?? row.medias?.[0]?.mediumResUrl,
        gallery: (row.medias ?? []).flatMap((media) => {
          // Video rows carry no still we can draw a card on.
          const url = media.mediumResUrl ?? media.lowResUrl;
          if (!url) return [];
          return [{ url, thumbUrl: media.lowResUrl ?? url }];
        }),
        city: row.address?.city,
        state: row.address?.state,
        country: row.address?.countryShortCode ?? row.address?.country,
        nightlyFrom: centsToDollars(
          row.cheapestPrice?.baseNightPrice ?? row.cheapestPrice?.nightPrice,
        ),
      });
    }

    if (!body.pagination?.has_more) break;
  }

  return listings;
}

/** One photo on a listing, with the room it belongs to when the feed names it. */
export type WanderOsPhoto = {
  url: string;
  thumbUrl: string;
  /** "Master King Bedroom", "Cover photos" is dropped as a label. */
  room: string | null;
};

/**
 * Every photo on one listing, which is not what the search feed carries.
 *
 * `/search` returns a preview set per listing, around five, because it is
 * built for a results page. The detail endpoint returns the gallery the
 * property page itself shows: grouped, one group per room, forty-odd photos
 * for a large home. This is Wander's own API, so there is nothing to scrape.
 *
 * Never throws: a home whose detail cannot be read falls back to the preview
 * set the caller already has.
 */
export type WanderOsListingDetail = {
  photos: WanderOsPhoto[];
  /** The client's own words about the home, as their site shows them. */
  description: string | null;
  /** Amenity labels, deduplicated: "Hot tub", "Game Room", "Fire Place". */
  amenities: string[];
  /** The site's "Where you'll be" paragraph: what the home is near. */
  locationDescription: string | null;
  petsAllowed: boolean | null;
};

/** Just the photos, for callers that do not need the rest. */
export async function listWanderOsListingPhotos(input: {
  websiteId: string;
  propertyId: string;
}): Promise<WanderOsPhoto[]> {
  return (await fetchWanderOsListingDetail(input)).photos;
}

export async function fetchWanderOsListingDetail(input: {
  websiteId: string;
  propertyId: string;
}): Promise<WanderOsListingDetail> {
  try {
    const response = await fetch(`${LISTING_URL}/${input.propertyId}`, {
      headers: {
        "x-wander-client": "wander-customer-website",
        "x-website-id": input.websiteId,
      },
      cache: "no-store",
    });
    if (!response.ok)
      return {
        photos: [],
        description: null,
        amenities: [],
        locationDescription: null,
        petsAllowed: null,
      };
    const body = (await response.json()) as {
      description?: string | null;
      locationDescription?: string | null;
      petAllowed?: boolean | null;
      amenities?: { name?: string; amenities?: { label?: string }[] }[];
      medias?: {
        name?: string;
        type?: string;
        medias?: {
          url?: string;
          thumbnailUrl?: string;
          type?: string;
          status?: string;
        }[];
      }[];
    };
    const photos: WanderOsPhoto[] = [];
    const seen = new Set<string>();
    for (const group of body.medias ?? []) {
      // The catch-all group is literally named "ROOM", and the hero group's
      // name is a header rather than a place in the house.
      const room =
        group.name && group.name !== "ROOM" && group.type !== "HERO"
          ? group.name
          : null;
      for (const media of group.medias ?? []) {
        if (!media.url || media.type !== "IMAGE") continue;
        if (media.status && media.status !== "READY") continue;
        if (seen.has(media.url)) continue;
        seen.add(media.url);
        photos.push({
          url: media.url,
          thumbUrl: media.thumbnailUrl ?? media.url,
          room,
        });
      }
    }
    // Amenity labels are what a caption's feature bullets are made of, and
    // they are the difference between copy about this home and copy about
    // any home. `label` carries them; `displayName` is usually null.
    const amenities = [
      ...new Set(
        (body.amenities ?? []).flatMap((group) =>
          (group.amenities ?? []).flatMap((amenity) =>
            amenity.label?.trim() ? [amenity.label.trim()] : [],
          ),
        ),
      ),
    ];
    return {
      photos,
      description: body.description?.trim() || null,
      amenities,
      locationDescription: body.locationDescription?.trim() || null,
      petsAllowed: body.petAllowed ?? null,
    };
  } catch (error) {
    console.error("wanderos listing detail failed", input.propertyId, error);
    return {
      photos: [],
      description: null,
      amenities: [],
      locationDescription: null,
      petsAllowed: null,
    };
  }
}
