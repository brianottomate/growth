"use client";

import { useEffect } from "react";
import {
  AdIdeaCard,
  type StudioAd,
} from "@/app/app/brands/[brandSlug]/ads/_views/AdIdeaCard";
import type { AdCreativeContent } from "@/server/db/schema";

export type StudioIdea = StudioAd & {
  status: string;
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
  focusHomeId,
}: {
  ideas: StudioIdea[];
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  focusHomeId?: string | null;
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
          (idea) => idea.content.ideaStudio?.approval,
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
                {group.ideas.length} idea{group.ideas.length === 1 ? "" : "s"} ·{" "}
                {frozen} approved
              </span>
            </h2>
            {group.ideas.map((idea) =>
              editable(idea.content) ? (
                <AdIdeaCard
                  key={idea.id}
                  studio
                  ad={idea}
                  brandId={brandId}
                  brandName={brandName}
                  brandLogo={brandLogo}
                  home={
                    idea.home?.url
                      ? { name: idea.home.name, url: idea.home.url }
                      : undefined
                  }
                />
              ) : (
                <p
                  key={idea.id}
                  className="rounded-xl border px-4 py-3 text-xs text-muted-foreground"
                >
                  {idea.name} ·{" "}
                  {idea.content.format === "catalog"
                    ? "catalog ad, drawn by Meta from the Catalog tab's feed"
                    : "video, edit it in a campaign"}
                </p>
              ),
            )}
          </section>
        );
      })}
    </div>
  );
}
