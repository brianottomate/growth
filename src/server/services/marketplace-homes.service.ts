import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import {
  fetchMarketplaceListing,
  marketplaceRef,
  searchMarketplaceListings,
  type MarketplaceListing,
  type MarketplaceListingDetail,
} from "@/server/clients/wander-marketplace.client";
import { usStateCode, usStateName } from "@/lib/us-states";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";

import { normalizeListingUrl } from "./wanderos-listings.service";

// wander.com homes are homes of the Wander brand, with `source: "wander"`, so
// everything built for a client's homes (the hero pick, the gallery, the
// creatives) works on a marketplace listing unchanged.

/** The brand wander.com's own homes belong to, in this organization. */
export async function wanderBrandFor(orgId: string) {
  return (
    (await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.organizationId, orgId),
        eq(brandTable.slug, "wander"),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true, slug: true },
    })) ?? null
  );
}

/**
 * The row for one wander.com listing, created on first sight and refreshed
 * after. Like a WanderOS home, the listing owns its facts and a later read
 * wins; the hero is a decision and only ever filled when empty.
 */
export async function upsertMarketplaceHome(input: {
  brandId: string;
  listing: MarketplaceListingDetail;
  /** From search: the v2 detail does not count reviews. */
  reviewCount?: number | null;
}) {
  const { listing } = input;
  const facts = {
    source: "wander" as const,
    url: listing.url,
    urlKey: normalizeListingUrl(listing.url),
    name: listing.name,
    city: listing.city,
    // Listings give "Oregon" or "CO"; the issue and the site's place search
    // both want the name.
    state:
      (listing.countryCode === "US" &&
        usStateName(usStateCode(listing.state))) ||
      listing.state,
    country: listing.countryCode ?? listing.country,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    guests: listing.guests,
    rating: listing.rating,
    ...(input.reviewCount != null ? { reviewCount: input.reviewCount } : {}),
    tier: listing.tier,
    management: listing.management,
    cheapestStay: listing.cheapestStay,
    description: listing.description,
    galleryCache: listing.photos.map((photo) => ({
      url: photo.url,
      thumbUrl: photo.thumbUrl,
      room: photo.room,
    })),
    syncedAt: new Date(),
  };
  const [row] = await db
    .insert(homeTable)
    .values({
      brandId: input.brandId,
      externalId: listing.id,
      ...facts,
      heroSourceUrl: listing.coverUrl,
    })
    .onConflictDoUpdate({
      target: [homeTable.brandId, homeTable.externalId],
      set: {
        ...facts,
        heroSourceUrl: sql`coalesce(${homeTable.heroSourceUrl}, excluded.hero_source_url)`,
      },
    })
    .returning();
  return row!;
}

// ---- Finding a listing from what an issue names ----------------------------

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "at",
  "on",
  "in",
  "of",
  "by",
  "and",
  "wander",
  "with",
]);

/** The words that identify a home: lowercase, no punctuation or filler. */
export function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/**
 * How much of the name asked for a listing carries, 0 to 1. Listing names
 * are marketing ("NEW/Black Butte Ranch/Sauna/Hot Tub"), so the question is
 * whether every word of the short name appears, not whether the two match.
 */
export function nameScore(wanted: string, candidate: string) {
  const want = [...new Set(nameTokens(wanted))];
  if (want.length === 0) return 0;
  const have = new Set(nameTokens(candidate));
  return want.filter((word) => have.has(word)).length / want.length;
}

/** How much of a candidate's own name the wanted name accounts for. */
function namePrecision(wanted: string, candidate: string) {
  const have = [...new Set(nameTokens(candidate))];
  if (have.length === 0) return 0;
  const want = new Set(nameTokens(wanted));
  return have.filter((word) => want.has(word)).length / have.length;
}

/** A clear winner needs most of the name and a lead over the next best. */
const MATCH_SCORE = 0.6;
/**
 * Between two candidates that carry every word asked for, the one whose name
 * is mostly those words wins ("Wander Whitefish Valley" over "Flathead Valley
 * - WF30 - Whitefish Secluded Haven"), but only by a clear margin: two long
 * marketing names that both mention "Smith Rock" are a question for a person.
 */
const PRECISION_MARGIN = 0.25;

export type MarketplaceMatch =
  | { status: "matched"; listing: MarketplaceListing; by: "link" | "name" }
  | { status: "ambiguous"; candidates: MarketplaceListing[] }
  | { status: "missing"; candidates: MarketplaceListing[] };

/**
 * The wander.com listing an issue means by a link or a name.
 *
 * A wander.com link is exact. A name goes through the site's own search,
 * which is fuzzy and ranks oddly ("Bend Retreat" puts three other retreats
 * first), so candidates are scored locally on the name's own words. When the
 * full name finds nothing clear, every pair of its words is searched too:
 * "The Spot at Smith Rock" is listed as "Private Retreat Steps to Smith Rock".
 * Two candidates that fit equally well are handed back rather than guessed.
 */
export async function findMarketplaceListing(input: {
  href?: string | null;
  name: string;
  /** City or region the issue files the home under, to break ties. */
  place?: string | null;
}): Promise<MarketplaceMatch> {
  const ref = input.href ? marketplaceRef(input.href) : null;
  if (ref) {
    const detail = await fetchMarketplaceListing(ref);
    if (detail) return { status: "matched", listing: detail, by: "link" };
  }

  const seen = new Map<string, MarketplaceListing>();
  const collect = async (query: string) => {
    for (const row of await searchMarketplaceListings({ query, take: 40 }))
      if (!seen.has(row.id)) seen.set(row.id, row);
  };
  const decide = (): MarketplaceMatch | null => {
    const placeWords = new Set(nameTokens(input.place ?? ""));
    const ranked = [...seen.values()]
      .map((listing) => ({
        listing,
        score: nameScore(input.name, listing.name),
        precision: namePrecision(input.name, listing.name),
        inPlace: nameTokens(
          `${listing.city ?? ""} ${listing.state ?? ""}`,
        ).some((word) => placeWords.has(word)),
      }))
      .filter((row) => row.score >= MATCH_SCORE)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.inPlace) - Number(a.inPlace) ||
          b.precision - a.precision,
      );
    const [best, next] = ranked;
    if (!best) return null;
    const rival = (row: (typeof ranked)[number]) =>
      row.score === best.score &&
      row.inPlace === best.inPlace &&
      best.precision - row.precision < PRECISION_MARGIN;
    if (next && rival(next))
      return {
        status: "ambiguous",
        candidates: ranked.filter(rival).map((row) => row.listing),
      };
    return { status: "matched", listing: best.listing, by: "name" };
  };

  await collect(input.name);
  const direct = decide();
  if (direct?.status === "matched") return direct;

  const words = nameTokens(input.name);
  for (let i = 0; i + 1 < words.length; i++)
    await collect(`${words[i]} ${words[i + 1]}`);
  const widened = decide();
  if (widened) return widened;

  return {
    status: "missing",
    candidates: [...seen.values()]
      .map((listing) => ({
        listing,
        score: nameScore(input.name, listing.name),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((row) => row.listing),
  };
}

/**
 * A matched listing as a home on the Wander brand: the full detail read and
 * the row written. Search gave the review count; the detail gives the rest.
 */
export async function ensureMarketplaceHome(input: {
  brandId: string;
  listing: MarketplaceListing;
}) {
  const detail =
    "photos" in input.listing
      ? (input.listing as MarketplaceListingDetail)
      : await fetchMarketplaceListing(input.listing.id);
  if (!detail) return null;
  return upsertMarketplaceHome({
    brandId: input.brandId,
    listing: detail,
    reviewCount: input.listing.reviewCount,
  });
}
