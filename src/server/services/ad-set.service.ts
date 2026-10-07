import type { adSectionSchema } from "@/lib/ad-section";
import { resolveBookingTarget } from "./home-groups.service";
import type { z } from "zod";
import { textAdCopySchema, textAdReady } from "@/lib/ad-authoring";
import { projectIdea, type IdeaShape } from "@/lib/ad-idea-studio";
import {
  approveImageAd,
  assertAdNotPushed,
  freezeApprovedAd,
  retireReplacedAd,
} from "./ad-approval.service";
import "server-only";
import { withIdeaStudio } from "@/lib/ad-idea-studio";
import { waitUntil } from "@vercel/functions";

import { type BrandMarkets } from "@/lib/markets";

import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";

import {
  adTable,
  platformAdTable,
  brandTable,
  campaignTable,
  homeTable,
  mediaAssetTable,
} from "@/server/db/schema";
import sharp from "sharp";

import type {
  AdCard,
  AdCreativeContent,
  AdPlacements,
  AdPlacementVariant,
  AdTextContent,
} from "@/server/db/ads-schema";
import type { MediaItem } from "@/server/db/content-schema";
import type { ChannelPlatform } from "@/server/db/schema";
import { placementSpec, resolveCell, withTitle } from "@/lib/ad-placements";
import {
  asPlacements,
  type CopyPatch,
  withCard,
  withCopy,
  withFrozen,
  withoutKey,
  withUnfrozen,
} from "@/lib/ad-placement-edits";
import { db, withTransaction } from "@/server/db";
import { isGeminiImageConfigured } from "@/server/clients/gemini-image.client";
import {
  freezeCompositionSchema,
  getCompositionFormat,
} from "@/lib/compositions";
import {
  adFormatOf,
  homeNameFromFilename,
  parseCreativeFilename,
  performanceAdName,
  performanceFormatFor,
  PERFORMANCE_AD_DEFAULTS,
  type AdFormat,
} from "@/lib/performance-ads";

import { deleteZernioAd } from "@/server/clients/zernio.client";
import { extendToCanvas } from "./card-director.service";
import { freezeComposition } from "./composition.service";

import { importImageBuffer } from "./media.service";

import { studioListings } from "./studio-homes.service";

import {
  deliveryMediaFor,
  videoAdCardFor,
} from "@/server/services/video-delivery.service";

export class AdSetError extends Error {
  constructor(
    public status: 404 | 422,
    message: string,
  ) {
    super(message);
  }
}

type OwnedBrand = {
  id: string;
  name: string;
  website: string | null;
  story: string | null;
  relationship: string | null;
  markets?: BrandMarkets | null;
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
    columns: {
      id: true,
      name: true,
      website: true,
      relationship: true,
      story: true,
      markets: true,
    },
  });
  if (!brand) throw new AdSetError(404, "Brand not found");
  return brand;
}

/** An ad with its brand, or 404 when it is not this organization's. */
async function requireOwnedAd(
  input: { adId: string; orgId: string },
  allowStudio = false,
) {
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
          story: true,
        },
      },
    },
  });
  if (!ad || ad.brand?.organizationId !== input.orgId) {
    throw new AdSetError(404, "Ad not found");
  }
  if (!allowStudio && ad.status === "approved")
    throw new AdSetError(
      422,
      "Approved ads are final. Edit it to make a draft that replaces it.",
    );
  if (!allowStudio && "media" in ad.content && ad.content.ideaStudio) {
    throw new AdSetError(
      422,
      "This ad uses the mini studio. Edit it in the ad Details view or use saveIdea to preserve its editable composition.",
    );
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

/** Bind an ad to a saved home, or keep a name-only idea unbound. */
async function homeBinding(
  brand: OwnedBrand,
  input: { propertyId?: string | null; homeName?: string | null },
) {
  if (input.propertyId) {
    const listing = await listingFor(brand, input.propertyId);
    const home = await savedHomeFor(brand.id, listing.id);
    return { home, name: listing.name, url: listing.url as string | null };
  }
  return { home: null, name: input.homeName?.trim() || null, url: null };
}

/** The saved listing behind an external id, scoped to this brand. */
async function listingFor(brand: OwnedBrand, propertyId: string) {
  const listings = await studioListings({
    id: brand.id,
    website: brand.website,
  });
  const listing = listings.find((row) => row.id === propertyId);
  if (!listing)
    throw new AdSetError(422, "That home is not in the saved inventory");
  return listing;
}

/** Resolve identity inside the same saved inventory used by the picker. */
async function savedHomeFor(brandId: string, externalId: string) {
  const home = await db.query.homeTable.findFirst({
    where: and(
      eq(homeTable.brandId, brandId),
      eq(homeTable.externalId, externalId),
      isNull(homeTable.deletedAt),
    ),
  });
  if (!home)
    throw new AdSetError(422, "That home is not in the saved inventory");
  return home;
}

/** The library asset as a card, or 422 when it is not this brand's to use. */
async function cardFromAsset(brandId: string, mediaAssetId: string) {
  const asset = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.id, mediaAssetId),
      eq(mediaAssetTable.brandId, brandId),
      eq(mediaAssetTable.status, "ready"),
      eq(mediaAssetTable.reviewStatus, "approved"),
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
    const cut = await videoAdCardFor(card);
    if (!cut?.story) {
      throw new AdSetError(
        422,
        "This video has no 9:16 rendition. Upload a vertical cut, or wait for its renditions to finish.",
      );
    }
    return cut.story;
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

/** The full brand collection, including ads assigned to campaigns. */
export async function listAdSet(input: { brandId: string; orgId: string }) {
  const brand = await requireOwnedBrand(input);
  return db.query.adTable.findMany({
    where: eq(adTable.brandId, brand.id),
    orderBy: (t, { asc }) => asc(t.createdAt),
    with: {
      campaign: { columns: { id: true, name: true } },
      platformAds: {
        columns: { id: true },
        with: { platformCampaign: { columns: { externalId: true } } },
      },
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
  linkUrl?: string;
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
    ...((input.linkUrl ?? bound.url)
      ? { linkUrl: input.linkUrl ?? bound.url! }
      : {}),
    ...(bound.name ? { propertyName: bound.name } : {}),
    callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
    media: [],
  };
  const [row] = await db
    .insert(adTable)
    .values(
      withIdeaStudio({
        brandId: brand.id,
        campaignId: campaign?.id ?? null,
        homeId: bound.home?.id ?? null,
        name: input.name?.trim() || adName(brand, input.format, bound.name),
        type: "creative" as const,
        status: "drawn" as const,
        content,
      }),
    )
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
  const listings = await studioListings({
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
    throw new AdSetError(422, "That home is not in the saved inventory");
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
    const home = listing ? await savedHomeFor(brand.id, listing.id) : null;
    // A video is its own format; a still in the same batch stays what it was.
    const format =
      group.cards.length === 1 && group.cards[0]!.item.type === "video"
        ? ("video" as const)
        : group.format;
    const guessedHome = !listing && label && label !== group.cards[0]?.name;
    // A library video brings its own 4:5 feed card and 9:16 story.
    const videoCard =
      format === "video" && !group.story
        ? await videoAdCardFor(group.cards[0]!.item)
        : null;
    const content: AdCreativeContent = {
      format,
      headline: group.headline ?? label ?? brand.name,
      body: "",
      ...(listing ? { linkUrl: listing.url, propertyName: listing.name } : {}),
      // A home named by the file but not on any feed we can read still files
      // the ad under that name on the wall.
      ...(guessedHome ? { propertyName: label } : {}),
      callToAction: PERFORMANCE_AD_DEFAULTS.callToAction,
      media: videoCard
        ? [videoCard]
        : group.cards.map((card, index) => ({
            ...card.item,
            ...(index === 0 && group.story
              ? { story: { ...group.story.item, via: "upload" as const } }
              : {}),
          })),
    };
    const [row] = await db
      .insert(adTable)
      .values(
        withIdeaStudio({
          brandId: brand.id,
          campaignId: campaign?.id ?? null,
          homeId: home?.id ?? null,
          name: adName(brand, format, label),
          type: "creative" as const,
          status: "drawn" as const,
          content,
        }),
      )
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
  const ad = await requireOwnedAd(input, true);
  await assertAdNotPushed(ad.id);
  const content = creativeContent(ad);
  if (ad.status === "approved" || content.ideaStudio?.approval)
    throw new Error(
      "Approved ads are final. Edit it to make a draft that replaces it.",
    );
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

  const studio = next.ideaStudio;
  const projected = studio
    ? projectIdea(
        ad.brandId,
        next,
        {
          document: {
            ...studio.document,
            copy: { ...studio.document.copy, linkUrl: next.linkUrl ?? "" },
          },
        },
        ad.placements,
      )
    : { content: next };
  const [saved] = await db
    .update(adTable)
    .set({
      homeId: home?.id ?? null,
      name,
      ...projected,
      updatedAt: new Date(),
    })
    .where(and(eq(adTable.id, ad.id), eq(adTable.updatedAt, ad.updatedAt)))
    .returning({ id: adTable.id });
  if (!saved)
    throw new Error(
      "This ad changed elsewhere. Reload before changing its home.",
    );
  return { adId: ad.id, name, homeName: bound.name };
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
  const campaign = await campaignFor(brand.id, input.campaignId);
  const draftsQuery = () =>
    db.query.adTable.findMany({
      where: and(eq(adTable.brandId, brand.id), isNull(adTable.campaignId)),
      columns: { id: true, status: true, content: true, name: true },
    });
  const pick = (rows: Awaited<ReturnType<typeof draftsQuery>>) =>
    input.adIds?.length
      ? rows.filter((ad) => input.adIds!.includes(ad.id))
      : rows.filter((ad) => ad.status === "approved");
  // An idea approved before the studio froze on approval has no images yet;
  // save them now so it arrives with its media.
  let drafts = await draftsQuery();
  if (
    input.adIds &&
    (input.adIds.length === 0 ||
      new Set(input.adIds).size !== input.adIds.length ||
      input.adIds.some((id) => !drafts.some((ad) => ad.id === id)))
  ) {
    throw new AdSetError(
      422,
      "Choose unassigned ads from this brand. Reload if their assignment changed.",
    );
  }
  let frozeAny = false;
  for (const ad of pick(drafts)) {
    if (await freezeApprovedAd(ad.id)) frozeAny = true;
  }
  if (frozeAny) drafts = await draftsQuery();
  const wanted = pick(drafts);
  if (input.adIds && wanted.length !== input.adIds.length) {
    throw new AdSetError(
      422,
      "An ad was assigned elsewhere. Reload before trying again.",
    );
  }
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
  if (
    empty.length > 0 &&
    (!input.adIds?.length || empty.some((ad) => ad.status === "approved"))
  ) {
    throw new AdSetError(
      422,
      `${empty.length} ad${empty.length === 1 ? " has" : "s have"} no creative yet: ${empty
        .map((ad) => ad.name)
        .join(", ")}`,
    );
  }
  // A concurrent attachment must fail as a whole rather than move ads out
  // of another campaign or leave a partially assigned selection.
  await withTransaction(async (tx) => {
    const assigned = await tx
      .update(adTable)
      .set({ campaignId: campaign.id })
      .where(
        and(
          eq(adTable.brandId, brand.id),
          isNull(adTable.campaignId),
          inArray(
            adTable.id,
            wanted.map((ad) => ad.id),
          ),
        ),
      )
      .returning({ id: adTable.id });
    if (assigned.length !== wanted.length) {
      throw new AdSetError(
        422,
        "An ad was assigned elsewhere. Reload before trying again.",
      );
    }
  });
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    attached: wanted.length,
  };
}

/** Remove one ad: a draft outright, a campaign ad through its own guard. */
/** Platform statuses after which an ad no longer exists on the platform. */
const GONE_ON_PLATFORM = ["deleted", "removed", "cancelled", "canceled"];

/**
 * Delete an ad, wherever it is. One that is live on a platform is deleted
 * there first, so the two never disagree; its `platform_ad` rows stay as the
 * record of what ran, with their stats, marked deleted. Nothing blocks
 * deletion: an ad already gone from the platform is simply removed here.
 */
export async function deleteAd(input: { adId: string; orgId: string }) {
  const ad = await requireOwnedAd(input, true);
  const ran = await db.query.platformAdTable.findMany({
    where: and(
      eq(platformAdTable.adId, ad.id),
      isNotNull(platformAdTable.externalId),
    ),
    columns: { id: true, externalId: true, status: true },
  });
  for (const row of ran) {
    if (GONE_ON_PLATFORM.includes((row.status ?? "").toLowerCase())) continue;
    // Zernio takes the platform's own ad id here and deletes it on Meta.
    await deleteZernioAd(row.externalId!).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      // Already gone on the platform is the outcome we wanted.
      if (!/\b404\b|not found/i.test(message)) throw error;
    });
    await db
      .update(platformAdTable)
      .set({ status: "deleted" })
      .where(eq(platformAdTable.id, row.id));
  }
  await db.delete(adTable).where(eq(adTable.id, ad.id));
  return { deleted: true, deletedOnPlatform: ran.length };
}

/**
 * Move an ad along draft → ready → approved. Ready is its author saying it is
 * done; any edit sends it back to draft (a database trigger). Approved is
 * final: the images are saved in the background and the ad never changes
 * again. To change an approved ad, `editApprovedAd` makes the draft that
 * replaces it, and approving that draft retires the original.
 */
export async function setAdStatus(input: {
  adId: string;
  orgId: string;
  status: "drawn" | "ready" | "approved";
  userId?: string;
  expectedUpdatedAt?: string;
  exportShapes?: IdeaShape[];
}) {
  const ad = await requireOwnedAd(input, true);
  if (ad.status === "approved") {
    if (input.status === "approved") {
      // A retry finishes a retirement an earlier approval did not.
      const retired = await retireReplacedAd(ad.id);
      return {
        adId: ad.id,
        status: "approved" as const,
        ...(retired.retired ? { replaced: retired.retired } : {}),
      };
    }
    throw new AdSetError(
      422,
      "Approved ads are final. Edit it to make a draft that replaces it.",
    );
  }
  if (input.status !== "approved") {
    const saved = await db
      .update(adTable)
      .set(
        input.status === "ready"
          ? { status: "ready", readyAt: new Date(), readyBy: input.userId }
          : { status: "drawn", readyAt: null, readyBy: null },
      )
      .where(
        and(
          eq(adTable.id, ad.id),
          ne(adTable.status, "approved"),
          input.expectedUpdatedAt
            ? eq(adTable.updatedAt, new Date(input.expectedUpdatedAt))
            : undefined,
        ),
      )
      .returning({ id: adTable.id });
    if (!saved.length)
      throw new Error("This ad changed. Refresh before changing its status.");
    return { adId: ad.id, status: input.status };
  }
  if (!input.expectedUpdatedAt)
    throw new Error("Review the current ad before approving it.");
  if (!input.userId) throw new Error("Approval needs a signed-in person.");
  const userId = input.userId;
  if (
    "media" in ad.content &&
    ad.content.media.every((card) => card.type === "image") &&
    (!ad.content.format || ["static", "carousel"].includes(ad.content.format))
  ) {
    await approveImageAd({
      ...input,
      userId,
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
    // Saving every size's images takes seconds per card; the push and the
    // previews wait on them if they are still being saved.
    waitUntil(
      freezeApprovedAd(ad.id).catch((error: unknown) =>
        console.error("saving approved images failed", ad.id, error),
      ),
    );
  } else {
    if (ad.type === "text" && !textAdReady(ad.content as AdTextContent))
      throw new Error(
        "Add at least 3 headlines and 2 descriptions within the search copy limits before approving.",
      );
    if (ad.type !== "text") {
      const content = creativeContent(ad);
      if (
        adFormatOf(content) === "video" &&
        (!content.media.length ||
          content.media.some((item) => item.type !== "video") ||
          !content.headline.trim() ||
          !content.body.trim() ||
          (!content.linkUrl && !ad.brand.website))
      )
        throw new Error(
          "Add a video, headline, primary text and destination before approval.",
        );
    }
    const saved = await db
      .update(adTable)
      .set({ status: "approved", approvedAt: new Date(), approvedBy: userId })
      .where(
        and(
          eq(adTable.id, ad.id),
          eq(adTable.updatedAt, new Date(input.expectedUpdatedAt)),
        ),
      )
      .returning({ id: adTable.id });
    if (!saved.length)
      throw new Error("This ad changed. Refresh before approving.");
  }
  const retired = await retireReplacedAd(ad.id);
  return {
    adId: ad.id,
    status: "approved" as const,
    ...(retired.retired ? { replaced: retired.retired } : {}),
  };
}

/**
 * Turn an ad's cards to bare photos, or back. A render-time switch: the branded
 * recipe stays in each card's URL, so clearing it brings the overlay back. For
 * a home whose photos already carry a headline or a mark.
 */
export async function setAdPhotoOnly(input: {
  adId: string;
  orgId: string;
  photoOnly: boolean;
}) {
  const ad = await requireOwnedAd(input);
  const content = creativeContent(ad);
  await db
    .update(adTable)
    .set({ content: { ...content, photoOnly: input.photoOnly } })
    .where(eq(adTable.id, ad.id));
  return { adId: ad.id, photoOnly: input.photoOnly };
}

/**
 * Rewrite the line one card draws on the image, for a composition card. The
 * same photo and recipe, a new headline; a blank one clears it. This is the
 * on-card copy, drawn into every placement's crop, and it is separate from the
 * ad's caption and Meta headline (`setAdCopy`) and from a cell's own copy
 * (`setPlacementCopy`). A bare photo or an uploaded file has no line to write.
 */
export async function setCardCopy(input: {
  adId: string;
  orgId: string;
  index: number;
  title: string;
}) {
  const ad = await requireOwnedAd(input);
  const content = creativeContent(ad);
  const card = content.media[input.index];
  if (!card) throw new AdSetError(422, `No card at ${input.index}`);
  if (!card.url.includes("/api/compositions/preview")) {
    throw new AdSetError(
      422,
      "That card is a photo or an upload; it has no drawn line to change",
    );
  }
  const title = input.title.trim();
  const next: AdCard = { ...card, url: withTitle(card.url, title) };
  if (card.story) {
    next.story = { ...card.story, url: withTitle(card.story.url, title) };
  }
  const media = [...content.media];
  media[input.index] = next;
  await db
    .update(adTable)
    .set({ content: { ...content, media } })
    .where(eq(adTable.id, ad.id));
  return { adId: ad.id, index: input.index };
}

/** Replace the words on one ad, leaving its cards alone. */
export async function setAdCopy(input: {
  adId: string;
  orgId: string;
  headline?: string;
  body?: string;
  description?: string;
  /** Per carousel card, in order; a blank field inherits the ad's. */
  cards?: { headline?: string; description?: string }[];
  text?: AdTextContent;
  expectedUpdatedAt?: string;
}) {
  const ad = await requireOwnedAd(input);
  if (ad.type === "text") {
    if (!input.text || !input.expectedUpdatedAt)
      throw new Error(
        "Supply the text pool and its current version before saving.",
      );
    const content = textAdCopySchema.parse(input.text);
    const saved = await db
      .update(adTable)
      .set({ content })
      .where(
        and(
          eq(adTable.id, ad.id),
          eq(adTable.updatedAt, new Date(input.expectedUpdatedAt)),
          inArray(adTable.status, ["drawn", "ready"]),
        ),
      )
      .returning({ id: adTable.id });
    if (!saved.length)
      throw new Error("This ad changed. Refresh before saving your copy.");
    return { adId: ad.id };
  }
  if (input.text)
    throw new Error("This is a creative ad. Use its creative editor.");
  const content = creativeContent(ad);
  const headline = input.headline ?? content.headline;
  const body = input.body ?? content.body;
  const description = input.description ?? content.description;
  // An idea-studio ad sends the projection of its document, so the words go
  // into the document and are projected again.
  const studio = content.ideaStudio;
  if (studio) {
    const document = {
      ...studio.document,
      copy: { ...studio.document.copy, headline, body, description },
      cards: studio.document.cards.map((card, i) => {
        const next = input.cards?.[i];
        return next ? { ...card, copy: { ...card.copy, ...next } } : card;
      }),
    };
    await db
      .update(adTable)
      .set(
        projectIdea(
          ad.brandId,
          content,
          { ...studio, document },
          ad.placements,
        ),
      )
      .where(eq(adTable.id, ad.id));
    return { adId: ad.id };
  }
  const media = content.media.map((card, i) => {
    const next = input.cards?.[i];
    if (!next) return card;
    const merged = { ...card, ...next };
    return {
      ...merged,
      headline: merged.headline?.trim() || undefined,
      description: merged.description?.trim() || undefined,
    };
  });
  await db
    .update(adTable)
    .set({
      content: {
        ...content,
        headline,
        body,
        description: description?.trim() || undefined,
        media,
      },
    })
    .where(eq(adTable.id, ad.id));
  return { adId: ad.id };
}

/**
 * Flip an idea between creative and text-only. Text-only is copy alone: it
 * pushes to Google Search / OpenAI and never to a feed placement. The switch
 * is the `type` column (which the compile already keys off), so the copy is
 * preserved across the flip and the creative is dropped, reversibly.
 */
export async function setAdTextOnly(input: {
  adId: string;
  orgId: string;
  textOnly: boolean;
}) {
  const ad = await requireOwnedAd(input);
  if (input.textOnly) {
    if (ad.type === "text") return { adId: ad.id, textOnly: true };
    const c = ad.content as AdCreativeContent;
    const next: AdTextContent = {
      headlines: c.headline ? [c.headline] : [],
      descriptions: c.body ? [c.body] : [],
      linkUrl: c.linkUrl,
    };
    await db
      .update(adTable)
      .set({ type: "text", content: next })
      .where(eq(adTable.id, ad.id));
  } else {
    if (ad.type === "creative") return { adId: ad.id, textOnly: false };
    const t = ad.content as AdTextContent;
    const next: AdCreativeContent = {
      format: "static",
      headline: t.headlines?.[0] ?? "",
      body: t.descriptions?.[0] ?? "",
      linkUrl: t.linkUrl,
      media: [],
    };
    await db
      .update(adTable)
      .set({ type: "creative", content: next })
      .where(eq(adTable.id, ad.id));
  }
  return { adId: ad.id, textOnly: input.textOnly };
}

/**
 * Where an idea runs: a subset of the platforms, or null for every planned
 * platform that can render it. Distribution, not content, so an approved
 * idea can still be routed; a pushed one cannot.
 */
export async function setAdPlatforms(input: {
  adId: string;
  orgId: string;
  platforms: ChannelPlatform[] | null;
}) {
  const ad = await requireOwnedAd(input, true);
  await assertAdNotPushed(ad.id);
  const platforms = input.platforms?.length
    ? [...new Set(input.platforms)]
    : null;
  await db.update(adTable).set({ platforms }).where(eq(adTable.id, ad.id));
  return { adId: ad.id, platforms };
}

// ---- PLACEMENT CELLS -------------------------------------------------------
//
// One ad across platform × placement. The base creative is `content`; a cell
// keeps only what differs, in `placements`. These verbs each touch one cell
// and are the composable unit the matrix and the agent both drive: a global
// copy change is `setAdCopy` on `content`, a per-cell one is `setPlacementCopy`
// here. All idempotent, none reach a platform.

function requirePlacementSpec(key: string) {
  const spec = placementSpec(key);
  if (!spec) throw new AdSetError(422, `Unknown placement "${key}"`);
  return spec;
}

async function savePlacements(adId: string, placements: AdPlacements) {
  await db.update(adTable).set({ placements }).where(eq(adTable.id, adId));
}

/** Copy for one cell that differs from the base. A `null` field clears it. */
export async function setPlacementCopy(input: {
  adId: string;
  orgId: string;
  placementKey: string;
  patch: CopyPatch;
  via?: "manual" | "ai" | "director";
}) {
  const ad = await requireOwnedAd(input);
  creativeContent(ad); // 422 on a text ad
  requirePlacementSpec(input.placementKey);
  const next = withCopy(
    asPlacements(ad.placements),
    input.placementKey,
    input.patch,
    { via: input.via ?? "manual" },
  );
  await savePlacements(ad.id, next);
  return { adId: ad.id, placementKey: input.placementKey };
}

/**
 * One card's own file for one cell: an uploaded library asset, a derived
 * crop/outpaint for the placement's shape, or `null` to drop back to the base
 * card. A story placement derives a 9:16; the others pin the chosen asset.
 */
export async function setPlacementCard(input: {
  adId: string;
  orgId: string;
  placementKey: string;
  index: number;
  userId?: string;
  source: { mediaAssetId: string } | { derive: "auto" | "crop" | "extend" };
  via?: "manual" | "ai" | "director";
}) {
  const ad = await requireOwnedAd(input);
  const content = creativeContent(ad);
  const spec = requirePlacementSpec(input.placementKey);
  const card = content.media[input.index];
  if (!card) throw new AdSetError(422, `No card at ${input.index}`);

  let variant: AdPlacementVariant;
  if ("mediaAssetId" in input.source) {
    const picked = await cardFromAsset(ad.brand.id, input.source.mediaAssetId);
    variant = { ...picked.item, via: "upload" };
  } else {
    if (!input.userId) {
      throw new AdSetError(422, "Deriving a placement file needs a user");
    }
    // Story is the only derived shape today; the wider crop set arrives with
    // the platforms that need it.
    if (spec.crop !== "story") {
      throw new AdSetError(
        422,
        `Nothing to derive for a ${spec.crop} placement; upload or leave the base`,
      );
    }
    variant = await deriveStory({
      brand: ad.brand,
      userId: input.userId,
      card,
      how: input.source.derive,
      home: content.propertyName ?? null,
    });
  }

  const next = withCard(
    asPlacements(ad.placements),
    input.placementKey,
    input.index,
    variant,
    content.media.length,
    { via: input.via ?? "manual" },
  );
  await savePlacements(ad.id, next);
  return { adId: ad.id, placementKey: input.placementKey, via: variant.via };
}

/** Drop a cell, back to a live render of the base. */
export async function clearPlacement(input: {
  adId: string;
  orgId: string;
  placementKey: string;
}) {
  const ad = await requireOwnedAd(input);
  const next = withoutKey(asPlacements(ad.placements), input.placementKey);
  await savePlacements(ad.id, next);
  return { adId: ad.id, placementKey: input.placementKey };
}

/**
 * Freeze a cell: pin the copy and the files the push will take. Anything the
 * cell still shows from the base is materialized now, so a later global edit
 * cannot move it. A story cell derives its 9:16 where a card lacks one; the
 * feed shapes pin the base asset, which the platform crops on push.
 */
export async function freezePlacement(input: {
  adId: string;
  orgId: string;
  userId: string;
  placementKey: string;
}) {
  const ad = await requireOwnedAd(input);
  const content = creativeContent(ad);
  const spec = requirePlacementSpec(input.placementKey);
  const placements = asPlacements(ad.placements);
  const resolved = resolveCell({ content, placements }, spec);

  const cards: AdPlacementVariant[] = [];
  for (let i = 0; i < content.media.length; i += 1) {
    const own = placements[input.placementKey]?.cards?.[i] ?? null;
    if (own) {
      cards.push(own);
      continue;
    }
    const base = content.media[i]!;
    if (spec.crop === "story" && base.type !== "video") {
      cards.push(
        await deriveStory({
          brand: ad.brand,
          userId: input.userId,
          card: base,
          how: "auto",
          home: content.propertyName ?? null,
        }),
      );
    } else {
      const shown = resolved.cards[i]!;
      cards.push({
        url: shown.url,
        type: shown.type,
        thumbnail: shown.thumbnail ?? undefined,
        assetId: shown.assetId ?? undefined,
        via: "crop",
      });
    }
  }

  const next = withFrozen(placements, input.placementKey, {
    at: new Date().toISOString(),
    by: input.userId,
    cards,
    copy: {
      headline: resolved.copy.headline,
      body: resolved.copy.body,
      ...(resolved.copy.callToAction
        ? { callToAction: resolved.copy.callToAction }
        : {}),
      ...(resolved.copy.linkUrl ? { linkUrl: resolved.copy.linkUrl } : {}),
    },
  });
  await savePlacements(ad.id, next);
  return {
    adId: ad.id,
    placementKey: input.placementKey,
    fit: resolved.fit,
  };
}

/** Unfreeze a cell, keeping its pinned copy and files as an override. */
export async function unfreezePlacement(input: {
  adId: string;
  orgId: string;
  placementKey: string;
}) {
  const ad = await requireOwnedAd(input);
  const next = withUnfrozen(asPlacements(ad.placements), input.placementKey);
  await savePlacements(ad.id, next);
  return { adId: ad.id, placementKey: input.placementKey };
}

/** Section saves merge into the latest persisted content and require the reviewed version. */
export async function saveAdSection(
  input: z.infer<typeof adSectionSchema>,
  orgId: string,
) {
  const ad = await requireOwnedAd({ adId: input.adId, orgId });
  if (ad.updatedAt.toISOString() !== input.expectedUpdatedAt)
    throw new Error(
      "This ad changed elsewhere. Reload before saving your edits.",
    );
  let content = ad.content;
  let bookingTargetId = ad.bookingTargetId;
  const section = input.section;
  if (section.kind === "destination") {
    let linkUrl = section.linkUrl;
    if (
      section.bookingTargetId &&
      section.bookingTargetId !== ad.bookingTargetId
    ) {
      const resolved = await resolveBookingTarget(
        section.bookingTargetId,
        orgId,
      );
      if (resolved.target.brandId !== ad.brandId)
        throw new Error("Booking target belongs to another brand.");
      linkUrl = resolved.url;
    }
    bookingTargetId = section.bookingTargetId;
    content = {
      ...content,
      linkUrl: linkUrl || undefined,
      ...("media" in content
        ? { callToAction: section.callToAction || undefined }
        : {}),
    };
  } else if (section.kind === "text") {
    if ("media" in content)
      throw new Error("Use the creative copy editor for this ad.");
    content = { ...content, ...section.copy };
  } else {
    if (!("media" in content) || adFormatOf(content) !== "video")
      throw new Error("Use the image editor for this ad.");
    if (section.kind === "copy")
      content = {
        ...content,
        headline: section.headline,
        body: section.body,
        description: section.description || undefined,
      };
    else {
      let base = content.media[0];
      if (section.baseAssetId === null) base = undefined;
      else if (section.baseAssetId && section.baseAssetId !== base?.assetId) {
        const picked = await cardFromAsset(ad.brandId, section.baseAssetId);
        if (picked.item.type !== "video")
          throw new Error("Choose a video file.");
        base = (await videoAdCardFor(picked.item)) ?? picked.item;
      }
      let story = content.media[0]?.story;
      if (section.storyAssetId === null) story = undefined;
      else if (
        section.storyAssetId &&
        section.storyAssetId !== story?.assetId
      ) {
        const picked = await cardFromAsset(ad.brandId, section.storyAssetId);
        const [cut] = await deliveryMediaFor([picked.item], "vertical");
        if (
          cut?.type !== "video" ||
          !cut.width ||
          !cut.height ||
          Math.abs(cut.width / cut.height - 9 / 16) >= 0.02
        )
          throw new Error("The separate Story cut must be a 9:16 video.");
        story = { ...cut, via: "upload" };
      }
      if (story && !base)
        throw new Error("Choose a base video before adding a Story cut.");
      if (base) {
        const { story: _old, ...file } = base;
        base = story ? { ...file, story } : file;
      }
      content = { ...content, media: base ? [base] : [] };
    }
  }
  const saved = await db
    .update(adTable)
    .set({ content, bookingTargetId })
    .where(
      and(
        eq(adTable.id, ad.id),
        inArray(adTable.status, ["drawn", "ready"]),
        eq(adTable.updatedAt, new Date(input.expectedUpdatedAt)),
      ),
    )
    .returning({ id: adTable.id });
  if (!saved.length)
    throw new Error(
      "This ad changed elsewhere. Reload before saving your edits.",
    );
  return { adId: ad.id };
}
