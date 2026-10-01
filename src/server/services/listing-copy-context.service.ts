import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { adTable, homeTable } from "@/server/db/schema";
import { ideaDocumentFromAd } from "@/lib/ad-idea-studio";

/** Call only after brand authorization. Listing ids differ from Growth home ids. */
export async function listingCopyContext(
  brandId: string,
  listingIds: readonly string[],
) {
  if (!listingIds.length) return [];
  const homes = await db.query.homeTable.findMany({
    where: and(
      eq(homeTable.brandId, brandId),
      inArray(homeTable.externalId, [...listingIds]),
      isNull(homeTable.deletedAt),
    ),
  });
  if (!homes.length) return [];
  const ads = await db.query.adTable.findMany({
    where: and(
      eq(adTable.brandId, brandId),
      inArray(
        adTable.homeId,
        homes.map((home) => home.id),
      ),
    ),
  });
  ads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return homes.map((home) => ({
    listingId: home.externalId,
    catalog: {
      headline: home.catalogTitle,
      subtitle: home.catalogSubtitle,
      pills: home.catalogPills,
      templateId: home.catalogTemplateId,
    },
    ads: ads
      .filter((ad) => ad.homeId === home.id && "media" in ad.content)
      .slice(0, 12)
      .map((ad) => {
        if (!("media" in ad.content)) throw new Error("Expected a creative ad");
        const document = ideaDocumentFromAd({
          name: ad.name,
          content: ad.content,
        });
        return {
          adId: ad.id,
          campaignId: ad.campaignId,
          name: ad.name,
          copy: document.copy,
          copyOverrides: document.copyOverrides,
          cards: document.cards.map((card) => ({
            id: card.id,
            source: card.source,
            mode: card.mode,
            copy: card.copy,
            recipe: card.recipe,
            overrides: card.overrides,
          })),
        };
      }),
  }));
}
