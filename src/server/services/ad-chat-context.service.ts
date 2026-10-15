import type { IdeaContextResult } from "@/server/ai/capabilities/outputs/ads";
import "server-only";
import { performanceCopyNotes } from "./performance-copy-notes.service";
import { listingCopyContext } from "./listing-copy-context.service";
import { marketOf } from "@/lib/markets";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { adTable, brandTable, mediaAssetTable } from "@/server/db/schema";
import { videoEvidence } from "./media-analysis.service";
import { ideaDocumentFromAd, sameIdeaSource } from "@/lib/ad-idea-studio";
import { requireOwnedCampaign, starterIdeaHomes } from "./ads-draft.service";
import { listAllBrandHomes } from "./homes.service";
import { brandListings, brandWebsiteId } from "./wanderos-listings.service";
import { fetchWanderOsListingDetail } from "@/server/clients/wanderos-site.client";
import {
  campaignCopyRules,
  brandStorySection,
  META_HOME_CAPTION,
  META_COLLECTION_CAPTION,
  META_HEADLINE,
  META_DESCRIPTION,
} from "@/server/ai/prompts";
import { COPY_VARIATION_GUIDANCE } from "@/lib/copy-variation";

/** Current single-ad context shared by chat and MCP. No creative writes. */
export async function adChatContext(input: {
  organizationId: string;
  adId: string;
}): Promise<IdeaContextResult> {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
  });
  if (!ad || !("media" in ad.content)) throw new Error("Creative ad not found");
  const fullBrand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, ad.brandId),
      eq(brandTable.organizationId, input.organizationId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!fullBrand) throw new Error("Ad not found");
  const campaign = ad.campaignId
    ? (await requireOwnedCampaign(ad.campaignId, input.organizationId)).campaign
    : null;
  const brand = fullBrand;
  const document = ideaDocumentFromAd({
    ...ad,
    content: ad.content,
  });
  const [galleries, homes, listings, websiteId] = await Promise.all([
    starterIdeaHomes({
      organizationId: input.organizationId,
      brandId: brand.id,
      allHomes: true,
    }),
    listAllBrandHomes(brand.id),
    brandListings(brand),
    brandWebsiteId(brand.id),
  ]);
  const videoSources = ad.content.media.flatMap((m) =>
    m.type === "video" ? [m, ...(m.story ? [m.story] : [])] : [],
  );
  const kind = (source: { url: string }) =>
    videoSources.some((video) => video.url === source.url)
      ? ("video" as const)
      : ("image" as const);
  const images = document.cards.flatMap((card, index) => [
    {
      cardId: card.id,
      slide: index + 1,
      size: "base",
      kind: kind(card.source),
      source: card.source,
    },
    ...Object.entries(card.sourceOverrides ?? {}).flatMap(([size, source]) =>
      source
        ? [
            {
              cardId: card.id,
              slide: index + 1,
              size,
              kind: kind(source),
              source,
            },
          ]
        : [],
    ),
  ]);
  const videoAssets = await db.query.mediaAssetTable.findMany({
    where: inArray(
      mediaAssetTable.id,
      videoSources.flatMap((video) => (video.assetId ? [video.assetId] : [])),
    ),
    columns: { id: true, storyboard: true, thumbnailUrl: true },
  });
  // A model cannot watch a video, so it reads the storyboard cut at upload.
  const videos = images.flatMap((item) => {
    if (item.kind !== "video") return [];
    const asset = videoAssets.find((a) => a.id === item.source.assetId);
    const evidence = asset ? videoEvidence(asset) : null;
    return evidence
      ? [
          {
            cardId: item.cardId,
            slide: item.slide,
            size: item.size,
            ...evidence,
          },
        ]
      : [];
  });
  const represented = galleries.filter(
    (home) =>
      home.id === ad.homeId ||
      images.some(({ source }) =>
        home.photos.some((photo) => sameIdeaSource(photo, source)),
      ),
  );
  const facts = await Promise.all(
    represented.map(async (home) => {
      const listing = listings.find(
        (l) => l.id === homes.find((h) => h.id === home.id)?.externalId,
      );
      const detail =
        websiteId && listing
          ? await fetchWanderOsListingDetail({
              websiteId,
              propertyId: listing.id,
            })
          : null;
      return {
        id: home.id,
        name: home.name,
        url: home.url,
        city: listing?.city,
        state: listing?.state,
        bedrooms: listing?.bedrooms,
        bathrooms: listing?.bathrooms,
        guests: listing?.guests,
        nightlyFrom: listing?.nightlyFrom,
        market: marketOf(fullBrand?.markets, listing?.city),
        existingCopy: listing
          ? ((await listingCopyContext(brand.id, [listing.id]))[0] ?? null)
          : null,
        description: detail?.description,
        amenities: detail?.amenities,
        locationDescription: detail?.locationDescription,
        petsAllowed: detail?.petsAllowed,
      };
    }),
  );
  return {
    campaignId: campaign?.id ?? null,
    campaignName: campaign?.name ?? null,
    brand: {
      id: brand.id,
      name: brand.name,
      voice: fullBrand?.brandFingerprint,
      story: fullBrand?.story ?? null,
    },
    ad: {
      id: ad.id,
      name: ad.name,
      updatedAt: ad.updatedAt.toISOString(),
      approved: Boolean(ad.content.ideaStudio?.approval),
      document,
    },
    images,
    videos,
    homes: facts,
    copyRules: [
      await performanceCopyNotes(brand.id, input.organizationId),
      campaignCopyRules(),
      META_HOME_CAPTION,
      META_COLLECTION_CAPTION,
      META_HEADLINE,
      META_DESCRIPTION,
      COPY_VARIATION_GUIDANCE,
      brandStorySection({
        brandName: brand.name,
        story: fullBrand?.story ?? null,
        creativeDirection: fullBrand?.creativeDirection,
      }),
    ].join("\n\n"),
  };
}
