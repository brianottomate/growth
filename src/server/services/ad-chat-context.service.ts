import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { adTable, brandTable } from "@/server/db/schema";
import { ideaDocumentFromAd, sameIdeaSource } from "@/lib/ad-idea-studio";
import { requireOwnedCampaign, starterIdeaHomes } from "./ads-draft.service";
import { listBrandHomes } from "./homes.service";
import { brandListings, brandWebsiteId } from "./wanderos-listings.service";
import { fetchWanderOsListingDetail } from "@/server/clients/wanderos-site.client";

/** Current single-ad context shared by chat and MCP. No creative writes. */
export async function adChatContext(input: {
  organizationId: string;
  campaignId: string;
  adId: string;
}) {
  const { campaign, brand } = await requireOwnedCampaign(
    input.campaignId,
    input.organizationId,
  );
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
  });
  if (!ad || ad.campaignId !== campaign.id || !("media" in ad.content))
    throw new Error("Creative ad not found in this campaign");
  const document = ideaDocumentFromAd({
    ...ad,
    content: ad.content,
  });
  const [galleries, homes, listings, websiteId, fullBrand] = await Promise.all([
    starterIdeaHomes(input),
    listBrandHomes(brand.id),
    brandListings(brand),
    brandWebsiteId(brand.id),
    db.query.brandTable.findFirst({ where: eq(brandTable.id, brand.id) }),
  ]);
  const images = document.cards.flatMap((card, index) => [
    { cardId: card.id, slide: index + 1, size: "base", source: card.source },
    ...Object.entries(card.sourceOverrides ?? {}).flatMap(([size, source]) =>
      source ? [{ cardId: card.id, slide: index + 1, size, source }] : [],
    ),
  ]);
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
        description: detail?.description,
        amenities: detail?.amenities,
        locationDescription: detail?.locationDescription,
        petsAllowed: detail?.petsAllowed,
      };
    }),
  );
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    brand: {
      id: brand.id,
      name: brand.name,
      voice: fullBrand?.brandFingerprint,
    },
    ad: {
      id: ad.id,
      name: ad.name,
      updatedAt: ad.updatedAt.toISOString(),
      approved: Boolean(ad.content.ideaStudio?.approval),
      document,
    },
    images,
    homes: facts,
  };
}
