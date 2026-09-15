import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  adTable,
  brandTable,
  campaignTable,
  mediaAssetTable,
  performanceAccountTable,
  performancePropertyTable,
} from "@/server/db/schema";
import sharp from "sharp";

import type {
  AdCard,
  AdCreativeContent,
  AdPlacementVariant,
} from "@/server/db/ads-schema";
import type { MediaItem } from "@/server/db/content-schema";
import { db } from "@/server/db";
import { isGeminiImageConfigured } from "@/server/clients/gemini-image.client";
import {
  freezeCompositionSchema,
  getCompositionFormat,
} from "@/lib/compositions";
import {
  adFormatOf,
  applyCardEdit,
  buildPerformanceAdPlan,
  homeNameFromFilename,
  MAX_SET_HOMES,
  orderHomesForSet,
  parseCreativeFilename,
  performanceAdName,
  performanceFormatFor,
  PERFORMANCE_AD_DEFAULTS,
  type AdFormat,
  type CardEdit,
} from "@/lib/performance-ads";
import { homeCatalogPreviewUrl } from "@/lib/home-ad-previews";
import {
  fetchWanderOsListingDetail,
  type WanderOsListing,
} from "@/server/clients/wanderos-site.client";

import { writeAdSetCopy, type CopyHome } from "./ad-set-copy.service";
import { deleteDraftAd } from "./ads-draft.service";
import { extendToCanvas } from "./card-director.service";
import { freezeComposition } from "./composition.service";
import { ensureHome } from "./homes.service";
import { importImageBuffer } from "./media.service";
import { brandListings, brandWebsiteId } from "./wanderos-listings.service";

// Building the set a Performance client actually runs.
//
// The shape is not invented here: `buildPerformanceAdPlan` has encoded it
// since the first hand-built campaign — a static and a carousel per home,
// then BOTH a portfolio carousel and a catalog ad, because the first fixes
// the story and the second lets Meta rank the same homes per viewer. It was
// written, tested and never called. This calls it.
//
// Every ad lands as a row with no campaign. That is the point: the set is
// reviewed and adjusted against the brand, and attached to the month it runs
// in only once someone is happy with it.
//
// The home is the unit an ad is bound to, not the input someone must pick
// first. A set can be asked for by naming the homes or by naming a count, and
// an ad made by hand can be bound to a home afterwards; either way the static,
// the carousel and the catalog slot for that home follow from the binding.

/** How many photos of one home its own carousel walks through. */
const HOME_CAROUSEL_CARDS = 6;
/** Three to ten homes is the product; five is the middle of it. */
const DEFAULT_SET_SIZE = 5;

export class AdSetError extends Error {
  constructor(
    public status: 404 | 422,
    message: string,
  ) {
    super(message);
  }
}

export type BuiltAd = {
  id: string;
  name: string;
  kind: "static" | "carousel" | "all_properties_carousel" | "catalog";
  homeName: string | null;
  cards: number;
};

const KIND_FORMAT: Record<BuiltAd["kind"], AdFormat> = {
  static: "static",
  carousel: "carousel",
  all_properties_carousel: "portfolio",
  catalog: "catalog",
};

type OwnedBrand = {
  id: string;
  name: string;
  website: string | null;
  relationship: string | null;
};

async function requireOwnedBrand(input: {
  brandId: string;
  orgId: string;
}): Promise<OwnedBrand> {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, website: true, relationship: true },
  });
  if (!brand) throw new AdSetError(404, "Brand not found");
  return brand;
}

/** An ad with its brand, or 404 when it is not this organization's. */
async function requireOwnedAd(input: { adId: string; orgId: string }) {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
    with: {
      brand: {
        columns: {
          id: true,
          name: true,
          website: true,
          relationship: true,
          organizationId: true,
        },
      },
    },
  });
  if (!ad || ad.brand?.organizationId !== input.orgId) {
    throw new AdSetError(404, "Ad not found");
  }
  return ad;
}

function creativeContent(ad: { content: unknown }): AdCreativeContent {
  const content = ad.content as AdCreativeContent;
  if (!("media" in content) || !Array.isArray(content.media)) {
    throw new AdSetError(422, "That ad is a text ad and has no cards");
  }
  return content;
}

/**
 * The homes the client named on their Performance record, by listing URL and
 * in their order. Empty for a brand with no account, or one that asked for
 * every home.
 */
async function onRecordHomeUrls(brandId: string): Promise<string[]> {
  const account = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.brandId, brandId),
      isNull(performanceAccountTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!account) return [];
  const rows = await db.query.performancePropertyTable.findMany({
    where: and(
      eq(performancePropertyTable.accountId, account.id),
      isNull(performancePropertyTable.deletedAt),
    ),
    columns: { siteUrl: true },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
  return rows.flatMap((row) => (row.siteUrl ? [row.siteUrl] : []));
}

/**
 * The campaign shells land in, when one is named: this brand's, and not yet
 * on a platform, since an ad added to a pushed campaign would never be sent.
 */
async function campaignFor(brandId: string, campaignId: string) {
  const campaign = await db.query.campaignTable.findFirst({
    where: and(
      eq(campaignTable.id, campaignId),
      eq(campaignTable.brandId, brandId),
      isNull(campaignTable.deletedAt),
    ),
    columns: { id: true, name: true },
    with: { platformCampaigns: { columns: { externalId: true } } },
  });
  if (!campaign) throw new AdSetError(404, "Campaign not found on this brand");
  if (campaign.platformCampaigns.some((row) => row.externalId)) {
    throw new AdSetError(
      422,
      "That campaign is already on a platform; add ads to a new one",
    );
  }
  return campaign;
}

/**
 * The home an ad is about, from a listing when their site has one, or from
 * a name alone when it does not. A brand whose WanderOS site is not
 * connected yet still gets its ads filed by home; the listing takes over
 * once the site is read.
 */
async function homeBinding(
  brand: OwnedBrand,
  input: { propertyId?: string | null; homeName?: string | null },
) {
  if (input.propertyId) {
    const listing = await listingFor(brand, input.propertyId);
    const home = await ensureHome({ brandId: brand.id, listing });
    return { home, name: listing.name, url: listing.url as string | null };
  }
  return { home: null, name: input.homeName?.trim() || null, url: null };
}

/** The listing behind a WanderOS id, or 422 when it is not on their site. */
async function listingFor(brand: OwnedBrand, propertyId: string) {
  const listings = await brandListings({
    id: brand.id,
    website: brand.website,
  });
  const listing = listings.find((row) => row.id === propertyId);
  if (!listing) throw new AdSetError(422, "That home is not on their site");
  return listing;
}

/** The library asset as a card, or 422 when it is not this brand's to use. */
async function cardFromAsset(brandId: string, mediaAssetId: string) {
  const asset = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.id, mediaAssetId),
      eq(mediaAssetTable.brandId, brandId),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: {
      id: true,
      url: true,
      thumbnailUrl: true,
      width: true,
      height: true,
      kind: true,
      filename: true,
      title: true,
      metadata: true,
    },
  });
  if (!asset?.url) {
    throw new AdSetError(
      422,
      "That library asset is not available for this brand",
    );
  }
  const derivedFrom =
    (
      asset.metadata as {
        composition?: { sourceMediaAssetId?: string | null };
      } | null
    )?.composition?.sourceMediaAssetId ?? undefined;
  const item: MediaItem = {
    url: asset.url,
    type: asset.kind === "video" ? "video" : "image",
    assetId: asset.id,
    ...(asset.thumbnailUrl ? { thumbnail: asset.thumbnailUrl } : {}),
    ...(asset.width && asset.height
      ? { width: asset.width, height: asset.height }
      : {}),
    ...(derivedFrom ? { derivedFrom } : {}),
  };
  return {
    item,
    name: asset.title ?? asset.filename ?? null,
    // The name the file arrived with, which is what the export convention
    // is read from. The stored filename is slugified for the object key, so
    // the title is where the original spelling survives.
    filename: asset.title ?? asset.filename ?? null,
  };
}

const STORY = getCompositionFormat("story");

/**
 * A built set's cards are the Studio's preview route with the spec in the
 * URL, not frozen files. Their 9:16 is the same spec on the story canvas,
 * which is one parameter away and needs no render here.
 */
export function storyTwinOfPreview(url: string): string | null {
  try {
    const parsed = new URL(url, "http://local");
    if (!parsed.pathname.endsWith("/api/compositions/preview")) return null;
    parsed.searchParams.set("formatId", "story");
    return url.startsWith("/")
      ? `${parsed.pathname}?${parsed.searchParams.toString()}`
      : parsed.toString();
  } catch {
    return null;
  }
}

/**
 * The 9:16 for one card, derived from its baseline.
 *
 * The best method available wins unless one is asked for by name: a card
 * that came out of our composition pipeline is rendered again on the story
 * canvas, so the type is set fresh rather than stretched; a finished upload
 * is extended past its edges by the outpaint, which keeps everything the
 * designer placed and adds sky and ground; a plain crop is the fallback, or
 * the explicit choice when the edges are what should go.
 */
async function deriveStory(input: {
  brand: OwnedBrand;
  userId: string;
  card: AdCard;
  how: "auto" | "crop" | "extend" | "render";
  home: string | null;
}): Promise<AdPlacementVariant> {
  const { brand, card } = input;
  if (card.type === "video") {
    throw new AdSetError(
      422,
      "A story cut of a video is uploaded, not derived",
    );
  }
  // A card drawn by the preview route is re-drawn on the story canvas by
  // changing one parameter; nothing to render or store.
  const twin = storyTwinOfPreview(card.url);
  if (twin && (input.how === "auto" || input.how === "render")) {
    return {
      url: twin,
      type: "image",
      width: STORY.width,
      height: STORY.height,
      via: "render",
    };
  }
  const asset = card.assetId
    ? await db.query.mediaAssetTable.findFirst({
        where: eq(mediaAssetTable.id, card.assetId),
        columns: { id: true, url: true, metadata: true },
      })
    : null;
  const composition = (
    asset?.metadata as { composition?: Record<string, unknown> } | null
  )?.composition;

  const asVariant = (
    made: { id: string; url: string | null; thumbnailUrl?: string | null },
    via: AdPlacementVariant["via"],
  ): AdPlacementVariant => {
    if (!made.url) throw new AdSetError(422, "The story file has no URL yet");
    return {
      url: made.url,
      type: "image",
      assetId: made.id,
      ...(made.thumbnailUrl ? { thumbnail: made.thumbnailUrl } : {}),
      width: STORY.width,
      height: STORY.height,
      ...(card.assetId ? { derivedFrom: card.assetId } : {}),
      via,
    };
  };

  // Render: the composition drawn again on the story canvas.
  if ((input.how === "auto" || input.how === "render") && composition) {
    const spec = freezeCompositionSchema.safeParse({
      ...composition,
      brandId: brand.id,
      formatId: "story",
      assetTitle: `${
        typeof composition.title === "string" && composition.title
          ? composition.title
          : (input.home ?? brand.name)
      } · Story`,
    });
    if (spec.success) {
      const made = await freezeComposition({
        userId: input.userId,
        spec: spec.data,
      });
      return asVariant(made, "render");
    }
    if (input.how === "render") {
      throw new AdSetError(
        422,
        "This card's composition cannot be re-rendered",
      );
    }
  }

  // Extend: more of the same scene above and below, via the outpaint.
  if (input.how === "auto" || input.how === "extend") {
    if (isGeminiImageConfigured && asset?.url) {
      try {
        const made = await extendToCanvas({
          brandId: brand.id,
          userId: input.userId,
          source: { id: asset.id, url: asset.url },
          formatId: "story",
          home: input.home ?? brand.name,
        });
        return asVariant(made, "extend");
      } catch (error) {
        if (input.how === "extend") {
          throw new AdSetError(
            422,
            error instanceof Error
              ? error.message
              : "The photo could not be extended",
          );
        }
        console.error("story extend failed, cropping instead", error);
      }
    } else if (input.how === "extend") {
      throw new AdSetError(422, "Photo extension is not configured here");
    }
  }

  // Crop: the baseline covered onto the story canvas, centred.
  const response = await fetch(card.url, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new AdSetError(
      422,
      `The baseline could not be read (${response.status})`,
    );
  }
  const bytes = await sharp(Buffer.from(await response.arrayBuffer()))
    .resize(STORY.width, STORY.height, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  const made = await importImageBuffer({
    brandId: brand.id,
    uploadedBy: input.userId,
    body: bytes,
    contentType: "image/png",
    filename: "story-crop.png",
    title: `${input.home ?? brand.name} · Story crop`,
    width: STORY.width,
    height: STORY.height,
    metadata: {
      croppedFrom: card.assetId ?? card.url,
      aspectRatio: "9:16",
    },
  });
  return asVariant(made, "crop");
}

/** The house name for one ad, from its format and the home it is about. */
function adName(
  brand: OwnedBrand,
  format: AdFormat,
  propertyName: string | null,
) {
  return performanceAdName({
    customer: brand.name,
    isClient: brand.relationship === "client",
    format: performanceFormatFor(format),
    // The convention names a catalog ad by what it is; everything else by
    // its home, or the brand when it has none.
    propertyName:
      propertyName ?? (format === "catalog" ? "Catalog" : brand.name),
  });
}

/**
 * Draw the whole set for a brand, words and all.
 *
 * Asked for by naming the homes (`propertyIds`, in portfolio order) or by
 * naming a count, in which case the homes on the client's record come first
 * and their site's own order fills the rest. One model call writes every
 * caption together so the homes do not repeat each other. Cards are
 * composition URLs rather than frozen files: they redraw when a template
 * improves, and nothing is committed to bytes until the set is approved or
 * pushed.
 */
export async function buildAdSet(input: {
  brandId: string;
  orgId: string;
  /** WanderOS listing ids, in the order the portfolio carousel should run. */
  propertyIds?: string[];
  /** How many homes to choose when none are named. */
  count?: number;
  userId?: string | null;
}): Promise<{
  brandId: string;
  ads: BuiltAd[];
  replaced: number;
  /** The homes the set was drawn from, in order. */
  homes: { id: string; name: string; url: string }[];
  /** How the homes were chosen, for the operator to read. */
  note: string | null;
}> {
  const brand = await requireOwnedBrand(input);
  const listings = await brandListings({
    id: brand.id,
    website: brand.website,
  });

  let chosen: WanderOsListing[];
  let note: string | null = null;
  if (input.propertyIds?.length) {
    chosen = input.propertyIds.flatMap((id) => {
      const listing = listings.find((row) => row.id === id);
      return listing ? [listing] : [];
    });
    if (chosen.length === 0) {
      throw new AdSetError(422, "None of those homes are on their site");
    }
  } else {
    const count = Math.min(
      Math.max(input.count ?? DEFAULT_SET_SIZE, 1),
      MAX_SET_HOMES,
    );
    const onRecord = await onRecordHomeUrls(brand.id);
    chosen = orderHomesForSet(listings, onRecord, count);
    if (chosen.length === 0) {
      throw new AdSetError(
        422,
        listings.length === 0
          ? "No homes on their site to draw from"
          : "None of their homes have a photo to draw on",
      );
    }
    const fromRecord = chosen.filter((home) =>
      onRecord.some(
        (url) =>
          url.trim().toLowerCase().replace(/\/+$/, "") ===
          home.url.trim().toLowerCase().replace(/\/+$/, ""),
      ),
    ).length;
    note =
      fromRecord > 0
        ? `${fromRecord} of ${chosen.length} homes are the ones on their Performance record; the rest follow their site's order.`
        : `Chose the first ${chosen.length} homes with a photo in their site's own order.`;
  }

  // The detail endpoint is what carries amenities and the full gallery; the
  // search feed the roster uses carries neither.
  const websiteId = await brandWebsiteId(brand.id);
  const details = await Promise.all(
    chosen.map(async (listing) => {
      const detail = websiteId
        ? await fetchWanderOsListingDetail({
            websiteId,
            propertyId: listing.id,
          })
        : { photos: [], description: null, amenities: [] };
      const home = await ensureHome({ brandId: brand.id, listing });
      const photos = detail.photos.length
        ? detail.photos.map((photo) => photo.url)
        : (listing.gallery ?? []).map((photo) => photo.url);
      // A home's own hero wins over the feed's first photo when one is picked.
      const hero = home.heroSourceUrl ?? photos[0] ?? listing.imageUrl ?? null;
      return { listing, home, detail, photos, hero };
    }),
  );
  const usable = details.filter((row) => row.hero);
  if (usable.length === 0) {
    throw new AdSetError(422, "None of those homes have a photo to draw on");
  }

  const copy = await writeAdSetCopy({
    brandName: brand.name,
    homes: usable.map(({ listing, detail }): CopyHome => ({
      name: listing.name,
      place: [listing.city, listing.state].filter(Boolean).join(", "),
      bedrooms: listing.bedrooms ?? null,
      bathrooms: listing.bathrooms ?? null,
      guests: listing.guests ?? null,
      nightlyFrom: listing.nightlyFrom ?? null,
      amenities: detail.amenities,
      description: detail.description,
    })),
  });

  const plan = buildPerformanceAdPlan({
    customer: brand.name,
    properties: usable.map(({ listing }) => ({
      name: listing.name,
      url: listing.url,
    })),
  });

  /** The card with its story twin riding on it, when the card is a preview. */
  const withStory = (base: MediaItem): AdCard => {
    const twin = storyTwinOfPreview(base.url);
    return twin
      ? {
          ...base,
          story: {
            url: twin,
            type: "image",
            width: STORY.width,
            height: STORY.height,
            via: "render",
          },
        }
      : base;
  };

  /** A card: the composition that draws it, redrawn on read. */
  const card = (
    sourceUrl: string,
    title: string,
    subtitle?: string,
  ): MediaItem => ({
    url: homeCatalogPreviewUrl({
      brandId: brand.id,
      source: { url: sourceUrl },
      formatId: "square",
      copy: {
        eyebrow: brand.name,
        title,
        subtitle: subtitle ?? "",
        rating: null,
      },
    }),
    type: "image",
  });

  // A rebuild replaces the last set rather than stacking a second one beside
  // it. Anything already approved or attached to a campaign is left alone.
  const stale = await db.query.adTable.findMany({
    where: and(eq(adTable.brandId, brand.id), isNull(adTable.campaignId)),
    columns: { id: true, status: true },
  });
  const replaceable = stale.filter((ad) => ad.status !== "approved");
  if (replaceable.length > 0) {
    // `ad` has no soft delete, and a replaced draft is not history worth
    // keeping: it was never on a platform and nobody approved it.
    await db.delete(adTable).where(
      inArray(
        adTable.id,
        replaceable.map((ad) => ad.id),
      ),
    );
  }

  const built: BuiltAd[] = [];
  for (const item of plan) {
    const index = item.propertyIndex;
    const home = index != null ? usable[index] : null;
    const homeCopy = index != null ? copy.homes[index] : null;
    const format = KIND_FORMAT[item.kind];

    let content: AdCreativeContent;
    if (item.kind === "static" && home && homeCopy) {
      content = {
        format,
        headline: homeCopy.headline,
        body: homeCopy.primaryText,
        linkUrl: home.listing.url,
        callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
        propertyName: home.listing.name,
        // The static is the one shape Meta takes a per-placement asset on,
        // so it is born with its 9:16: the same card on the story canvas.
        media: [withStory(card(home.hero!, homeCopy.cardTitle))],
      };
    } else if (item.kind === "carousel" && home && homeCopy) {
      // One home's own carousel is a walk through its rooms, which is the
      // shape a listing carousel takes and which needs the full gallery.
      const photos = home.photos.slice(0, HOME_CAROUSEL_CARDS);
      content = {
        format,
        headline: homeCopy.headline,
        body: homeCopy.primaryText,
        linkUrl: home.listing.url,
        callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
        propertyName: home.listing.name,
        media: (photos.length >= 2 ? photos : [home.hero!]).map((photo) =>
          card(photo, homeCopy.cardTitle),
        ),
      };
    } else if (item.kind === "all_properties_carousel") {
      content = {
        format,
        headline: copy.portfolioHeadline,
        body: copy.portfolioPrimaryText,
        callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
        media: usable.map(({ hero, listing }, i) =>
          card(hero!, copy.homes[i]?.cardTitle ?? listing.name),
        ),
      };
    } else {
      // The catalog ad's cards are Meta's to render from the product set; the
      // set's own cards stand in so the review shows what it will look like.
      content = {
        format,
        headline: copy.catalogHeadline,
        body: copy.catalogPrimaryText,
        callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
        media: usable.map(({ hero, listing }, i) =>
          card(hero!, copy.homes[i]?.cardTitle ?? listing.name),
        ),
      };
    }

    const [row] = await db
      .insert(adTable)
      .values({
        brandId: brand.id,
        campaignId: null,
        homeId: home?.home.id ?? null,
        name: item.name,
        type: "creative",
        status: "drawn",
        content,
      })
      .returning({ id: adTable.id });

    built.push({
      id: row!.id,
      name: item.name,
      kind: item.kind,
      homeName: home?.listing.name ?? null,
      cards: content.media.length,
    });
  }

  return {
    brandId: brand.id,
    ads: built,
    replaced: replaceable.length,
    homes: usable.map(({ home }) => ({
      id: home.externalId,
      name: home.name,
      url: home.url,
    })),
    note,
  };
}

/** The brand's drafted set, newest build first. */
export async function listAdSet(input: { brandId: string; orgId: string }) {
  const brand = await requireOwnedBrand(input);
  return db.query.adTable.findMany({
    where: and(eq(adTable.brandId, brand.id), isNull(adTable.campaignId)),
    orderBy: (t, { asc }) => asc(t.createdAt),
    with: {
      home: { columns: { id: true, name: true, externalId: true, url: true } },
    },
  });
}

/**
 * An ad with no cards yet: the format is decided, the creative comes later,
 * by upload or from the library, one card at a time. Bound to a home when one
 * is named, which gives it its link, its name and its place on the wall.
 */
export async function addAdShell(input: {
  brandId: string;
  orgId: string;
  format: Extract<AdFormat, "static" | "carousel" | "catalog" | "video">;
  /** A home on their site, by WanderOS listing id. */
  propertyId?: string | null;
  /** A home by name alone, for a brand whose site is not connected. */
  homeName?: string | null;
  /** Land in this campaign rather than on the brand's wall. */
  campaignId?: string | null;
  name?: string | null;
}) {
  const brand = await requireOwnedBrand(input);
  const campaign = input.campaignId
    ? await campaignFor(brand.id, input.campaignId)
    : null;
  const bound = await homeBinding(brand, input);
  const content: AdCreativeContent = {
    format: input.format,
    headline: bound.name ?? brand.name,
    body: "",
    ...(bound.url ? { linkUrl: bound.url } : {}),
    ...(bound.name ? { propertyName: bound.name } : {}),
    callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
    media: [],
  };
  const [row] = await db
    .insert(adTable)
    .values({
      brandId: brand.id,
      campaignId: campaign?.id ?? null,
      homeId: bound.home?.id ?? null,
      name: input.name?.trim() || adName(brand, input.format, bound.name),
      type: "creative",
      status: "drawn",
      content,
    })
    .returning({ id: adTable.id, name: adTable.name });
  return { adId: row!.id, name: row!.name, homeName: bound.name };
}

/**
 * Finished creatives, already in the library, made into ads in one go: one
 * static per file, or one carousel of them all in the order given.
 *
 * The home each ad is about is read off the filename when it follows the
 * export convention and matches a home on their site; a file that names no
 * home makes an ad that waits to be bound, rather than one bound to a guess.
 */
export async function createAdsFromAssets(input: {
  brandId: string;
  orgId: string;
  mediaAssetIds: string[];
  as: "statics" | "carousel";
  /** Bind every ad made here to this home instead of reading the filenames. */
  propertyId?: string | null;
  /** The same, by name, for a brand whose site is not connected. */
  homeName?: string | null;
  /** Land in this campaign rather than on the brand's wall. */
  campaignId?: string | null;
}) {
  const brand = await requireOwnedBrand(input);
  const campaign = input.campaignId
    ? await campaignFor(brand.id, input.campaignId)
    : null;
  if (input.mediaAssetIds.length === 0) {
    throw new AdSetError(422, "Pick at least one file");
  }
  if (input.as === "carousel" && input.mediaAssetIds.length > 10) {
    throw new AdSetError(422, "A carousel holds ten cards");
  }
  const cards = [];
  for (const id of input.mediaAssetIds) {
    cards.push(await cardFromAsset(brand.id, id));
  }
  const listings = await brandListings({
    id: brand.id,
    website: brand.website,
  });
  const byName = new Map(
    listings.map((row) => [row.name.trim().toLowerCase(), row] as const),
  );
  const pinned = input.propertyId
    ? (listings.find((row) => row.id === input.propertyId) ?? null)
    : null;
  if (input.propertyId && !pinned) {
    throw new AdSetError(422, "That home is not on their site");
  }
  // The home a file names, as a listing when their site has it, else as a
  // name alone: a brand off WanderOS still gets its ads filed under the home
  // the filename says, and a file that names none falls back to its own stem
  // so five uploads are not five ads with one name.
  const pinnedName = input.homeName?.trim() || null;
  const homeFor = (filename: string | null) => {
    if (pinned) return { listing: pinned, label: pinned.name };
    if (pinnedName) return { listing: null, label: pinnedName };
    const guess = filename ? homeNameFromFilename(filename) : null;
    const listing = guess
      ? (byName.get(guess.trim().toLowerCase()) ?? null)
      : null;
    const stem = filename?.replace(/\.[a-z0-9]+$/i, "").trim() || null;
    return { listing, label: listing?.name ?? guess ?? stem };
  };

  // Statics pair up by name: a 4:5 and its 9:16 twin differ only in the
  // size, so one static is made with the story riding on its card. A file
  // that arrives alone is a static on its own, whatever its size.
  type Dropped = (typeof cards)[number] & {
    parsed: ReturnType<typeof parseCreativeFilename>;
  };
  const parsedCards: Dropped[] = cards.map((card) => ({
    ...card,
    parsed: parseCreativeFilename(card.filename ?? ""),
  }));
  const groups: {
    format: "static" | "carousel";
    cards: Dropped[];
    story?: Dropped;
    headline?: string | null;
  }[] =
    input.as === "statics"
      ? [...new Set(parsedCards.map((card) => card.parsed.pairKey))].map(
          (key) => {
            const twins = parsedCards.filter(
              (card) => card.parsed.pairKey === key,
            );
            const story = twins.find(
              (card) => card.parsed.placement === "story",
            );
            const base = twins.find((card) => card !== story) ?? story!;
            return {
              format: "static" as const,
              cards: [base],
              story: story && story !== base ? story : undefined,
              headline: base.parsed.headline,
            };
          },
        )
      : [
          {
            format: "carousel" as const,
            cards: parsedCards,
            headline: parsedCards[0]?.parsed.headline,
          },
        ];

  const created: { adId: string; name: string; homeName: string | null }[] = [];
  for (const group of groups) {
    const { listing, label } = homeFor(group.cards[0]?.name ?? null);
    const home = listing
      ? await ensureHome({ brandId: brand.id, listing })
      : null;
    // A video is its own format; a still in the same batch stays what it was.
    const format =
      group.cards.length === 1 && group.cards[0]!.item.type === "video"
        ? ("video" as const)
        : group.format;
    const guessedHome = !listing && label && label !== group.cards[0]?.name;
    const content: AdCreativeContent = {
      format,
      headline: group.headline ?? label ?? brand.name,
      body: "",
      ...(listing ? { linkUrl: listing.url, propertyName: listing.name } : {}),
      // A home named by the file but not on any feed we can read still files
      // the ad under that name on the wall.
      ...(guessedHome ? { propertyName: label } : {}),
      callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
      media: group.cards.map((card, index) => ({
        ...card.item,
        ...(index === 0 && group.story
          ? { story: { ...group.story.item, via: "upload" as const } }
          : {}),
      })),
    };
    const [row] = await db
      .insert(adTable)
      .values({
        brandId: brand.id,
        campaignId: campaign?.id ?? null,
        homeId: home?.id ?? null,
        name: adName(brand, format, label),
        type: "creative",
        status: "drawn",
        content,
      })
      .returning({ id: adTable.id, name: adTable.name });
    created.push({
      adId: row!.id,
      name: row!.name,
      homeName: listing?.name ?? (guessedHome ? label : null),
    });
  }
  return { brandId: brand.id, ads: created };
}

/**
 * Bind an ad to a home, or unbind it.
 *
 * The binding is what the rest follows from: the link goes to that home's
 * page, the name carries the home, and the wall files the ad under it. A
 * link someone typed by hand is kept; one that pointed at the previous home
 * moves with the binding.
 */
export async function setAdHome(input: {
  adId: string;
  orgId: string;
  /** A home on their site; neither field set unbinds. */
  propertyId?: string | null;
  /** A home by name alone, for a brand whose site is not connected. */
  homeName?: string | null;
}) {
  const ad = await requireOwnedAd(input);
  const content = creativeContent(ad);
  const brand = ad.brand;
  const bound = await homeBinding(brand, input);
  const { home } = bound;

  const previousHome = ad.homeId
    ? await db.query.homeTable.findFirst({
        where: (t, { eq }) => eq(t.id, ad.homeId!),
        columns: { url: true },
      })
    : null;
  const linkWasHome = !content.linkUrl || content.linkUrl === previousHome?.url;
  const format = adFormatOf(content);
  const next: AdCreativeContent = { ...content };
  if (bound.name) next.propertyName = bound.name;
  else delete next.propertyName;
  if (linkWasHome) {
    if (bound.url) next.linkUrl = bound.url;
    else delete next.linkUrl;
  }
  // A name in the convention follows the home; a hand-typed one is kept.
  const name = ad.name.startsWith("META_")
    ? adName(brand, format, bound.name)
    : ad.name;

  await db
    .update(adTable)
    .set({ homeId: home?.id ?? null, name, content: next })
    .where(eq(adTable.id, ad.id));
  return { adId: ad.id, name, homeName: bound.name };
}

/**
 * One change to an ad's cards: a library asset into a slot, onto the end,
 * or a card out or moved. Uploads reach here as library assets, so nothing
 * an ad shows is ever outside the library.
 */
export async function editAdCards(input: {
  adId: string;
  orgId: string;
  /** Who is deriving; a story made by crop, extend or render is filed under them. */
  userId?: string | null;
  edit:
    | { op: "replace"; index: number; mediaAssetId: string }
    | { op: "append"; mediaAssetId: string }
    | { op: "remove"; index: number }
    | { op: "move"; index: number; to: number }
    | { op: "setStory"; index: number; mediaAssetId: string }
    | { op: "clearStory"; index: number }
    | {
        op: "makeStory";
        index: number;
        how?: "auto" | "crop" | "extend" | "render";
      };
}) {
  const ad = await requireOwnedAd(input);
  const content = creativeContent(ad);
  const brand = ad.brand;
  const cardAt = (index: number) => {
    const card = content.media[index];
    if (!card) {
      throw new AdSetError(
        422,
        `This ad has ${content.media.length} card${content.media.length === 1 ? "" : "s"}; there is no card ${index + 1}`,
      );
    }
    return card;
  };

  // The story variants ride on a card and are not cards themselves, so they
  // are handled here rather than through the card rules.
  if (
    input.edit.op === "setStory" ||
    input.edit.op === "clearStory" ||
    input.edit.op === "makeStory"
  ) {
    const index = input.edit.index;
    const card = cardAt(index);
    let story: AdPlacementVariant | undefined;
    if (input.edit.op === "setStory") {
      const picked = await cardFromAsset(brand.id, input.edit.mediaAssetId);
      if (picked.item.type === "video") {
        throw new AdSetError(
          422,
          "A story variant is an image; a video ad takes one clip",
        );
      }
      story = { ...picked.item, via: "upload" };
    } else if (input.edit.op === "makeStory") {
      if (!input.userId) {
        throw new AdSetError(422, "Deriving a story needs a signed-in user");
      }
      story = await deriveStory({
        brand,
        userId: input.userId,
        card,
        how: input.edit.how ?? "auto",
        home: content.propertyName ?? null,
      });
    }
    const media: AdCard[] = [...content.media];
    const { story: _dropped, ...base } = card;
    media[index] = story ? { ...base, story } : base;
    await db
      .update(adTable)
      .set({ content: { ...content, media } })
      .where(eq(adTable.id, ad.id));
    return { adId: ad.id, cards: media.length, story: story ?? null };
  }

  let edit: CardEdit<AdCard>;
  switch (input.edit.op) {
    case "replace":
      edit = {
        op: "replace",
        index: input.edit.index,
        item: (await cardFromAsset(brand.id, input.edit.mediaAssetId)).item,
      };
      break;
    case "append":
      edit = {
        op: "append",
        item: (await cardFromAsset(brand.id, input.edit.mediaAssetId)).item,
      };
      break;
    default:
      edit = input.edit;
  }
  let media: AdCard[];
  try {
    media = applyCardEdit(content, edit);
  } catch (error) {
    throw new AdSetError(
      422,
      error instanceof Error ? error.message : "That change is not allowed",
    );
  }
  await db
    .update(adTable)
    .set({ content: { ...content, media } })
    .where(eq(adTable.id, ad.id));
  return { adId: ad.id, cards: media.length, story: null };
}

/**
 * Put drafted ads into a campaign: the named ones, or every approved draft
 * of the brand. This is the one field that turns a reviewed set into
 * something the push can send.
 */
export async function attachAdSet(input: {
  brandId: string;
  orgId: string;
  campaignId: string;
  adIds?: string[];
}) {
  const brand = await requireOwnedBrand(input);
  const campaign = await db.query.campaignTable.findFirst({
    where: and(
      eq(campaignTable.id, input.campaignId),
      eq(campaignTable.brandId, brand.id),
      isNull(campaignTable.deletedAt),
    ),
    columns: { id: true, name: true },
  });
  if (!campaign) throw new AdSetError(404, "Campaign not found on this brand");
  const drafts = await db.query.adTable.findMany({
    where: and(eq(adTable.brandId, brand.id), isNull(adTable.campaignId)),
    columns: { id: true, status: true, content: true, name: true },
  });
  const wanted = input.adIds?.length
    ? drafts.filter((ad) => input.adIds!.includes(ad.id))
    : drafts.filter((ad) => ad.status === "approved");
  if (wanted.length === 0) {
    throw new AdSetError(
      422,
      input.adIds?.length
        ? "None of those ads are drafts on this brand"
        : "No approved drafts to attach. Approve the ads that should run first.",
    );
  }
  const empty = wanted.filter(
    (ad) =>
      "media" in (ad.content as object) &&
      (ad.content as AdCreativeContent).media.length === 0,
  );
  if (empty.length > 0) {
    throw new AdSetError(
      422,
      `${empty.length} ad${empty.length === 1 ? " has" : "s have"} no creative yet: ${empty
        .map((ad) => ad.name)
        .join(", ")}`,
    );
  }
  await db
    .update(adTable)
    .set({ campaignId: campaign.id })
    .where(
      inArray(
        adTable.id,
        wanted.map((ad) => ad.id),
      ),
    );
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    attached: wanted.length,
  };
}

/** Remove one ad: a draft outright, a campaign ad through its own guard. */
export async function deleteAd(input: { adId: string; orgId: string }) {
  const ad = await requireOwnedAd(input);
  if (ad.campaignId) {
    return deleteDraftAd({ adId: ad.id, organizationId: input.orgId });
  }
  await db.delete(adTable).where(eq(adTable.id, ad.id));
  return { deleted: true };
}

/** Approve one ad, or put it back. Approved is what survives a rebuild. */
export async function setAdStatus(input: {
  adId: string;
  orgId: string;
  status: "drawn" | "approved";
}) {
  const ad = await requireOwnedAd(input);
  await db
    .update(adTable)
    .set({ status: input.status })
    .where(eq(adTable.id, ad.id));
  return { adId: ad.id, status: input.status };
}

/** Replace the words on one ad, leaving its cards alone. */
export async function setAdCopy(input: {
  adId: string;
  orgId: string;
  headline?: string;
  body?: string;
}) {
  const ad = await requireOwnedAd(input);
  const content = creativeContent(ad);
  await db
    .update(adTable)
    .set({
      content: {
        ...content,
        headline: input.headline ?? content.headline,
        body: input.body ?? content.body,
      },
    })
    .where(eq(adTable.id, ad.id));
  return { adId: ad.id };
}
