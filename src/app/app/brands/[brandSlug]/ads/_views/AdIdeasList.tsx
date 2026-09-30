import type { AdContent } from "@/server/db/schema";
import { ideaDocumentFromAd } from "@/lib/ad-idea-studio";
import { isImportedMetaCatalog } from "@/lib/meta-import";
import { AdIdeaCard } from "./AdIdeaCard";

// The list files every ad under its creative type, the way a shared drive
// would: all-homes carousels first, then statics, then each home's carousel,
// then video and anything else. A jump bar names every group with its count,
// so nine ads never read as the three slides of the first one.
const GROUPS = [
  { id: "all-homes", label: "All-homes carousels" },
  { id: "statics", label: "Statics" },
  { id: "home-carousels", label: "Home carousels" },
  { id: "video", label: "Video" },
  { id: "other", label: "Other" },
] as const;
type GroupId = (typeof GROUPS)[number]["id"];

function groupOf(ad: {
  name: string;
  content: AdContent;
  homeId?: string | null;
}): GroupId {
  if (!("media" in ad.content)) return "other";
  if (ad.content.media.some((m) => m.type === "video")) return "video";
  const format = ad.content.format;
  if (format && format !== "static" && format !== "carousel") return "other";
  const role = ideaDocumentFromAd({ name: ad.name, content: ad.content }).role;
  if (role === "hero_static") return "statics";
  if (role === "hero_carousel" || !ad.homeId) return "all-homes";
  return "home-carousels";
}

export function AdIdeasList({
  ads,
  homeOrder,
  homeLinks,
  preparingHero,
  campaignId,
  brandId,
  brandName,
  brandLogo,
  states,
  fallback,
  actions,
}: {
  /** Add starter ideas, Add ad, Assets: they act on the list below them. */
  actions?: React.ReactNode;
  homeOrder: string[];
  homeLinks: Record<string, { name: string; url: string }>;
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
  const groups = GROUPS.map((group) => ({
    ...group,
    ads: ordered.filter((ad) => groupOf(ad) === group.id),
  })).filter((group) => group.ads.length > 0);
  const renderAd = (ad: (typeof ordered)[number]) =>
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
        home={ad.homeId ? homeLinks[ad.homeId] : undefined}
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
    );
  return (
    <section aria-labelledby="ad-ideas-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ad-ideas-heading" className="text-sm font-semibold">
          Ads <span className="text-muted-foreground">· {ideas.length}</span>
        </h2>
        {actions}
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
        <>
          <nav
            aria-label="Ad types"
            className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1.5 bg-background/95 px-1 py-2 backdrop-blur"
          >
            {groups.map((group) => (
              <a
                key={group.id}
                href={`#ads-${group.id}`}
                className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {group.label}{" "}
                <span className="tabular-nums">· {group.ads.length}</span>
              </a>
            ))}
          </nav>
          {groups.map((group) => (
            <section
              key={group.id}
              id={`ads-${group.id}`}
              aria-labelledby={`ads-${group.id}-heading`}
              className="scroll-mt-14 space-y-3"
            >
              <h3
                id={`ads-${group.id}-heading`}
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {group.label} · {group.ads.length}
              </h3>
              {group.ads.map(renderAd)}
            </section>
          ))}
        </>
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
