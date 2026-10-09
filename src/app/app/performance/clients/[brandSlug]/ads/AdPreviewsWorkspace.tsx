"use client";

import {
  adReviewStatus,
  usePreviewReviewStatus,
  useReviewPreview,
} from "@/components/review/ReviewPreview";
import { useState } from "react";
import { Images, Search } from "lucide-react";

import { AdFormatFilter } from "@/components/ad-format-filter";
import { AD_FORMATS, adFormat, type AdFormat } from "@/lib/ad-format";
import { campaignDisplayName } from "@/lib/campaign-navigation";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/compound/combobox";
import { WorkspaceCard } from "../../../WorkspaceCard";
import { EmptyState } from "@/components/ui/empty-state";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ShapeBrandButton } from "../ShapeBrandButton";
import type { HotelFeedHome } from "@/lib/meta-hotel-feed";

import {
  adHomeContext,
  type AdGrouping,
  type AdHomeContext,
} from "@/lib/ad-collection-groups";
import { SendToCampaign } from "./SendToCampaign";
import { WriteSearchAdsButton } from "@/app/app/brands/[brandSlug]/ads/_views/WriteSearchAdsButton";
import { StudioGeneration } from "./StudioGeneration";
import { AddAdDialog } from "./AddAdDialog";
import { StudioIdeas, type StudioIdea } from "./StudioIdeas";

export type WorkspaceHome = HotelFeedHome & {
  imageUrl: string;
  thumbUrl: string | null;
  rating: number | null;
};

/** The full brand ad collection; campaign assignment does not remove an ad. */
export function AdPreviewsWorkspace({
  brandId,
  brandSlug,
  brandName,
  brandLogo,
  website,
  connected,
  ideas: allIdeas,
  focusHomeId,
  homeContext,
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  /** The resolved brand mark (vector/PNG), used on the feed mocks. */
  brandLogo: string | null;
  website: string | null;
  homeContext: AdHomeContext[];
  connected: boolean;
  ideas: StudioIdea[];
  /** A single home a per-home link opened on: open and scroll to it. */
  focusHomeId?: string | null;
}) {
  const reviewPreview = useReviewPreview();
  const previewStatus = usePreviewReviewStatus();
  const statusOf = (ad: StudioIdea) =>
    reviewPreview ? previewStatus(ad.name) : adReviewStatus(ad.status);
  const ideas = allIdeas.filter((idea) => adFormat(idea.content) !== "catalog");
  const [filter, setFilter] = useState<"all" | "draft" | "ready" | "approved">(
    "all",
  );
  const [kind, setKind] = useState<AdFormat | null>(null);
  const [assignment, setAssignment] = useState("unassigned");
  const campaigns = [
    ...new Map(
      ideas.flatMap((idea) =>
        idea.campaignId
          ? [
              [
                idea.campaignId,
                idea.campaignName
                  ? campaignDisplayName(idea.campaignName)
                  : "Untitled campaign",
              ] as const,
            ]
          : [],
      ),
    ),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const [grouping, setGrouping] = useState<AdGrouping>("type");
  const [search, setSearch] = useState("");
  const scoped = ideas.filter(
    (idea) =>
      (assignment === "all" ||
        (assignment === "unassigned"
          ? !idea.campaignId
          : assignment === "assigned"
            ? Boolean(idea.campaignId)
            : assignment === `campaign:${idea.campaignId}`)) &&
      `${idea.name} ${adHomeContext(idea, homeContext).label} ${idea.campaignName ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const statusScope = scoped.filter(
    (idea) => kind === null || adFormat(idea.content) === kind,
  );
  const approved = statusScope.filter(
    (ad) => statusOf(ad) === "approved",
  ).length;
  const drafted = ideas.length > 0;
  const draftCount = statusScope.filter(
    (ad) => statusOf(ad) === "draft",
  ).length;
  const readyCount = statusScope.filter(
    (ad) => statusOf(ad) === "ready",
  ).length;
  const visible = statusScope.filter(
    (idea) => filter === "all" || statusOf(idea) === filter,
  );
  const addAction = (
    <div className="flex flex-wrap gap-2">
      <AddAdDialog brandId={brandId} website={website} />
    </div>
  );
  const actions = (
    <>
      {addAction}
      <WriteSearchAdsButton brandId={brandId} />
      <StudioGeneration
        brandId={brandId}
        brandSlug={brandSlug}
        connected={connected}
      />
      {!reviewPreview && (
        <SendToCampaign brandId={brandId} brandSlug={brandSlug} />
      )}
      <ShapeBrandButton
        brandId={brandId}
        brandName={brandName}
        section="ads and creative review"
      />
    </>
  );
  return (
    <div className="space-y-4">
      <WorkspaceCard
        title="Ads"
        icon={Images}
        count={scoped.length}
        actions={actions}
      >
        {drafted ? (
          <>
            <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center">
              <div className="min-w-0 flex-1">
                <InputGroup>
                  <InputGroupAddon>
                    <Search className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Search ads"
                    placeholder="Search ads"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </InputGroup>
              </div>
              <div
                role="group"
                aria-label="Campaign filter"
                className="flex min-w-0 items-center gap-2"
              >
                <span className="text-sm">Campaign</span>
                <Combobox
                  className="min-w-0 flex-1 @2xl:w-64 @2xl:flex-none"
                  value={assignment}
                  onValueChange={(value) => setAssignment(value || "all")}
                  ariaLabel="Campaign"
                  placeholder="Filter by campaign"
                  searchPlaceholder="Search campaigns…"
                  emptyText="No matching campaigns."
                  options={[
                    { value: "all", label: "All ads", keywords: ["all ads"] },
                    {
                      value: "unassigned",
                      label: "Unassigned ads",
                      keywords: ["unassigned ads"],
                    },
                    {
                      value: "assigned",
                      label: "Assigned ads",
                      keywords: ["assigned ads"],
                    },
                    ...campaigns.map(([id, name]) => ({
                      value: `campaign:${id}`,
                      label: name,
                      keywords: [name],
                    })),
                  ]}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Ad review status"
                className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-0.5"
              >
                {(["all", "draft", "ready", "approved"] as const).map((key) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={filter === key ? "secondary" : "ghost"}
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {key === "all"
                      ? `All ${statusScope.length}`
                      : key === "draft"
                        ? `Draft ${draftCount}`
                        : key === "ready"
                          ? `Ready ${readyCount}`
                          : `Approved ${approved}`}
                  </Button>
                ))}
              </div>
              <div
                role="group"
                aria-label="Group ads"
                className="ml-auto flex flex-wrap gap-1"
              >
                {(["home", "type"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={grouping === value ? "secondary" : "ghost"}
                    aria-pressed={grouping === value}
                    onClick={() => setGrouping(value)}
                  >
                    {value === "home" ? "By home" : "By ad type"}
                  </Button>
                ))}
              </div>
            </div>
            <AdFormatFilter
              value={kind}
              onChange={setKind}
              formats={AD_FORMATS.filter((format) =>
                ideas.some((idea) => adFormat(idea.content) === format.id),
              ).map((format) => ({
                ...format,
                count: scoped.filter(
                  (idea) =>
                    adFormat(idea.content) === format.id &&
                    (filter === "all" || statusOf(idea) === filter),
                ).length,
              }))}
            />
            {visible.length ? (
              <StudioIdeas
                ideas={visible}
                grouping={grouping}
                homeContext={homeContext}
                brandId={brandId}
                brandName={brandName}
                brandLogo={brandLogo}
                brandSlug={brandSlug}
                website={website}
                connected={connected}
                focusHomeId={focusHomeId}
              />
            ) : (
              <EmptyState
                compact
                icon={Images}
                title="No ads match these filters"
                description="Change the search, format, review status or campaign assignment to see more ads."
                actions={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setKind(null);
                      setFilter("all");
                      setAssignment("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )}
          </>
        ) : (
          <EmptyState
            compact
            icon={Images}
            title="Create the first ad"
            actions={actions}
          />
        )}
      </WorkspaceCard>
    </div>
  );
}
