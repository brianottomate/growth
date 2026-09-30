import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  stayLabel,
  type DigestProperty,
  type DigestSection,
  type ListingsDigest,
} from "@/lib/listings-digest";
import { ratingOutOfFive } from "@/lib/home-ad-previews";
import { otaSavingsUsd, stayTotalUsd } from "@/lib/ota-savings";
import {
  badgedTier,
  fetchMarketplaceListing,
  marketplaceSearchUrl,
  suggestMarketplacePlaces,
  type MarketplaceListing,
} from "@/server/clients/wander-marketplace.client";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";
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

/** "Follow the fall colors" → "follow-the-fall-colors", for a UTM value. */
function utmSlug(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "newsletter"
  );
}

/**
 * The link a home's card opens: its plain listing page, tagged so a booking
 * from the issue shows up in Amplitude as the newsletter's, by issue
 * (campaign) and by home (content). wander.com carries UTMs from landing
 * onto every event, so tagging the link is all it takes.
 */
export function newsletterLink(url: string, campaign: string) {
  const link = new URL(url);
  link.search = "";
  link.searchParams.set("utm_source", "newsletter");
  link.searchParams.set("utm_medium", "email");
  link.searchParams.set("utm_campaign", utmSlug(campaign));
  link.searchParams.set(
    "utm_content",
    link.pathname.split("/").filter(Boolean).pop() ?? "home",
  );
  return link.toString();
}

/**
 * Everything the digest takes from a matched home, photo included. The price
 * and savings are the paste's when it gave them, so the email quotes what the
 * issue was planned around; a home the paste did not price shows its
 * cheapest stay on wander.com.
 */
async function propertyFromHome(input: {
  property: DigestProperty;
  row: HomeRow;
  brandId: string;
  userId: string;
  campaign: string;
}): Promise<DigestProperty> {
  const { row } = input;
  const property = splitCityFromName(input.property);
  const tier = badgedTier(row.tier);
  const cheapest = row.cheapestStay;
  const pasted = Boolean(property.priceLabel?.trim());
  const heroUrl = row.heroSourceUrl;
  return {
    ...property,
    homeId: row.id,
    city: row.city ?? property.city ?? null,
    state: row.state ?? property.state ?? null,
    // The card's own rounding: 9.74 out of 10 prints as 4.9.
    rating: row.rating ? Math.round(row.rating * 5) / 10 : null,
    sleeps: row.guests ?? property.sleeps ?? null,
    href: newsletterLink(row.url, input.campaign),
    tier,
    priceLabel: pasted
      ? property.priceLabel
      : cheapest
        ? stayLabel({
            totalUsd: stayTotalUsd(cheapest.totalCents ?? cheapest.priceCents),
            nights: cheapest.nights,
            checkIn: cheapest.checkIn,
            checkOut: cheapest.checkOut,
          })
        : null,
    savingsUsd: pasted
      ? (property.savingsUsd ?? null)
      : cheapest
        ? otaSavingsUsd({
            priceCents: cheapest.priceCents,
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
  campaign: string;
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
      campaign: input.campaign,
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
  /** The issue, for the links' utm_campaign: its title, else the theme. */
  campaign?: string | null;
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
          campaign: input.campaign || input.digest.theme || "newsletter",
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
  return { digest: { ...input.digest, sections }, outcomes };
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

async function requireOrgBrand(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("Brand not found in this workspace.");
  return brand;
}

/** A brand's own WanderOS homes, featured first, to pick into an issue. */
export async function listBrandEmailHomes(input: {
  brandId: string;
  orgId: string;
}) {
  await requireOrgBrand(input.brandId, input.orgId);
  return db
    .select({
      id: homeTable.id,
      name: homeTable.name,
      city: homeTable.city,
      guests: homeTable.guests,
      bedrooms: homeTable.bedrooms,
      nightlyFrom: homeTable.nightlyFrom,
      heroUrl: homeTable.heroSourceUrl,
      featured: homeTable.featured,
    })
    .from(homeTable)
    .where(
      and(
        eq(homeTable.brandId, input.brandId),
        eq(homeTable.source, "wanderos"),
        isNull(homeTable.deletedAt),
      ),
    )
    .orderBy(
      desc(homeTable.featured),
      asc(homeTable.sortOrder),
      asc(homeTable.name),
    );
}

/**
 * Picked homes as one digest section, in the order picked. Everything comes
 * from the home rows: nothing is quoted that the brand's site does not show.
 */
export async function digestSectionFromBrandHomes(input: {
  brandId: string;
  orgId: string;
  homeIds: string[];
  heading: string;
  campaign?: string;
}): Promise<DigestSection> {
  await requireOrgBrand(input.brandId, input.orgId);
  const rows = await db.query.homeTable.findMany({
    where: and(
      eq(homeTable.brandId, input.brandId),
      inArray(homeTable.id, input.homeIds),
      isNull(homeTable.deletedAt),
    ),
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const properties = input.homeIds.flatMap((id): DigestProperty[] => {
    const home = byId.get(id);
    if (!home) return [];
    return [
      {
        name: home.name,
        city: home.city,
        state: home.state,
        sleeps: home.guests,
        rating: ratingOutOfFive(home.rating),
        operated: true,
        href: newsletterLink(home.url, input.campaign ?? input.heading),
        imageUrl: home.heroSourceUrl,
        heroUrl: home.heroSourceUrl,
        homeId: home.id,
        priceLabel: home.nightlyFrom
          ? `From $${home.nightlyFrom.toLocaleString("en-US")}/night`
          : null,
      },
    ];
  });
  if (!properties.length)
    throw new Error("None of those homes belong to this brand.");
  return { heading: input.heading, properties };
}

/**
 * Any home of the workspace's brands, with its photos exteriors first, to
 * choose the photo one issue shows. Choosing sets the card's image only; the
 * home's own hero (ads, other issues) stays as it is.
 */
export async function emailHomePhotos(input: {
  homeId: string;
  orgId: string;
}) {
  const [row] = await db
    .select({
      id: homeTable.id,
      name: homeTable.name,
      heroUrl: homeTable.heroSourceUrl,
      photos: homeTable.galleryCache,
    })
    .from(homeTable)
    .innerJoin(brandTable, eq(brandTable.id, homeTable.brandId))
    .where(
      and(
        eq(homeTable.id, input.homeId),
        eq(brandTable.organizationId, input.orgId),
        isNull(homeTable.deletedAt),
      ),
    );
  if (!row) throw new Error("Home not found in this workspace.");
  const exterior = (room: string | null | undefined) =>
    room === "Exterior" ? 0 : 1;
  return {
    homeId: row.id,
    name: row.name,
    heroUrl: row.heroUrl,
    photos: [...(row.photos ?? [])].sort(
      (a, b) => exterior(a.room) - exterior(b.room),
    ),
  };
}
