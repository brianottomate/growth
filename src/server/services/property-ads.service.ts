import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { FreezeCompositionInput } from "@/lib/compositions";
import { usStateName } from "@/lib/us-states";
import type { WanderOsListing } from "@/server/clients/wanderos-site.client";
import { db } from "@/server/db";
import {
  performanceAccountTable,
  performancePropertyTable,
  type AdCreativeContent,
  type MediaItem,
} from "@/server/db/schema";
import {
  addDraftAd,
  requireOwnedCampaign,
} from "@/server/services/ads-draft.service";
import {
  findFrozenComposition,
  freezeComposition,
} from "@/server/services/composition.service";
import {
  findImportedImage,
  importRemoteImage,
} from "@/server/services/media.service";
import {
  brandListings,
  normalizeListingUrl,
} from "@/server/services/wanderos-listings.service";

const MODEL = "claude-sonnet-5";

/** Six is a Meta carousel that still gives each card room to be seen. */
const DEFAULT_CAROUSEL_SIZE = 6;

// ---- DRAFT ADS FROM A CLIENT'S OWN HOMES ----------------------------------
//
// An experiment, and deliberately a shallow one: it makes DRAFTS. Everything
// it writes is a local plan row and a rendered PNG in our own bucket, and the
// existing push is still what decides whether any of it reaches Meta.
//
// The shape it produces is the one the learning phase argues for at these
// budgets: one static and one carousel inside a single ad set, rather than a
// catalog splitting a small budget across many products. The feed rows come
// back alongside so the catalog question can be answered with data later.

export type PropertyAdFeedRow = {
  id: string;
  title: string;
  description: string;
  availability: "in stock";
  condition: "new";
  /** Meta wants "1234.00 USD"; a listing with no price cannot be a feed row. */
  price: string;
  link: string;
  image_link: string;
  brand: string;
};

export type DraftAdsFromHomesResult = {
  campaignId: string;
  adIds: string[];
  homesUsed: { name: string; url: string }[];
  feedRows: PropertyAdFeedRow[];
  notes: string[];
};

const CopySchema = z.object({
  staticHeadline: z.string().max(60),
  staticBody: z.string().max(200),
  carouselHeadline: z.string().max(60),
  carouselBody: z.string().max(200),
});

/** "3 bd · Winter Park, Colorado", from whatever the feed actually gave us. */
export function homeSubtitle(listing: WanderOsListing): string {
  return [
    listing.bedrooms ? `${listing.bedrooms} bd` : null,
    [listing.city, usStateName(listing.state ?? null) ?? listing.state]
      .filter(Boolean)
      .join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "3 bedrooms · 2 baths · 8 guests", from whatever the feed gave us. */
export function homeFacts(listing: WanderOsListing): string {
  const count = (n: number | undefined, one: string, many: string) =>
    n ? `${n} ${n === 1 ? one : many}` : null;
  return [
    count(listing.bedrooms, "bedroom", "bedrooms"),
    count(listing.bathrooms, "bath", "baths"),
    count(listing.guests, "guest", "guests"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One home as a catalog row, or null when it cannot be one.
 *
 * Meta requires a price and an image on every row, and a home with no bookable
 * dates in the sampled window quotes no price at all. Dropping it is the only
 * honest answer: a zero would advertise a free stay and a made-up number would
 * advertise a rate they do not offer.
 */
export function catalogFeedRow(
  listing: WanderOsListing,
  brandName: string,
): PropertyAdFeedRow | null {
  if (!listing.imageUrl || listing.nightlyFrom == null) return null;
  return {
    id: listing.id,
    title: listing.name,
    description: homeSubtitle(listing) || listing.name,
    availability: "in stock",
    condition: "new",
    price: `${listing.nightlyFrom.toFixed(2)} USD`,
    link: listing.url,
    image_link: listing.imageUrl,
    brand: brandName,
  };
}

/**
 * Ad copy for the pair, written from facts the feed gave us.
 *
 * The model gets names, towns and prices and nothing else, so it cannot invent
 * an amenity the homes do not have. A failure falls back to copy built from
 * the same facts, because a draft with plain copy is more useful than no draft.
 */
async function writeCopy(input: {
  brandName: string;
  where: string;
  homes: { name: string; subtitle: string; nightlyFrom: number | null }[];
}): Promise<z.infer<typeof CopySchema>> {
  const fallback = {
    staticHeadline: input.homes[0]?.name ?? input.brandName,
    staticBody: `Book ${input.homes[0]?.name ?? "direct"} with ${input.brandName}.`,
    carouselHeadline: input.where
      ? `Stay in ${input.where}`
      : `Stays from ${input.brandName}`,
    carouselBody: `${input.homes.length} homes, booked direct with ${input.brandName}.`,
  };

  try {
    const { output } = await generateText({
      model: anthropic(MODEL),
      output: Output.object({ schema: CopySchema }),
      system:
        "You write short paid-social ad copy for vacation rentals. Use only the facts given. Never invent amenities, ratings, distances or availability. No exclamation marks, no all-caps, no emoji.",
      prompt: [
        `Property manager: ${input.brandName}`,
        input.where ? `Where: ${input.where}` : null,
        "Homes:",
        ...input.homes.map(
          (home) =>
            `- ${home.name} (${home.subtitle}${home.nightlyFrom ? `, from $${home.nightlyFrom}/night` : ""})`,
        ),
        "Write a headline and body for a single-home ad about the first home, and a headline and body for a carousel of all of them.",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.7,
    });
    return output;
  } catch (error) {
    console.error("property ad copy failed, using the facts as written", error);
    return fallback;
  }
}

/**
 * Which homes to advertise, in the order they should appear.
 *
 * The properties on the commercial record win, because those are the ones the
 * client named and agreed to pay for. A client who asked for everything, or a
 * brand with no account behind it, gets their site's own ranking instead.
 */
async function homesForCampaign(brand: {
  id: string;
  website: string | null;
}): Promise<{ listings: WanderOsListing[]; notes: string[] }> {
  const notes: string[] = [];
  const listings = await brandListings(brand);
  if (listings.length === 0) {
    return { listings, notes: ["No listings found on their site."] };
  }

  const account = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.brandId, brand.id),
      isNull(performanceAccountTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!account) {
    notes.push("No performance account, so this used their site's own order.");
    return { listings, notes };
  }

  const chosen = await db.query.performancePropertyTable.findMany({
    where: and(
      eq(performancePropertyTable.accountId, account.id),
      isNull(performancePropertyTable.deletedAt),
    ),
    columns: { siteUrl: true },
  });
  const wanted = chosen
    .map((row) => row.siteUrl)
    .filter((url): url is string => Boolean(url))
    .map(normalizeListingUrl);
  if (wanted.length === 0) {
    notes.push("No homes on the record, so this used their site's own order.");
    return { listings, notes };
  }

  const byUrl = new Map(
    listings.map((row) => [normalizeListingUrl(row.url), row] as const),
  );
  const picked = wanted
    .map((url) => byUrl.get(url))
    .filter((row): row is WanderOsListing => row !== undefined);
  if (picked.length < wanted.length) {
    notes.push(
      `${wanted.length - picked.length} home(s) on the record are not on their site's current listing feed.`,
    );
  }
  return { listings: picked.length > 0 ? picked : listings, notes };
}

/**
 * Draft one static ad and one carousel from a client's own homes.
 *
 * Each home's hero shot is imported into the media library once and rendered
 * through a composition once, so the creative is our own asset rather than a
 * hot link to their CDN, stays put when they re-shoot a listing, and a rerun
 * reuses both instead of doubling the library.
 */
export async function draftAdsFromHomes(input: {
  organizationId: string;
  userId: string;
  campaignId: string;
  carouselSize?: number;
}): Promise<DraftAdsFromHomesResult> {
  const { campaign, brand } = await requireOwnedCampaign(
    input.campaignId,
    input.organizationId,
  );
  // Ten is Meta's own carousel ceiling. The cap used to be eight to fit a
  // two-minute route budget; the route now allows what the work needs.
  const size = Math.min(
    Math.max(input.carouselSize ?? DEFAULT_CAROUSEL_SIZE, 1),
    10,
  );

  const { listings, notes } = await homesForCampaign(brand);
  const chosen = listings.filter((row) => row.imageUrl).slice(0, size);
  if (chosen.length === 0) {
    throw new Error(
      "No homes with a photo to build ads from. Check the brand's website is a WanderOS site.",
    );
  }
  if (chosen.length < listings.length) {
    notes.push(`Used the first ${chosen.length} of ${listings.length} homes.`);
  }

  const where = [
    ...new Set(
      chosen
        .map((row) => usStateName(row.state ?? null) ?? row.state)
        .filter((value): value is string => Boolean(value)),
    ),
  ].join(", ");

  const copy = await writeCopy({
    brandName: brand.name,
    where,
    homes: chosen.map((row) => ({
      name: row.name,
      subtitle: homeSubtitle(row),
      nightlyFrom: row.nightlyFrom ?? null,
    })),
  });

  // One rendered card per home. Sequential on purpose: each render is an
  // image encode plus two R2 writes, and a client with ten homes firing them
  // all at once is how a serverless function meets its memory limit.
  //
  // Both steps look before they write. A rerun, whether the first attempt
  // failed downstream or the operator asked twice, would otherwise import
  // every hero shot and render every card again.
  const cards: MediaItem[] = [];
  let reused = 0;
  for (const listing of chosen) {
    try {
      const source =
        (await findImportedImage({
          brandId: brand.id,
          url: listing.imageUrl!,
        })) ??
        (await importRemoteImage({
          brandId: brand.id,
          uploadedBy: input.userId,
          url: listing.imageUrl!,
          title: listing.name,
        }));
      // The feed card: name over the photo, facts under it, the brand's own
      // logo top left. Facts fall back to the place line for a home the feed
      // describes thinly.
      const spec: FreezeCompositionInput = {
        brandId: brand.id,
        templateId: "catalog-copy",
        formatId: "portrait",
        sourceMediaAssetId: source.id,
        title: listing.name,
        subtitle: homeFacts(listing) || homeSubtitle(listing),
        imagePosition: "center",
        mark: "auto",
        assetTitle: `${listing.name} — ${brand.name}`,
      };
      const existing = await findFrozenComposition({
        userId: input.userId,
        spec,
      });
      if (existing) reused += 1;
      const rendered =
        existing ?? (await freezeComposition({ userId: input.userId, spec }));
      // A media asset's url is nullable because video assets are pending until
      // their upload settles. A render we just wrote always has one, so a null
      // here means something is wrong with this card rather than with the run.
      if (!rendered.url) {
        notes.push(`The rendered card for ${listing.name} has no URL yet.`);
        continue;
      }
      cards.push({
        url: rendered.url,
        type: "image",
        assetId: rendered.id,
        derivedFrom: source.id,
      });
    } catch (error) {
      console.error("card render failed", listing.url, error);
      notes.push(`Could not render a card for ${listing.name}.`);
    }
  }
  if (reused > 0) {
    notes.push(`Reused ${reused} card(s) rendered on an earlier run.`);
  }
  if (cards.length === 0) {
    throw new Error("Every card failed to render; nothing was drafted.");
  }

  const landingUrl = campaign.landingUrl ?? brand.website ?? undefined;
  const adIds: string[] = [];

  const staticAd = await addDraftAd({
    organizationId: input.organizationId,
    campaignId: campaign.id,
    name: `${chosen[0]!.name} — static`,
    type: "creative",
    content: {
      headline: copy.staticHeadline,
      body: copy.staticBody,
      // A single-home ad goes to that home's page. Paid traffic landing on a
      // homepage has to find the home again by itself.
      linkUrl: chosen[0]!.url,
      callToAction: "Book now",
      media: [cards[0]!],
    } satisfies AdCreativeContent,
    businessKey: `homes:static:${normalizeListingUrl(chosen[0]!.url)}`,
  });
  adIds.push(staticAd.id);

  if (cards.length > 1) {
    const carousel = await addDraftAd({
      organizationId: input.organizationId,
      campaignId: campaign.id,
      name: `${brand.name} — ${cards.length} homes`,
      type: "creative",
      content: {
        headline: copy.carouselHeadline,
        body: copy.carouselBody,
        linkUrl: landingUrl,
        callToAction: "Book now",
        media: cards,
      } satisfies AdCreativeContent,
      businessKey: `homes:carousel:${campaign.id}`,
    });
    adIds.push(carousel.id);
  }

  const feedRows = listings
    .map((listing) => catalogFeedRow(listing, brand.name))
    .filter((row): row is PropertyAdFeedRow => row !== null);
  const dropped = listings.length - feedRows.length;
  if (dropped > 0) {
    notes.push(
      `${dropped} home(s) have no photo or no nightly price right now, so they are not in the catalog feed. Meta requires both on every row.`,
    );
  }

  return {
    campaignId: campaign.id,
    adIds,
    homesUsed: chosen.map((row) => ({ name: row.name, url: row.url })),
    feedRows,
    notes,
  };
}
