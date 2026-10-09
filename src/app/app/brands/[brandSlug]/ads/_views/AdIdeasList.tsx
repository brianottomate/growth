"use client";

import { useState } from "react";
import { CampaignAdCard } from "./CampaignAdCard";
import { AD_FORMATS, adFormat, type AdFormat } from "@/lib/ad-format";
import { AdFormatFilter } from "@/components/ad-format-filter";
import { Button } from "@/components/ui/button";
import { WorkspaceCardHeader } from "@/app/app/performance/WorkspaceCard";
import { Images } from "lucide-react";
import type { PlatformCampaignSettings } from "@/server/db/ads-schema";
import type { AdContent } from "@/server/db/schema";
import { ideaDocumentFromAd } from "@/lib/ad-idea-studio";
import { isImportedMetaCatalog } from "@/lib/meta-import";
import { adReviewOf } from "@/lib/ad-review";
import type { ChannelPlatform } from "@/server/db/schema";

export function AdIdeasList({
  ads,
  homeOrder,
  homeLinks,
  preparingHero,
  brandId,
  brandName,
  brandLogo,
  states,
  actions,
  emptyState,
  plannedPlatforms = [],
  platformSettings = {},
  studioHref,
  studioPreviewIds = [],
}: {
  /** The campaign's planned platforms; an idea can be narrowed to some. */
  plannedPlatforms?: ChannelPlatform[];
  platformSettings?: Partial<Record<ChannelPlatform, PlatformCampaignSettings>>;
  studioHref: string;
  studioPreviewIds?: string[];
  /** Add starter ideas, Add ad, Assets: they act on the list below them. */
  actions?: React.ReactNode;
  emptyState?: React.ReactNode;
  homeOrder: string[];
  homeLinks: Record<string, { name: string; url: string }>;
  preparingHero: boolean;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  states: Record<string, string>;
  ads: {
    id: string;
    name: string;
    status: string;
    content: AdContent;
    updatedAt: Date;
    homeId?: string | null;
    bookingTargetId?: string | null;
    createdAt: Date;
    platforms?: ChannelPlatform[] | null;
    readyAt?: Date | null;
    readyBy?: string | null;
    approvedAt?: Date | null;
    approvedBy?: string | null;
    replacesAdId?: string | null;
  }[];
}) {
  const [kind, setKind] = useState<AdFormat | null>(null);
  const [showAll, setShowAll] = useState(false);
  const formatOf = (ad: (typeof ads)[number]): AdFormat =>
    "media" in ad.content && isImportedMetaCatalog(ad.content)
      ? "catalog"
      : adFormat(ad.content);
  const visible = ads.filter((ad) => kind === null || formatOf(ad) === kind);
  const catalogs = visible.filter((ad) => formatOf(ad) === "catalog");
  const ideas = visible.filter((ad) => formatOf(ad) !== "catalog");
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
  const shownIds = new Set(
    (showAll
      ? [...ordered, ...catalogs]
      : [...ordered, ...catalogs].slice(0, 3)
    ).map((ad) => ad.id),
  );
  const shownIdeas = ordered.filter((ad) => shownIds.has(ad.id));
  const shownCatalogs = catalogs.filter((ad) => shownIds.has(ad.id));
  const renderAd = (ad: (typeof ordered)[number]) => (
    <CampaignAdCard
      ad={{ ...ad, review: adReviewOf(ad) }}
      brandId={brandId}
      brandName={brandName}
      brandLogo={brandLogo}
      deliveryState={states[ad.id]}
      home={ad.homeId ? homeLinks[ad.homeId] : undefined}
      plannedPlatforms={plannedPlatforms}
      platformSettings={platformSettings}
      studioHref={studioHref}
      studioPreview={studioPreviewIds.includes(ad.id)}
    />
  );
  return (
    <section id="campaign-ad-list" aria-label="Ads" className="space-y-4">
      <WorkspaceCardHeader
        title="Ads"
        icon={Images}
        count={ads.length}
        actions={actions}
      />
      {ads.length > 0 && (
        <AdFormatFilter
          value={kind}
          onChange={(value) => {
            setKind(value);
            setShowAll(false);
          }}
          formats={AD_FORMATS.map((format) => ({
            ...format,
            count: ads.filter((ad) => formatOf(ad) === format.id).length,
          })).filter((format) => format.count > 0)}
        />
      )}
      {preparingHero && (
        <div
          className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground"
          role="status"
        >
          <span className="font-medium text-foreground">Hero carousel</span> ·
          Preparing from the selected homes
        </div>
      )}
      {ads.length === 0 ? (
        (emptyState ?? (
          <p className="text-sm text-muted-foreground">No ads yet.</p>
        ))
      ) : visible.length === 0 ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>No ads match this type.</p>
          <Button size="sm" variant="outline" onClick={() => setKind(null)}>
            Show all types
          </Button>
        </div>
      ) : ideas.length > 0 ? (
        <div className="space-y-3">
          {shownIdeas.map((ad) => (
            <div key={ad.id}>{renderAd(ad)}</div>
          ))}
        </div>
      ) : null}
      {shownCatalogs.length > 0 && (
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
          {shownCatalogs.map((ad) => (
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
      {visible.length > 3 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            Showing {showAll ? visible.length : 3} of {visible.length} ads
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={showAll}
            aria-controls="campaign-ad-list"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Show less" : `Show all ${visible.length} ads`}
          </Button>
        </div>
      )}
    </section>
  );
}
