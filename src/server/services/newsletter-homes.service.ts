import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import type { DigestProperty, ListingsDigest } from "@/lib/listings-digest";
import { otaSavingsUsd, stayTotalUsd } from "@/lib/ota-savings";
import {
  badgedTier,
  fetchMarketplaceListing,
  marketplaceSearchUrl,
  quoteMarketplaceStays,
  suggestMarketplacePlaces,
  type MarketplaceListing,
} from "@/server/clients/wander-marketplace.client";
import { db } from "@/server/db";
import { homeTable } from "@/server/db/schema";
import {
  findFrozenComposition,
  freezeComposition,
} from "@/server/services/composition.service";
import {
  ensureMarketplaceHome,
  findMarketplaceListing,
  nameScore,
  upsertMarketplaceHome,
  wanderBrandFor,
} from "@/server/services/marketplace-homes.service";
import { splitCityFromName } from "@/server/services/digest-extract.service";
import {
  findImportedImage,
  importRemoteImage,
} from "@/server/services/media.service";

// A property digest names homes; wander.com knows them. Matching turns each
// entry into a Growth home on the Wander brand and writes back what the site
// shows for it: the tier, the cheapest stay, the savings line and the photo,
// rendered for email with the tier pill baked in (what used to be a trip
// through Figma per home).

type HomeRow = typeof homeTable.$inferSelect;

/** The photo an email draws for a home: its hero at 1200×800, pill and all. */
export async function renderHomeEmailImage(input: {
  brandId: string;
  userId: string;
  heroUrl: string;
  tier: DigestProperty["tier"];
  homeName: string;
}): Promise<string> {
  const source =
    (await findImportedImage({ brandId: input.brandId, url: input.heroUrl })) ??
    (await importRemoteImage({
      brandId: input.brandId,
      uploadedBy: input.userId,
      url: input.heroUrl,
      title: `${input.homeName} · hero`,
    }));
  const spec = {
    brandId: input.brandId,
    templateId: input.tier ? ("tier-badge" as const) : ("photo-only" as const),
    formatId: "email" as const,
    sourceMediaAssetId: source.id,
    title: "",
    imagePosition: "center" as const,
    mark: "none" as const,
    ...(input.tier
      ? { tier: input.tier.toLowerCase() as "luxury" | "iconic" }
      : {}),
    assetTitle: `${input.homeName} · newsletter`,
  };
  const existing = await findFrozenComposition({ userId: input.userId, spec });
  if (existing?.url) return existing.url;
  const frozen = await freezeComposition({ userId: input.userId, spec });
  if (!frozen.url) throw new Error("The email photo did not save.");
  return frozen.url;
}

/**
 * The link a home's card opens: its page with the advertised stay's dates,
 * so the price the reader lands on is the price the email quoted.
 */
function stayHref(
  url: string,
  stay: { checkIn: string; checkOut: string } | null | undefined,
) {
  if (!stay) return url;
  const link = new URL(url);
  link.searchParams.set("checkIn", stay.checkIn);
  link.searchParams.set("checkOut", stay.checkOut);
  return link.toString();
}

/** Everything the digest takes from a matched home, photo included. */
async function propertyFromHome(input: {
  property: DigestProperty;
  row: HomeRow;
  brandId: string;
  userId: string;
}): Promise<DigestProperty> {
  const { row } = input;
  const property = splitCityFromName(input.property);
  const tier = badgedTier(row.tier);
  const stay = row.cheapestStay
    ? {
        totalUsd: stayTotalUsd(
          row.cheapestStay.totalCents ?? row.cheapestStay.priceCents,
        ),
        nights: row.cheapestStay.nights,
        checkIn: row.cheapestStay.checkIn,
        checkOut: row.cheapestStay.checkOut,
      }
    : null;
  const heroUrl = row.heroSourceUrl;
  return {
    ...property,
    homeId: row.id,
    city: row.city ?? property.city ?? null,
    state: row.state ?? property.state ?? null,
    // The card's own rounding: 9.74 out of 10 prints as 4.9.
    rating: row.rating ? Math.round(row.rating * 5) / 10 : null,
    sleeps: row.guests ?? property.sleeps ?? null,
    href: stayHref(row.url, stay),
    tier,
    stay,
    savingsUsd: row.cheapestStay
      ? otaSavingsUsd({
          priceCents: row.cheapestStay.priceCents,
          country: row.country,
        })
      : null,
    heroUrl,
    imageUrl: heroUrl
      ? await renderHomeEmailImage({
          brandId: input.brandId,
          userId: input.userId,
          heroUrl,
          tier,
          homeName: row.name,
        })
      : (property.imageUrl ?? null),
    candidates: null,
    stayUnavailable: null,
  };
}

function candidate(listing: MarketplaceListing) {
  return {
    id: listing.id,
    name: listing.name,
    url: listing.url,
    city: listing.city,
    thumbUrl: listing.coverUrl,
  };
}

export type DigestMatchOutcome = {
  name: string;
  status: "matched" | "ambiguous" | "missing" | "failed";
  error?: string;
};

/**
 * One digest entry matched and refreshed. A home already matched is re-read
 * by its listing id (prices and tiers move; the chosen hero stays). Otherwise
 * its link wins over its name.
 */
async function matchProperty(input: {
  property: DigestProperty;
  place: string;
  brandId: string;
  userId: string;
}): Promise<{ property: DigestProperty; outcome: DigestMatchOutcome }> {
  const { property } = input;
  const matchedRow = property.homeId
    ? await db.query.homeTable.findFirst({
        where: and(
          eq(homeTable.id, property.homeId),
          eq(homeTable.brandId, input.brandId),
          isNull(homeTable.deletedAt),
        ),
      })
    : null;

  let row: HomeRow | null = null;
  if (matchedRow) {
    const detail = await fetchMarketplaceListing(matchedRow.externalId);
    row = detail
      ? await upsertMarketplaceHome({ brandId: input.brandId, listing: detail })
      : matchedRow;
  } else {
    const match = await findMarketplaceListing({
      href: property.href,
      name: property.name,
      place: input.place,
    });
    if (match.status !== "matched") {
      return {
        property: {
          ...property,
          candidates: match.candidates.slice(0, 8).map(candidate),
        },
        outcome: { name: property.name, status: match.status },
      };
    }
    row = await ensureMarketplaceHome({
      brandId: input.brandId,
      listing: match.listing,
    });
  }
  if (!row) {
    return {
      property,
      outcome: { name: property.name, status: "missing" },
    };
  }
  return {
    property: await propertyFromHome({
      property,
      row,
      brandId: input.brandId,
      userId: input.userId,
    }),
    outcome: { name: property.name, status: "matched" },
  };
}

/**
 * Match every home in a digest to wander.com, or just one of them. Returns
 * the digest to put in the draft; nothing on the issue is saved here, the
 * same as every other edit on the photo board.
 */
export async function matchDigestHomes(input: {
  digest: ListingsDigest;
  orgId: string;
  userId: string;
  only?: { section: number; property: number };
}): Promise<{ digest: ListingsDigest; outcomes: DigestMatchOutcome[] }> {
  const brand = await wanderBrandFor(input.orgId);
  if (!brand) throw new Error("This organization has no Wander brand.");

  const outcomes: DigestMatchOutcome[] = [];
  const sections: ListingsDigest["sections"] = [];
  for (const [s, section] of input.digest.sections.entries()) {
    const properties: DigestProperty[] = [];
    // One home at a time within a section, sections in turn: a digest is a
    // dozen homes, and each match is a few reads of the site's own API.
    for (const [p, property] of section.properties.entries()) {
      if (
        input.only &&
        (input.only.section !== s || input.only.property !== p)
      ) {
        properties.push(property);
        continue;
      }
      try {
        const result = await matchProperty({
          property,
          place: section.heading,
          brandId: brand.id,
          userId: input.userId,
        });
        properties.push(result.property);
        outcomes.push(result.outcome);
      } catch (error) {
        properties.push(property);
        outcomes.push({
          name: property.name,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    sections.push({
      ...section,
      properties,
      explore: input.only
        ? section.explore
        : ((await sectionExplore(section.heading, properties)) ??
          section.explore ??
          null),
    });
  }
  const matched = { ...input.digest, sections };
  return {
    digest: matched.stayWindow
      ? await quoteStayWindow({
          digest: matched,
          brandId: brand.id,
          window: matched.stayWindow,
        })
      : matched,
    outcomes,
  };
}

/**
 * Every matched home quoted for the issue's own stay, in one search pinned to
 * those listings: what a reader sees on wander.com for those dates, savings
 * line included. A home the dates cannot be booked for loses its price and
 * is flagged, rather than quietly keeping a price for some other week.
 */
async function quoteStayWindow(input: {
  digest: ListingsDigest;
  brandId: string;
  window: NonNullable<ListingsDigest["stayWindow"]>;
}): Promise<ListingsDigest> {
  const homeIds = input.digest.sections.flatMap((section) =>
    section.properties.flatMap((property) =>
      property.homeId ? [property.homeId] : [],
    ),
  );
  if (homeIds.length === 0) return input.digest;
  const rows = await db.query.homeTable.findMany({
    where: and(
      eq(homeTable.brandId, input.brandId),
      inArray(homeTable.id, homeIds),
    ),
    columns: { id: true, externalId: true, url: true, country: true },
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const quotes = await quoteMarketplaceStays({
    unitIds: rows.map((row) => row.externalId),
    checkIn: input.window.checkIn,
    checkOut: input.window.checkOut,
  });
  return {
    ...input.digest,
    sections: input.digest.sections.map((section) => ({
      ...section,
      properties: section.properties.map((property) => {
        const row = property.homeId ? rowById.get(property.homeId) : null;
        if (!row) return property;
        const quote = quotes.get(row.externalId);
        const stay = quote
          ? {
              totalUsd: stayTotalUsd(quote.totalCents ?? quote.priceCents),
              nights: quote.nights,
              checkIn: quote.checkIn,
              checkOut: quote.checkOut,
            }
          : null;
        return {
          ...property,
          stay,
          stayUnavailable: !quote,
          savingsUsd: quote
            ? otaSavingsUsd({
                priceCents: quote.priceCents,
                country: row.country,
              })
            : null,
          href: stayHref(row.url, stay ?? input.window),
        };
      }),
    })),
  };
}

/**
 * The wander.com search a section's "Explore" button opens. The heading names
 * the place ("PARK CITY, UTAH"); where the site has no such place ("SAN DIEGO
 * COAST"), the lead home's city stands in. A suggestion counts only in the
 * lead home's state, so "Park City" is Utah's and not Kansas's, and only when
 * every word of its name was in the query.
 */
async function sectionExplore(heading: string, properties: DigestProperty[]) {
  const lead = properties.find((property) => property.homeId);
  if (!lead?.state) return null;
  const state = lead.state.toLowerCase();
  const queries = [heading.split(",")[0]!.trim(), lead.city].filter(
    (query): query is string => Boolean(query),
  );
  for (const query of queries) {
    // The place has to be what was asked for: "CALIFORNIA COAST" must not
    // become "South Coast Metro" for sharing a word and a state.
    const place = (await suggestMarketplacePlaces(query)).find(
      (row) => row.state === state && nameScore(row.displayValue, query) === 1,
    );
    if (place)
      return { href: marketplaceSearchUrl(place), place: place.displayValue };
  }
  return null;
}

/**
 * A home's photos to choose its hero from, exteriors first: the newsletter
 * leads with the outside of the house.
 */
export async function digestHomePhotos(input: {
  homeId: string;
  orgId: string;
}) {
  const brand = await wanderBrandFor(input.orgId);
  if (!brand) throw new Error("This organization has no Wander brand.");
  const row = await db.query.homeTable.findFirst({
    where: and(
      eq(homeTable.id, input.homeId),
      eq(homeTable.brandId, brand.id),
      isNull(homeTable.deletedAt),
    ),
    columns: { id: true, name: true, heroSourceUrl: true, galleryCache: true },
  });
  if (!row) throw new Error("Home not found");
  const photos = row.galleryCache ?? [];
  const exterior = (room: string | null | undefined) =>
    room === "Exterior" ? 0 : 1;
  return {
    homeId: row.id,
    name: row.name,
    heroUrl: row.heroSourceUrl,
    photos: [...photos].sort((a, b) => exterior(a.room) - exterior(b.room)),
  };
}

/**
 * Make one of a home's photos its hero and render it for the email. The hero
 * is the home's, not the issue's: the next issue featuring the home starts
 * from it, the same as the ads do.
 */
export async function setDigestHomeHero(input: {
  homeId: string;
  heroUrl: string;
  orgId: string;
  userId: string;
}) {
  const brand = await wanderBrandFor(input.orgId);
  if (!brand) throw new Error("This organization has no Wander brand.");
  const row = await db.query.homeTable.findFirst({
    where: and(
      eq(homeTable.id, input.homeId),
      eq(homeTable.brandId, brand.id),
      isNull(homeTable.deletedAt),
    ),
  });
  if (!row) throw new Error("Home not found");
  if (!(row.galleryCache ?? []).some((photo) => photo.url === input.heroUrl)) {
    throw new Error("That photo is not one of this home's.");
  }
  await db
    .update(homeTable)
    .set({ heroSourceUrl: input.heroUrl })
    .where(eq(homeTable.id, row.id));
  return {
    heroUrl: input.heroUrl,
    imageUrl: await renderHomeEmailImage({
      brandId: brand.id,
      userId: input.userId,
      heroUrl: input.heroUrl,
      tier: badgedTier(row.tier),
      homeName: row.name,
    }),
  };
}
