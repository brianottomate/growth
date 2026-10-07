"use client";

import {
  usePreviewReviewStatus,
  useReviewPreview,
} from "@/components/review/ReviewPreview";
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
import { Button } from "@/components/ui/button";
import { SendToCampaign } from "./SendToCampaign";
import { useEffect, useState } from "react";
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
 * Every idea on the brand's studio, filed under the home it is about. Drafts remain editable; Ready requests review, and approval freezes the creative.
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
    const adAnchor = window.location.hash.slice(1);
    if (adAnchor.startsWith("ad-"))
      document
        .getElementById(adAnchor)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusHomeId, grouping, ideas]);
  const [picked, setPicked] = useState<string[]>([]);
  const available = ideas.filter(
    (ad) => ad.status === "approved" && !ad.campaignId,
  );
  const selected = picked.filter((id) => available.some((ad) => ad.id === id));
  const reviewPreview = useReviewPreview();
  const previewStatus = usePreviewReviewStatus();
  const groups = groupCollectionAds(ideas, grouping, homeContext);
  return (
    <div className="divide-y">
      {!reviewPreview && available.length > 0 && (
        <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 bg-background py-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.length === available.length}
              onChange={(event) =>
                setPicked(
                  event.target.checked ? available.map((ad) => ad.id) : [],
                )
              }
            />
            {selected.length
              ? `${selected.length} selected`
              : "Select approved ads"}
          </label>
          <SendToCampaign
            brandId={brandId}
            brandSlug={brandSlug}
            adIds={selected}
            onSent={() => setPicked([])}
          />
          {selected.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
              Clear
            </Button>
          )}
        </div>
      )}
      {groups.map((group) => {
        const frozen = group.ads.filter(
          (idea) =>
            (reviewPreview ? previewStatus(idea.name) : idea.status) ===
            "approved",
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
              const adMetadata = (
                <div className="flex items-center gap-3">
                  {!reviewPreview &&
                    idea.status === "approved" &&
                    !idea.campaignId && (
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          aria-label={`Select ${idea.name}`}
                          checked={selected.includes(idea.id)}
                          onChange={(event) =>
                            setPicked((current) =>
                              event.target.checked
                                ? [...current, idea.id]
                                : current.filter((id) => id !== idea.id),
                            )
                          }
                        />
                        Select
                      </label>
                    )}
                  {assignment}
                </div>
              );
              const wrap = (node: React.ReactNode, metadataInside = false) => (
                <div
                  key={idea.id}
                  id={
                    !("media" in idea.content) || !editable(idea.content)
                      ? `ad-${idea.id}`
                      : undefined
                  }
                  className="scroll-mt-4 space-y-2"
                >
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
