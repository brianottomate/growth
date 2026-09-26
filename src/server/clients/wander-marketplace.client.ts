import "server-only";

// ---- WANDER.COM MARKETPLACE -------------------------------------------------
//
// The listings wander.com itself renders, read from the same guest API the
// site's server calls: `/guest-api/search` for cards and
// `/guest-api/listings/v2/{idOrSlug}` for the property page. Unauthenticated,
// like the WanderOS site search next door; the site identifies itself with
// `x-wander-client: wander-website` and so do we.
//
// Money on this API is in cents. Ratings are 0-10.

const API = "https://api.wander.com/guest-api";
const HEADERS = {
  "x-wander-client": "wander-website",
  origin: "https://www.wander.com",
  referer: "https://www.wander.com/",
};

/** The tiers wander.com badges. STANDARD and the rest draw nothing. */
export type MarketplaceTier = "LUXURY" | "ICONIC";

export function badgedTier(tier: string | null | undefined) {
  return tier === "LUXURY" || tier === "ICONIC" ? tier : null;
}

/**
 * The cheapest stay the site advertises when no dates are searched: a cached
 * range, usually three nights but not always. The card prints the all-in
 * total ("$4,548 for 3 nights") and derives its savings line from the pre-tax
 * one, so both are kept.
 */
export type MarketplaceStay = {
  /** Pre-tax stay total, the savings basis. */
  priceCents: number;
  /** With taxes and fees, what the card prints; null when not computed. */
  totalCents: number | null;
  nights: number;
  checkIn: string;
  checkOut: string;
};

export type MarketplaceListing = {
  id: string;
  slug: string;
  name: string;
  url: string;
  tier: string | null;
  management: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  /** 0-10, as the API reports it. */
  rating: number | null;
  reviewCount: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
  /** The card's first photo: the COVER gallery's first item. */
  coverUrl: string | null;
  cheapestStay: MarketplaceStay | null;
};

export type MarketplacePhoto = {
  url: string;
  thumbUrl: string;
  /** "Exterior", "Living room"; null for the cover set and the catch-all. */
  room: string | null;
};

export type MarketplaceListingDetail = MarketplaceListing & {
  description: string | null;
  /** Every photo, cover first, then room by room in the site's order. */
  photos: MarketplacePhoto[];
};

export function marketplaceListingUrl(slug: string) {
  return `https://www.wander.com/property/${slug}`;
}

/**
 * The listing a wander.com URL, slug or id names. `/property/<slug>` is the
 * only shape the site links to; anything else is taken as a slug or an id,
 * which the v2 endpoint accepts either of.
 */
export function marketplaceRef(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)wander\.com$/.test(url.hostname)) return null;
    const match = /^\/property\/([^/?#]+)/.exec(url.pathname);
    return match ? decodeURIComponent(match[1]!) : null;
  } catch {
    return /^[a-z0-9-]+$/i.test(trimmed) ? trimmed : null;
  }
}

function stayFrom(
  value:
    | {
        price?: number | null;
        priceWithTaxesAndFees?: number | null;
        totalNights?: number | null;
        checkIn?: string | null;
        checkOut?: string | null;
      }
    | null
    | undefined,
): MarketplaceStay | null {
  if (!value?.price || !value.totalNights || !value.checkIn || !value.checkOut)
    return null;
  return {
    priceCents: value.price,
    totalCents: value.priceWithTaxesAndFees ?? null,
    nights: value.totalNights,
    checkIn: value.checkIn.slice(0, 10),
    checkOut: value.checkOut.slice(0, 10),
  };
}

/** Gallery types are SCREAMING_SNAKE room kinds; the page labels them. */
function roomLabel(type: string | undefined) {
  if (!type || type === "COVER" || type === "PROPERTY") return null;
  const words = type.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type SearchRow = {
  id?: string;
  slug?: string;
  name?: string;
  bedrooms?: number;
  bathrooms?: number;
  occupancy?: number;
  overallRating?: number;
  totalReviews?: number;
  management?: string;
  tier?: string;
  bookable?: boolean;
  address?: {
    city?: string;
    state?: string;
    country?: string;
    countryShortCode?: string;
  };
  medias?: { lowResUrl?: string; mediumResUrl?: string }[];
  cheapestPrice?: Parameters<typeof stayFrom>[0];
};

/**
 * Free-text search over live, bookable wander.com listings, as the site's own
 * search box runs it. Matches names and places.
 */
export async function searchMarketplaceListings(input: {
  query: string;
  take?: number;
}): Promise<MarketplaceListing[]> {
  const response = await fetch(
    `${API}/search?page=1&take=${input.take ?? 10}`,
    {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ filters: { query: input.query } }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`wander.com search failed (${response.status})`);
  }
  const body = (await response.json()) as { results?: SearchRow[] };
  return (body.results ?? []).flatMap((row) => {
    if (!row.id || !row.slug || !row.name) return [];
    const cover = row.medias?.[0];
    return [
      {
        id: row.id,
        slug: row.slug,
        name: row.name,
        url: marketplaceListingUrl(row.slug),
        tier: row.tier ?? null,
        management: row.management ?? null,
        bedrooms: row.bedrooms ?? null,
        bathrooms: row.bathrooms ?? null,
        guests: row.occupancy ?? null,
        rating: row.overallRating || null,
        reviewCount: row.totalReviews ?? null,
        city: row.address?.city ?? null,
        state: row.address?.state ?? null,
        country: row.address?.country ?? null,
        countryCode: row.address?.countryShortCode ?? null,
        coverUrl: cover?.mediumResUrl ?? cover?.lowResUrl ?? null,
        cheapestStay: stayFrom(row.cheapestPrice),
      },
    ];
  });
}

type DetailBody = {
  id?: string;
  slug?: string;
  name?: string;
  description?: string | null;
  tier?: string | null;
  management?: string | null;
  location?: {
    city?: string | null;
    region?: string | null;
    country?: string | null;
    countryCode?: string | null;
  } | null;
  capacity?: {
    bedrooms?: number | null;
    bathrooms?: number | null;
    occupancy?: number | null;
  } | null;
  rating?: { overall?: number | null } | null;
  cheapestPrice?: Parameters<typeof stayFrom>[0];
  galleries?: {
    type?: string;
    order?: number;
    items?: { kind?: string; url?: string; thumbnailUrl?: string }[];
  }[];
};

/**
 * One listing as its property page shows it, by id or slug. Null when the
 * site would 404 it (unlisted, archived, never published).
 *
 * The v2 detail carries no review count, so the caller keeps the one search
 * gave it; everything else here is the page's own data.
 */
export async function fetchMarketplaceListing(
  idOrSlug: string,
): Promise<MarketplaceListingDetail | null> {
  const response = await fetch(
    `${API}/listings/v2/${encodeURIComponent(idOrSlug)}`,
    { headers: HEADERS, cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `wander.com listing ${idOrSlug} failed (${response.status})`,
    );
  }
  const body = (await response.json()) as DetailBody;
  if (!body.id || !body.slug || !body.name) return null;

  // PROPERTY is every photo again in one flat set; the room galleries carry
  // the same photos with their labels, so it only fills in what they miss.
  const rank = (type: string | undefined) =>
    type === "COVER" ? 0 : type === "PROPERTY" ? 2 : 1;
  const galleries = [...(body.galleries ?? [])].sort(
    (a, b) => rank(a.type) - rank(b.type) || (a.order ?? 0) - (b.order ?? 0),
  );
  // The cover photos are the same files as some room photos; a cover photo
  // keeps the room it was taken in, so "Exterior" still finds it.
  const roomOf = new Map<string, string>();
  for (const gallery of galleries) {
    const room = roomLabel(gallery.type);
    if (!room) continue;
    for (const item of gallery.items ?? [])
      if (item.url && !roomOf.has(item.url)) roomOf.set(item.url, room);
  }
  const seen = new Set<string>();
  const photos: MarketplacePhoto[] = [];
  for (const gallery of galleries) {
    for (const item of gallery.items ?? []) {
      if (item.kind !== "IMAGE" || !item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      photos.push({
        url: item.url,
        thumbUrl: item.thumbnailUrl ?? item.url,
        room: roomOf.get(item.url) ?? null,
      });
    }
  }
  const cover = galleries.find((gallery) => gallery.type === "COVER");

  return {
    id: body.id,
    slug: body.slug,
    name: body.name,
    url: marketplaceListingUrl(body.slug),
    tier: body.tier ?? null,
    management: body.management ?? null,
    bedrooms: body.capacity?.bedrooms ?? null,
    bathrooms: body.capacity?.bathrooms ?? null,
    guests: body.capacity?.occupancy ?? null,
    rating: body.rating?.overall || null,
    reviewCount: null,
    city: body.location?.city ?? null,
    state: body.location?.region ?? null,
    country: body.location?.country ?? null,
    countryCode: body.location?.countryCode ?? null,
    coverUrl:
      cover?.items?.find((item) => item.url)?.url ?? photos[0]?.url ?? null,
    cheapestStay: stayFrom(body.cheapestPrice),
    description: body.description?.trim() || null,
    photos,
  };
}

export type MarketplacePlace = {
  displayValue: string;
  copy: string;
  locationType: string;
  country: string | null;
  state: string | null;
  boundaries: [number, number, number, number];
};

/** The site's search-box suggestions for a place name: cities, regions. */
export async function suggestMarketplacePlaces(
  query: string,
): Promise<MarketplacePlace[]> {
  const response = await fetch(
    `${API}/search/suggest?query=${encodeURIComponent(query)}`,
    { headers: HEADERS, cache: "no-store" },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as {
    type?: string;
    displayValue?: string;
    copy?: string;
    locationType?: string;
    country?: string;
    state?: string;
    boundaries?: number[];
  }[];
  return (Array.isArray(body) ? body : []).flatMap((row) =>
    row.type === "location" &&
    row.displayValue &&
    row.copy &&
    row.locationType &&
    row.boundaries?.length === 4
      ? [
          {
            displayValue: row.displayValue,
            copy: row.copy,
            locationType: row.locationType,
            country: row.country ?? null,
            state: row.state ?? null,
            boundaries: row.boundaries as MarketplacePlace["boundaries"],
          },
        ]
      : [],
  );
}

/** The search page for a place, in the shape the site's own links take. */
export function marketplaceSearchUrl(place: MarketplacePlace) {
  const params = new URLSearchParams({
    location: place.displayValue,
    boundaries: place.boundaries.join(","),
    locationType: place.locationType,
    ...(place.country ? { country: place.country } : {}),
    ...(place.state ? { state: place.state } : {}),
    copy: place.copy,
  });
  return `https://www.wander.com/s?${params.toString()}`;
}
