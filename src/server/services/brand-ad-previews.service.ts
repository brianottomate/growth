import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  getCompositionFormat,
  getCompositionTemplate,
  type CompositionFormatId,
  type CompositionTemplateId,
} from "@/lib/compositions";
import { db } from "@/server/db";
import {
  brandTable,
  mediaAssetTable,
  type BrandAdPreview,
} from "@/server/db/schema";

// ---- BRAND AD PREVIEWS ------------------------------------------------------
//
// What a brand's ads will look like, before there is a campaign to put them
// in. The brand keeps a short ordered list of cards it has chosen as previews;
// each is a library asset frozen by the Studio, and the asset's composition
// metadata is the spec that made it. Nothing here duplicates that spec. The
// list is the brand-mark shape applied to ads: a small, curated set the page
// renders inside feed mocks, kept on the brand row because it describes the
// brand rather than any one campaign.

/** Enough previews to show a few homes; more than that is a campaign. */
const MAX_PREVIEWS = 8;

export {
  AD_PREVIEW_DEFAULTS,
  adPreviewStudioHref,
  performanceBrandPath,
} from "@/lib/ad-preview-links";

type StoredComposition = {
  templateId?: string;
  formatId?: string;
  sourceMediaAssetId?: string | null;
  title?: string;
  subtitle?: string | null;
  eyebrow?: string | null;
  cta?: string | null;
  direction?: { verdict?: string } | null;
};

/** One preview as the brand page draws it: the card plus the copy beside it. */
export type AdPreviewCard = {
  assetId: string;
  url: string;
  thumbnailUrl: string | null;
  templateId: string;
  templateLabel: string;
  formatId: string;
  formatLabel: string;
  /** Copy for the feed mock, read off the card's own fields. */
  headline: string;
  body: string | null;
  callToAction: string;
  homeUrl: string | null;
  /** The art director passed this card before it was frozen. */
  judged: boolean;
  savedAt: string;
};

function labelFor(kind: "template" | "format", id: string) {
  try {
    return kind === "template"
      ? getCompositionTemplate(id as CompositionTemplateId).label
      : getCompositionFormat(id as CompositionFormatId).label;
  } catch {
    return id;
  }
}

/**
 * The brand's previews joined with their assets, newest first. A preview
 * whose card has since left the library is dropped rather than shown broken;
 * the row is left alone, because a delete here is not what the caller asked.
 */
export async function listBrandAdPreviews(
  brandId: string,
): Promise<AdPreviewCard[]> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { adPreviews: true },
  });
  const previews = brand?.adPreviews ?? [];
  if (previews.length === 0) return [];

  const assets = await db.query.mediaAssetTable.findMany({
    where: and(
      inArray(
        mediaAssetTable.id,
        previews.map((row) => row.assetId),
      ),
      eq(mediaAssetTable.brandId, brandId),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: { id: true, url: true, thumbnailUrl: true, metadata: true },
  });
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  return previews.flatMap((row) => {
    const asset = byId.get(row.assetId);
    if (!asset?.url) return [];
    const stored =
      (asset.metadata as { composition?: StoredComposition } | null)
        ?.composition ?? {};
    const title = stored.title?.trim() ?? "";
    const eyebrow = stored.eyebrow?.trim();
    const subtitle = stored.subtitle?.trim();
    return [
      {
        assetId: asset.id,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl ?? null,
        templateId: row.templateId,
        templateLabel: labelFor("template", row.templateId),
        formatId: row.formatId,
        formatLabel: labelFor("format", row.formatId),
        headline: title,
        // The lead-in and the place read as one sentence beside the card; a
        // card without a lead-in shows its facts line instead.
        body: eyebrow && title ? `${eyebrow} ${title}.` : subtitle || null,
        callToAction: stored.cta?.trim() || "See details",
        homeUrl: row.homeUrl ?? null,
        judged: Boolean(stored.direction),
        savedAt: row.savedAt,
      },
    ];
  });
}

export class BrandAdPreviewError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 422,
  ) {
    super(message);
  }
}

/**
 * Keep a frozen card as one of the brand's ad previews. Idempotent on the
 * asset: saving the same card twice moves it to the front. The blueprint and
 * canvas are read off the asset, so a caller cannot file a card under a
 * layout it was not drawn with.
 */
export async function addBrandAdPreview(input: {
  brandId: string;
  assetId: string;
  userId: string;
  /** The listing the card shows, when the caller matched the photo to one. */
  homeUrl?: string | null;
}): Promise<BrandAdPreview[]> {
  const asset = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.id, input.assetId),
      eq(mediaAssetTable.brandId, input.brandId),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: { id: true, status: true, metadata: true },
  });
  if (!asset) {
    throw new BrandAdPreviewError(
      "That card is not in this brand's library",
      404,
    );
  }
  const stored = (
    asset.metadata as {
      composition?: StoredComposition;
      sourceUrl?: string;
    } | null
  )?.composition;
  if (!stored?.templateId || !stored.formatId) {
    throw new BrandAdPreviewError(
      "Only a card frozen in the Studio can be an ad preview",
      422,
    );
  }

  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, input.brandId),
    columns: { adPreviews: true },
  });
  const current = brand?.adPreviews ?? [];
  const previous = current.find((row) => row.assetId === asset.id);
  const next: BrandAdPreview[] = [
    {
      assetId: asset.id,
      templateId: stored.templateId,
      formatId: stored.formatId,
      homeUrl: input.homeUrl ?? previous?.homeUrl ?? null,
      savedAt: new Date().toISOString(),
      savedBy: input.userId,
    },
    ...current.filter((row) => row.assetId !== asset.id),
  ].slice(0, MAX_PREVIEWS);

  await db
    .update(brandTable)
    .set({ adPreviews: next })
    .where(eq(brandTable.id, input.brandId));
  return next;
}

export async function removeBrandAdPreview(input: {
  brandId: string;
  assetId: string;
}): Promise<BrandAdPreview[]> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, input.brandId),
    columns: { adPreviews: true },
  });
  const next = (brand?.adPreviews ?? []).filter(
    (row) => row.assetId !== input.assetId,
  );
  await db
    .update(brandTable)
    .set({ adPreviews: next })
    .where(eq(brandTable.id, input.brandId));
  return next;
}

/**
 * Remember which home stands for the brand. The on-demand previews draw from
 * it; null clears the pick and the page goes back to the first home on their
 * feed. The URL is stored as given, since the feed is what it is matched to.
 */
export async function setBrandFeaturedListing(input: {
  brandId: string;
  listingUrl: string | null;
}) {
  await db
    .update(brandTable)
    .set({ featuredListingUrl: input.listingUrl })
    .where(eq(brandTable.id, input.brandId));
  return { featuredListingUrl: input.listingUrl };
}
