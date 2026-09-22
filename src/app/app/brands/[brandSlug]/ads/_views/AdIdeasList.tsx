import type { AdContent } from "@/server/db/schema";
import { ideaDocumentFromAd } from "@/lib/ad-idea-studio";
import { isImportedMetaCatalog } from "@/lib/meta-import";
import { AdIdeaCard } from "./AdIdeaCard";

export function AdIdeasList({
  ads,
  homeOrder,
  preparingHero,
  campaignId,
  brandId,
  brandName,
  brandLogo,
  states,
  fallback,
}: {
  homeOrder: string[];
  preparingHero: boolean;
  campaignId: string;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  states: Record<string, string>;
  fallback: (id: string) => React.ReactNode;
  ads: {
    id: string;
    name: string;
    content: AdContent;
    updatedAt: Date;
    homeId?: string | null;
    createdAt: Date;
  }[];
}) {
  const catalogs = ads.filter(
    (ad) => "media" in ad.content && isImportedMetaCatalog(ad.content),
  );
  const ideas = ads.filter((ad) => !catalogs.includes(ad));
  const chronological = [...ideas].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const homes = [
    ...new Set([
      ...homeOrder,
      ...chronological.flatMap((ad) => (ad.homeId ? [ad.homeId] : [])),
    ]),
  ];
  const rank = (ad: (typeof ideas)[number]) => {
    if (
      "media" in ad.content &&
      ideaDocumentFromAd({ name: ad.name, content: ad.content }).role ===
        "hero_carousel"
    )
      return -1;
    return ad.homeId ? homes.indexOf(ad.homeId) : homes.length;
  };
  const ordered = chronological.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.homeId && a.homeId === b.homeId
        ? Number("format" in a.content && a.content.format === "carousel") -
          Number("format" in b.content && b.content.format === "carousel")
        : 0),
  );
  return (
    <section aria-labelledby="ad-ideas-heading" className="space-y-4">
      <div>
        <h2 id="ad-ideas-heading" className="text-sm font-semibold">
          Ads <span className="text-muted-foreground">· {ideas.length}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Shape each idea, review its previews, then approve to save the
          finished creative.
        </p>
      </div>
      {preparingHero && (
        <div
          className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground"
          role="status"
        >
          <span className="font-medium text-foreground">Hero carousel</span> ·
          Preparing from the selected homes
        </div>
      )}
      {ideas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ads yet. Add an ad or a starter set to begin.
        </p>
      ) : (
        ordered.map((ad) =>
          "media" in ad.content &&
          ad.content.media.every((m) => m.type === "image") &&
          (!ad.content.format ||
            ad.content.format === "static" ||
            ad.content.format === "carousel") ? (
            <AdIdeaCard
              key={ad.id}
              campaignId={campaignId}
              brandId={brandId}
              brandName={brandName}
              brandLogo={brandLogo}
              deliveryState={states[ad.id]}
              ad={{
                id: ad.id,
                name: ad.name,
                content: ad.content,
                updatedAt: ad.updatedAt.toISOString(),
                homeId: ad.homeId,
              }}
            />
          ) : (
            <div key={ad.id}>{fallback(ad.id)}</div>
          ),
        )
      )}
      {catalogs.length > 0 && (
        <section
          aria-label="Imported catalog ads"
          className="space-y-3 border-t pt-5"
        >
          <h3 className="text-sm font-semibold">
            Catalog ads · {catalogs.length}
          </h3>
          <p className="text-sm text-muted-foreground">
            Imported references. These ads use a product catalog instead of
            fixed creative. Catalog editing and publishing are not supported
            here yet.
          </p>
          {catalogs.map((ad) => (
            <div key={ad.id} className="space-y-2 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-sm font-medium">{ad.name}</h4>
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  Catalog · Reference only
                </span>
              </div>
              {"media" in ad.content && ad.content.metaImport && (
                <p className="text-xs text-muted-foreground">
                  Imported from Meta · Ad {ad.content.metaImport.adId}
                </p>
              )}
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
