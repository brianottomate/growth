import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import type { PreviewHome } from "@/components/brand/BrandPreviewStrip";
import { db } from "@/server/db";
import { mediaAssetTable } from "@/server/db/schema";
import { isAllowedPreviewSource } from "@/server/services/composition.service";

type Facts = {
  name: string;
  city?: string | null;
  state?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  guests?: number | null;
  rating?: number | null;
};

const describe = (home: Facts) => ({
  name: home.name,
  place: [home.city, home.state].filter(Boolean).join(", ") || null,
  facts:
    [
      home.bedrooms ? `${home.bedrooms} bedrooms` : null,
      home.bathrooms ? `${home.bathrooms} baths` : null,
      home.guests ? `${home.guests} guests` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
  rating: home.rating ?? null,
});

/**
 * The photo the setup Studio draws, best first: the featured home, any home
 * on the feed, a hand-added home's hero, then a photo from the library. Null
 * when the brand has none of these; the Studio then shows only the cards that
 * need no photo.
 */
export async function resolvePreviewHome(input: {
  brandId: string;
  brandName: string;
  featuredListingUrl: string | null;
  previewSourceUrl: string | null;
  feed: Array<Facts & { url: string; imageUrl?: string | null }>;
  committed: Array<Facts & { heroSourceUrl: string | null }>;
}): Promise<PreviewHome | null> {
  const withPhoto = input.feed.filter((home) => home.imageUrl);
  const featured =
    withPhoto.find((home) => home.url === input.featuredListingUrl) ?? null;
  const feedHome = featured ?? withPhoto[0];
  if (feedHome) {
    return {
      ...describe(feedHome),
      imageUrl:
        (featured ? input.previewSourceUrl : null) ?? feedHome.imageUrl!,
      source: featured ? "featured" : "feed",
    };
  }

  const manual = input.committed.find(
    (home) => home.heroSourceUrl && isAllowedPreviewSource(home.heroSourceUrl),
  );
  if (manual) {
    return {
      ...describe(manual),
      imageUrl: manual.heroSourceUrl!,
      source: "home",
    };
  }

  // A plain photo: not a rendered card, a brand mark, or an approved export.
  const photos = await db.query.mediaAssetTable.findMany({
    where: and(
      eq(mediaAssetTable.brandId, input.brandId),
      eq(mediaAssetTable.kind, "image"),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
    ),
    orderBy: desc(mediaAssetTable.createdAt),
    columns: { url: true, metadata: true },
    limit: 50,
  });
  const photo = photos.find((asset) => {
    const meta = (asset.metadata ?? {}) as Record<string, unknown>;
    return (
      asset.url &&
      isAllowedPreviewSource(asset.url) &&
      !meta.composition &&
      !meta.adApproval &&
      meta.source !== "brand_mark"
    );
  });
  if (photo?.url) {
    return {
      name: input.brandName,
      place: null,
      facts: null,
      rating: null,
      imageUrl: photo.url,
      source: "library",
    };
  }
  return null;
}
