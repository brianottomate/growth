import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import type { PregenNativeExtractedProperty } from "@/server/db/schema";

// Ported from the monolith's prospect-enrichment/ (see docs/port/
// unit-extraction.md): extraction prompt, grounding, junk filter, name-regex
// fill, price estimates, and rankAndTrim — all verbatim logic. Photo selection
// takes a different route than the monolith's contact-sheet + thumbnailIndex
// pass: see image-ranking.ts, which ranks and rejects in one vision call.
// Rehosting now happens too (rehost-images.ts); toGalleryUnits maps through
// its result rather than hotlinking source URLs.

const SONNET = () => anthropic("claude-sonnet-5");

// ---- EXTRACTION (verbatim prompt + schemas) ----------------------------

const EXTRACTION_PROMPT =
  "You are reading the markdown of one page from a vacation-rental manager's website. " +
  "Extract every rental listing the page presents. For each: the name exactly as written (required), " +
  "location, nightly price in dollars, currency, star rating, bedrooms, beds, and baths. " +
  'Prices may appear as "from $X", "starting at $X", "$X/night" or just "$X" — any of those is the ' +
  'nightly price. For a range ("$200-$400") use the lower bound. ' +
  "Price and rating must be figures the page actually prints — never infer those. " +
  "Bedrooms, beds and baths are different: work them out from whatever the page shows. A room " +
  'list, a floor plan, a "sleeps 8", an amenities table or the listing title ("3BR Casita") all ' +
  "count, and a confident reading beats leaving the field empty — every card has to show a " +
  "bedroom and bathroom count, so an omission becomes a wrong number downstream rather than a " +
  "blank. Only leave them out when the page genuinely gives you nothing to go on. " +
  "Navigation links, category pages and blog posts are not listings. " +
  "Return an empty properties array if the page presents no rental listings.";

const ExtractedListing = z
  .object({
    name: z
      .string()
      .describe("The listing name exactly as the page presents it"),
    location: z.string().optional().describe("City, state, or neighborhood"),
    price: z.coerce
      .number()
      .optional()
      .describe("Nightly price in dollars, as a number"),
    currency: z.string().optional(),
    rating: z.coerce.number().optional().describe("Star rating out of 5"),
    reviewCount: z.coerce
      .number()
      .optional()
      .describe(
        "Number of reviews, only when the page prints one (e.g. '4.9 (23 reviews)')",
      ),
    bedrooms: z.coerce.number().optional(),
    beds: z.coerce.number().optional(),
    baths: z.coerce.number().optional(),
  })
  .passthrough();
const ExtractedListings = z.object({ properties: z.array(ExtractedListing) });

type SourceProperty = {
  name: string;
  location?: string;
  imageUrls: string[];
  price: number | null;
  priceEstimated?: boolean;
  rating: number | null;
  reviewCount: number | null;
  features: { bedrooms: number; beds: number; baths: number } | null;
};

export type ListingPageInput = {
  url: string;
  markdown: string;
  imageUrls: string[];
};

export async function extractPropertiesFromPages(
  pages: ListingPageInput[],
): Promise<{ properties: SourceProperty[]; pageText: string }> {
  const seen = new Set<string>();
  const properties: SourceProperty[] = [];
  const pageTexts: string[] = [];

  for (const page of pages) {
    pageTexts.push(page.markdown);
    const images = usablePageImages(page.imageUrls);

    let listings: z.infer<typeof ExtractedListings>;
    try {
      const ask = () =>
        generateText({
          model: SONNET(),
          output: Output.object({ schema: ExtractedListings }),
          system: EXTRACTION_PROMPT,
          prompt: page.markdown,
        });
      const { output } = await ask().catch(ask);
      listings = output;
    } catch {
      continue;
    }

    for (const listing of listings.properties) {
      const name = listing.name.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());

      const grounded = groundNumericClaims(
        {
          name,
          location: listing.location,
          imageUrls: images,
          price: normalizePositive(listing.price),
          rating: normalizePositive(listing.rating),
          reviewCount: normalizePositive(listing.reviewCount),
          features: toFeatures(listing),
        },
        page.markdown,
      );
      properties.push(grounded);
    }
  }

  return { properties, pageText: pageTexts.join("\n\n").slice(0, 32_000) };
}

const normalizePositive = (value: number | undefined): number | null =>
  value != null && value > 0 ? value : null;

const toFeatures = (listing: {
  bedrooms?: number;
  beds?: number;
  baths?: number;
}): SourceProperty["features"] => {
  const { bedrooms, beds, baths } = listing;
  if (bedrooms == null && beds == null && baths == null) return null;
  return { bedrooms: bedrooms ?? 0, beds: beds ?? 0, baths: baths ?? 0 };
};

/**
 * Ground the highest-harm claims — price and rating — against the page's
 * literal text: a number that isn't printed on the page is dropped, never
 * shown to the prospect. (Verbatim monolith logic.)
 */
export function groundNumericClaims(
  property: SourceProperty,
  pageText: string,
): SourceProperty {
  if (!pageText) {
    return { ...property, price: null, rating: null, reviewCount: null };
  }
  const priceGrounded =
    property.price != null &&
    (pageText.includes(`$${Math.round(property.price)}`) ||
      pageText.includes(
        `$${Math.round(property.price).toLocaleString("en-US")}`,
      ));
  const ratingGrounded =
    property.rating != null &&
    (Number.isInteger(property.rating)
      ? new RegExp(
          `\\b${property.rating}(?:\\.0)?\\s*(?:star|/\\s*5|★|out of)`,
          "i",
        ).test(pageText) || pageText.includes(`${property.rating}.0`)
      : pageText.includes(property.rating.toString()));
  // A review count is only shown when the page prints the integer AND the
  // rating survived grounding — a count without a rating is meaningless on the
  // card, and an invented count is exactly the fabrication this guard exists
  // to prevent.
  const reviewCountGrounded =
    property.reviewCount != null &&
    Number.isInteger(property.reviewCount) &&
    new RegExp(`\\b${property.reviewCount}\\b`).test(pageText);

  return {
    ...property,
    price: priceGrounded ? property.price : null,
    rating: ratingGrounded ? property.rating : null,
    reviewCount:
      ratingGrounded && reviewCountGrounded ? property.reviewCount : null,
  };
}

// ---- IMAGE FILTERS (verbatim constants) --------------------------------

const JUNK_IMAGE_PATTERN =
  /\b(?:logo|icon|favicon|firefox|chrome|safari|edge|opera|browser|app[-_]?store|google[-_]?play|play[-_]?store|badge|powered[-_]?by|best[-_]?viewed|sprite|placeholder|spinner|loader|avatars?|driftt)\b/i;

const MAP_TILE_PATTERN =
  /(^|\.)tile\.|tiles?\.|openstreetmap|mapbox|maptiler|googleapis\.com\/maps|basemaps?\./i;
const MAX_PAGE_IMAGE_CANDIDATES = 12;

export const isPageImageCandidate = (url: string): boolean =>
  url.startsWith("http") &&
  !JUNK_IMAGE_PATTERN.test(url) &&
  !MAP_TILE_PATTERN.test(url) &&
  !/\.svg(\?|#|$)/i.test(url);

function usablePageImages(images: string[] | undefined): string[] {
  return (images ?? [])
    .map((url) => url.replace(/&amp;/g, "&"))
    .filter(isPageImageCandidate)
    .slice(0, MAX_PAGE_IMAGE_CANDIDATES);
}

// ---- JUNK-UNIT FILTER (verbatim prompt) --------------------------------

const JunkVerdicts = z.object({
  junk: z
    .array(z.string())
    .describe(
      "EXACT names from the list that are clearly NOT individual rentable properties. When unsure, leave the name out.",
    ),
});

export async function dropJunkUnits(
  properties: SourceProperty[],
): Promise<SourceProperty[]> {
  if (properties.length < 2) return properties;

  const roster = properties
    .map((p) => {
      const price = p.price != null ? ` | $${p.price}` : " | no price";
      const features = p.features
        ? ` | ${p.features.bedrooms}bd/${p.features.baths}ba`
        : " | no bed/bath data";
      return `- ${p.name}${price}${features}`;
    })
    .join("\n");

  try {
    const ask = () =>
      generateText({
        model: SONNET(),
        output: Output.object({ schema: JunkVerdicts }),
        prompt: [
          "Below are names scraped from a vacation-rental manager's site, each presented as an individual rentable property. Some are actually CATEGORY pages, booking paths, or SEO landing pages in disguise.",
          "",
          'Real property names are specific: "Knot A Basic Beach House", "Amazing Grace", "BREEZY RETREAT – 1 Bedroom Corner Oceanfront #701".',
          'Junk names describe a CLASS of inventory or a way to book: "Weekly Vacation Stays", "Pet Friendly Rentals", "Lido Key Rentals with a Private Pool", "1 Bedroom Best Rate", "Waterfront Rentals in <place>".',
          "",
          "List ONLY the clearly-junk names, exactly as written. A quirky-but-specific name is a real property — when in doubt, leave it out.",
          "",
          roster,
        ].join("\n"),
      });
    const { output } = await ask().catch(ask);
    const junk = new Set(output.junk);
    return properties.filter((p) => !junk.has(p.name));
  } catch {
    return properties;
  }
}

// ---- NAME-REGEX FILL + PRICE ESTIMATES (verbatim logic) -----------------

const NAME_BEDROOMS = /(\d+)\s*(?:bed(?:room)?s?|br)\b/i;
const NAME_BATHS = /(\d+(?:\.\d)?)\s*(?:bath(?:room)?s?|ba)\b/i;

export function fillUnitDetailsFromNames(
  properties: SourceProperty[],
): SourceProperty[] {
  return properties.map((p) => {
    if (p.features && p.features.bedrooms > 0) return p;
    const bedroomsMatch = NAME_BEDROOMS.exec(p.name);
    if (!bedroomsMatch?.[1]) return p;
    const bedrooms = Number(bedroomsMatch[1]);
    const bathsMatch = NAME_BATHS.exec(p.name);
    return {
      ...p,
      features: {
        bedrooms,
        beds: bedrooms,
        baths: bathsMatch?.[1] ? Number(bathsMatch[1]) : 0,
      },
    };
  });
}

const roundTo5 = (value: number) => Math.max(50, Math.round(value / 5) * 5);

const EstimatedPrices = z.object({
  units: z
    .array(
      z.object({
        name: z.string().describe("EXACT unit name"),
        pricePerNight: z.number(),
      }),
    )
    .describe(
      "One entry per listed unit, plausible market nightly rate in USD, round numbers.",
    ),
});

export async function applyPriceEstimates(
  properties: SourceProperty[],
  businessName: string,
  pageText: string,
): Promise<SourceProperty[]> {
  const missing = properties.filter((p) => p.price == null);
  if (missing.length === 0) return properties;

  const real = properties.filter((p) => p.price != null);

  // Preference 1: median of real prices (same-bedroom-count first).
  if (real.length > 0) {
    return properties.map((p) => {
      if (p.price != null) return p;
      const sameBed = real.filter(
        (r) => r.features?.bedrooms === p.features?.bedrooms,
      );
      const pool = sameBed.length > 0 ? sameBed : real;
      const prices = pool
        .map((r) => r.price)
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b);
      const median = prices[Math.floor(prices.length / 2)];
      return median != null
        ? { ...p, price: roundTo5(median), priceEstimated: true }
        : p;
    });
  }

  // Preference 2: one structured estimate call over the page text.
  if (!pageText) return properties;
  try {
    const { output } = await generateText({
      model: SONNET(),
      output: Output.object({ schema: EstimatedPrices }),
      prompt: [
        `Estimate a plausible nightly rate (USD, round to $5) for each vacation rental below, managed by "${businessName}". Use the market/region and any pricing signals in their listing text; scale by bedroom count. These render as clearly-labeled ESTIMATES — aim for believable, slightly conservative numbers.`,
        "",
        `Units:\n${missing
          .map(
            (p) =>
              `- ${p.name}${p.features ? ` (${p.features.bedrooms}bd)` : ""}`,
          )
          .join("\n")}`,
        "",
        `Their listing text (market context):\n${pageText.slice(0, 6000)}`,
      ].join("\n"),
    });

    const missingNames = new Set(missing.map((p) => p.name));
    const estimates = new Map(
      output.units
        .filter((u) => missingNames.has(u.name) && u.pricePerNight > 0)
        .map((u) => [u.name, roundTo5(Math.min(u.pricePerNight, 2000))]),
    );
    return properties.map((p) =>
      p.price == null && estimates.has(p.name)
        ? { ...p, price: estimates.get(p.name) ?? null, priceEstimated: true }
        : p,
    );
  } catch {
    return properties;
  }
}

// ---- RANK + TRIM + MAP (verbatim ordering) ------------------------------

const MAX_GALLERY_UNITS = 10;

export function rankAndTrim(properties: SourceProperty[]): SourceProperty[] {
  const indexed = properties.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => {
    const aRenders = a.p.imageUrls.length > 0;
    const bRenders = b.p.imageUrls.length > 0;
    if (aRenders !== bRenders) {
      return aRenders ? -1 : 1;
    }
    if (a.p.rating != null && b.p.rating != null) {
      return b.p.rating - a.p.rating;
    }
    if (a.p.rating != null) return -1;
    if (b.p.rating != null) return 1;
    return a.i - b.i;
  });
  return indexed.slice(0, MAX_GALLERY_UNITS).map(({ p }) => p);
}

/** Photos on a card. The fourth candidate exists only to backfill. */
export const CARD_IMAGES = 3;

/**
 * Map to the persisted unit shape. Zero-image units are dropped (a card with
 * no photo reads as broken); bedrooms/bathrooms only set when > 0 (zero means
 * unknown → omit).
 *
 * `hosted` maps a source URL to the copy we serve. A URL missing from it did
 * not survive fetch or preparation, so it is skipped and the next candidate
 * moves up: a single unfetchable image costs a slot, not a card. Units whose
 * every candidate failed drop out here, which is why the caller must not treat
 * a thin gallery as a failed build.
 */
export function toGalleryUnits(
  properties: SourceProperty[],
  hosted: Map<string, string>,
): PregenNativeExtractedProperty[] {
  return properties
    .map((p) => ({
      ...p,
      imageUrls: p.imageUrls
        .map((url) => hosted.get(url))
        .filter((url): url is string => Boolean(url))
        .slice(0, CARD_IMAGES),
    }))
    .filter((p) => p.imageUrls.length > 0)
    .map((p) => ({
      name: p.name,
      imageUrls: p.imageUrls,
      ...(p.features && p.features.bedrooms > 0
        ? { bedrooms: p.features.bedrooms }
        : {}),
      ...(p.features && p.features.baths > 0
        ? { bathrooms: p.features.baths }
        : {}),
      ...(p.price != null ? { pricePerNight: p.price } : {}),
      ...(p.priceEstimated ? { priceEstimated: true } : {}),
      ...(p.rating != null ? { overallRating: Math.min(p.rating, 5) } : {}),
      // The card only renders a rating when a count accompanies it, so both
      // must survive grounding together or neither is shown.
      ...(p.rating != null && p.reviewCount != null
        ? { totalReviews: p.reviewCount }
        : {}),
      ...(p.location ? { city: p.location } : {}),
    }));
}
