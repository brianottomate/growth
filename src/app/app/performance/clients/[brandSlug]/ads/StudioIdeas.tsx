"use client";

import Link from "next/link";
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
}) {
  useEffect(() => {
    if (focusHomeId)
      document
        .getElementById(`home-${focusHomeId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusHomeId]);
  const groups = new Map<string, { label: string; ideas: StudioIdea[] }>();
  for (const idea of ideas) {
    const key = idea.home?.externalId ?? idea.homeId ?? "brand";
    const group = groups.get(key) ?? {
      label: idea.home?.name ?? "Brand-wide",
      ideas: [],
    };
    group.ideas.push(idea);
    groups.set(key, group);
  }
  return (
    <div className="divide-y">
      {[...groups.entries()].map(([key, group]) => {
        const frozen = group.ideas.filter(
          (idea) => idea.status === "approved",
        ).length;
        return (
          <section
            key={key}
            id={`home-${key}`}
            className="space-y-3 py-4 first:pt-0 last:pb-0"
          >
            <h2 className="flex items-baseline gap-2 text-sm font-semibold">
              {group.label}
              <span className="text-xs font-normal text-muted-foreground">
                {group.ideas.length} ad{group.ideas.length === 1 ? "" : "s"} ·{" "}
                {frozen} approved
              </span>
            </h2>
            {group.ideas.map((idea) => {
              const assignment = idea.campaignId ? (
                <Link
                  href={`/app/performance/clients/${brandSlug}/campaigns/${idea.campaignId}`}
                  className="text-xs text-muted-foreground underline underline-offset-4"
                >
                  Campaign: {idea.campaignName ?? "Assigned"}
                </Link>
              ) : (
                <p className="text-xs text-muted-foreground">Unassigned</p>
              );
              const wrap = (node: React.ReactNode) => (
                <div key={idea.id} className="space-y-2">
                  {assignment}
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
