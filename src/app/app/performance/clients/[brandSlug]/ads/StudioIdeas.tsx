"use client";

import type { AdReview } from "@/lib/ad-review";
import { adFormat } from "@/lib/ad-format";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { campaignDisplayName } from "@/lib/campaign-navigation";
import {
  groupCollectionAds,
  adHomeContext,
  type AdGrouping,
  type AdHomeContext,
} from "@/lib/ad-collection-groups";
import { useEffect } from "react";
import { AdCard } from "@/app/app/brands/[brandSlug]/ads/_views/AdCard";
import { PreparedAdCard } from "@/app/app/brands/[brandSlug]/ads/_views/PreparedAdCard";
import { type AdState } from "@/lib/ad-wall";

import type { AdContent, AdCreativeContent } from "@/server/db/schema";

export type StudioIdea = {
  id: string;
  name: string;
  content: AdContent;
  updatedAt: string;
  bookingTargetId: string | null;
  homeId: string | null;
  status: string;
  review: AdReview;
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
  website,
  focusHomeId,
  grouping,
  homeContext,
}: {
  ideas: StudioIdea[];
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  brandSlug: string;
  website: string | null;
  focusHomeId?: string | null;
  connected: boolean;
  grouping: AdGrouping;
  homeContext: AdHomeContext[];
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
        return (
          <section
            key={group.key}
            id={`home-${group.anchor}`}
            className="space-y-3 py-4 first:pt-0 last:pb-0"
          >
            <h2 className="flex items-baseline gap-2 text-sm font-semibold">
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
                <span className="text-xs text-muted-foreground">
                  Unassigned
                </span>
              );
              const adMetadata = assignment;
              const wrap = (node: React.ReactNode, metadataInside = false) => (
                <div key={idea.id} className="space-y-2">
                  {idea.home?.url ? (
                    <a
                      href={idea.home.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      {idea.home.name}
                      <ExternalLink aria-hidden="true" className="size-3" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : grouping === "type" ? (
                    <p className="text-xs font-medium">
                      {adHomeContext(idea, homeContext).label}
                    </p>
                  ) : null}
                  {!metadataInside && adMetadata}
                  {node}
                </div>
              );
              if (!("media" in idea.content))
                return wrap(
                  <PreparedAdCard
                    key={idea.id}
                    ad={{ ...idea, content: idea.content }}
                    brandId={brandId}
                    brandName={brandName}
                    campaignId={idea.campaignId ?? undefined}
                    metadata={adMetadata}
                    website={website}
                    deliveryState={idea.deliveryState}
                  />,
                  true,
                );
              if (editable(idea.content))
                return wrap(
                  <AdCard
                    key={idea.id}
                    metadata={adMetadata}
                    campaignId={idea.campaignId ?? undefined}
                    deliveryState={idea.deliveryState}
                    ad={{ ...idea, content: idea.content }}
                    brandId={brandId}
                    brandName={brandName}
                    brandLogo={brandLogo}
                  />,
                  true,
                );
              if (adFormat(idea.content) === "video")
                return wrap(
                  <PreparedAdCard
                    ad={idea}
                    brandId={brandId}
                    brandName={brandName}
                    campaignId={idea.campaignId ?? undefined}
                    metadata={adMetadata}
                    website={website}
                    deliveryState={idea.deliveryState}
                  />,
                  true,
                );
              return null;
            })}
          </section>
        );
      })}
    </div>
  );
}
