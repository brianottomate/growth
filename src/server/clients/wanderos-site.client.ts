import "server-only";

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
/** WanderOS ids are long numerics; 12+ digits avoids matching a price or year. */
const WEBSITE_ID_RE = /\b(\d{12,})\b/;

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

export async function wanderOsWebsiteId(siteUrl: string): Promise<string | null> {
  try {
    const response = await fetch(siteUrl, {
      headers: { accept: "text/html" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const html = await response.text();
    // The id appears in asset URLs (assets-websites.wander.com/<id>/...),
    // which is the most stable place it shows up.
    const asset = /(?:assets-websites|wander-upload-assets)\.wander\.com\/(\d{12,})\//.exec(html);
    return asset?.[1] ?? WEBSITE_ID_RE.exec(html)?.[1] ?? null;
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
