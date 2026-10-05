"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { campaignDisplayName } from "@/lib/campaign-navigation";
import {
  groupCollectionAds,
  adHomeContext,
  type AdGrouping,
  type AdHomeContext,
} from "@/lib/ad-collection-groups";
import { useEffect } from "react";
import { AdIdeaCard } from "@/app/app/brands/[brandSlug]/ads/_views/AdIdeaCard";
import { BookingTargetPicker } from "@/app/app/brands/[brandSlug]/ads/_views/BookingTargetPicker";
import { TextAdCard } from "@/app/app/brands/[brandSlug]/ads/_views/TextAdCard";
import { AdTile } from "@/app/app/brands/[brandSlug]/ads/_views/AdWall";
import { type AdState, toWallAd } from "@/lib/ad-wall";
import type { WorkspaceHome } from "./AdPreviewsWorkspace";
import type { AdContent, AdCreativeContent } from "@/server/db/schema";

export type StudioIdea = {
  id: string;
  name: string;
  content: AdContent;
  updatedAt: string;
  bookingTargetId: string | null;
  homeId: string | null;
  status: string;
  campaignId: string | null;
  campaignName: string | null;
  deliveryState?: AdState;
  home: { name: string; url: string | null; externalId: string } | null;
};

/** What the idea editor can open: one image or a carousel of images. */
function editable(content: AdCreativeContent) {
  return (
    content.media.every((card) => card.type === "image") &&
    (!content.format ||
      content.format === "static" ||
      content.format === "carousel" ||
      // The every-home carousel is a carousel like any other here.
      content.format === "portfolio")
  );
}

/**
 * Every idea on the brand's studio, filed under the home it is about. Each
 * one opens in the idea editor; Freeze saves its sizes and makes it ready
 * for a campaign.
 */
export function StudioIdeas({
  ideas,
  brandId,
  brandName,
  brandLogo,
  brandSlug,
  homes,
  website,
  focusHomeId,
  connected,
  grouping,
  homeContext,
  selectedIds,
  onSelect,
  selectionDisabled,
}: {
  ideas: StudioIdea[];
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  brandSlug: string;
  homes: WorkspaceHome[];
  website: string | null;
  focusHomeId?: string | null;
  connected: boolean;
  grouping: AdGrouping;
  homeContext: AdHomeContext[];
  selectedIds: ReadonlySet<string>;
  onSelect: (ids: string[], checked: boolean) => void;
  selectionDisabled: boolean;
}) {
  useEffect(() => {
    if (focusHomeId)
      document
        .getElementById(`home-${focusHomeId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusHomeId, grouping, ideas]);
  const groups = groupCollectionAds(ideas, grouping, homeContext);
  return (
    <div className="divide-y">
      {groups.map((group) => {
        const frozen = group.ads.filter(
          (idea) => idea.status === "approved",
        ).length;
        const selectable = group.ads.filter((ad) => !ad.campaignId);
        const selectedCount = selectable.filter((ad) =>
          selectedIds.has(ad.id),
        ).length;
        return (
          <section
            key={group.key}
            id={`home-${group.anchor}`}
            className="space-y-3 py-4 first:pt-0 last:pb-0"
          >
            <h2 className="flex items-baseline gap-2 text-sm font-semibold">
              {selectable.length > 0 && (
                <Checkbox
                  aria-label={`Select ${group.label}`}
                  disabled={selectionDisabled}
                  checked={
                    selectedCount === selectable.length
                      ? true
                      : selectedCount > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checked) =>
                    onSelect(
                      selectable.map((ad) => ad.id),
                      checked === true,
                    )
                  }
                />
              )}
              {group.photo && (
                <img
                  src={group.photo}
                  alt=""
                  className="size-10 self-center rounded-md object-cover"
                />
              )}
              {group.label}
              <span className="text-xs font-normal text-muted-foreground">
                {group.ads.length} ad{group.ads.length === 1 ? "" : "s"} ·{" "}
                {frozen} approved
              </span>
            </h2>
            {group.ads.map((idea) => {
              const assignment = idea.campaignId ? (
                <Link
                  href={`/app/performance/clients/${brandSlug}/campaigns/${idea.campaignId}`}
                  className="text-xs text-muted-foreground underline underline-offset-4"
                >
                  Campaign:{" "}
                  {idea.campaignName
                    ? campaignDisplayName(idea.campaignName)
                    : "Assigned"}
                </Link>
              ) : (
                <p className="text-xs text-muted-foreground">Unassigned</p>
              );
              const wrap = (node: React.ReactNode) => (
                <div key={idea.id} className="space-y-2">
                  {grouping === "type" && (
                    <p className="text-xs font-medium">
                      {adHomeContext(idea, homeContext).label}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    {!idea.campaignId && (
                      <Checkbox
                        aria-label={`Select ${idea.name}`}
                        checked={selectedIds.has(idea.id)}
                        disabled={selectionDisabled}
                        onCheckedChange={(checked) =>
                          onSelect([idea.id], checked === true)
                        }
                      />
                    )}
                    {assignment}
                  </div>
                  {node}
                  {connected &&
                    idea.status !== "approved" &&
                    idea.deliveryState !== "pushed" && (
                      <BookingTargetPicker
                        key={`${idea.id}:${idea.updatedAt}`}
                        adId={idea.id}
                        brandId={brandId}
                        brandSlug={brandSlug}
                        targetId={idea.bookingTargetId}
                      />
                    )}
                </div>
              );
              if (!("media" in idea.content))
                return wrap(
                  <TextAdCard
                    key={idea.id}
                    ad={{ ...idea, content: idea.content }}
                    brandId={brandId}
                    website={website}
                    deliveryState={idea.deliveryState}
                  />,
                );
              if (editable(idea.content))
                return wrap(
                  <AdIdeaCard
                    key={idea.id}
                    studio={!idea.campaignId}
                    campaignId={idea.campaignId ?? undefined}
                    deliveryState={idea.deliveryState}
                    ad={{ ...idea, content: idea.content }}
                    brandId={brandId}
                    brandName={brandName}
                    brandLogo={brandLogo}
                    home={
                      idea.home?.url
                        ? { name: idea.home.name, url: idea.home.url }
                        : undefined
                    }
                  />,
                );
              const wall = toWallAd({
                ...idea,
                updatedAt: new Date(idea.updatedAt),
                home: idea.home?.url
                  ? { ...idea.home, url: idea.home.url }
                  : null,
              });
              return wall
                ? wrap(
                    <ul key={idea.id}>
                      <AdTile
                        ad={wall}
                        brandId={brandId}
                        brandSlug={brandSlug}
                        brandName={brandName}
                        brandLogo={brandLogo}
                        landingUrl={website}
                        homes={homes}
                        surface="instagram"
                        states={
                          idea.deliveryState
                            ? { [idea.id]: idea.deliveryState }
                            : {}
                        }
                      />
                    </ul>,
                  )
                : null;
            })}
          </section>
        );
      })}
    </div>
  );
}
