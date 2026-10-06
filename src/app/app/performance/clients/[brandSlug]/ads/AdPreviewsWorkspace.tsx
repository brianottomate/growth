"use client";

import { useState } from "react";
import { Images, Search } from "lucide-react";

import { AdFormatFilter } from "@/components/ad-format-filter";
import { AD_FORMATS, adFormat, type AdFormat } from "@/lib/ad-format";
import { Button } from "@/components/ui/button";
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
import { StudioGeneration } from "./StudioGeneration";
import { AddAdDialog } from "./AddAdDialog";
import { StudioIdeas, type StudioIdea } from "./StudioIdeas";
import { ClientPreviewLink } from "./ClientPreviewLink";

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
  homes,
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
  homes: WorkspaceHome[];
  homeContext: AdHomeContext[];
  connected: boolean;
  ideas: StudioIdea[];
  /** A single home a per-home link opened on: open and scroll to it. */
  focusHomeId?: string | null;
}) {
  const ideas = allIdeas.filter((idea) => adFormat(idea.content) !== "catalog");
  const [filter, setFilter] = useState<"all" | "review" | "approved">("all");
  const [kind, setKind] = useState<AdFormat | null>(null);
  const [assignment, setAssignment] = useState<
    "all" | "unassigned" | "assigned"
  >("all");
  const [grouping, setGrouping] = useState<AdGrouping>("type");
  const [search, setSearch] = useState("");
  const approved = ideas.filter((ad) => ad.status === "approved").length;
  const drafted = ideas.length > 0;
  const unapproved = ideas.filter((ad) => ad.status !== "approved").length;

  const visible = ideas.filter(
    (idea) =>
      (kind === null || adFormat(idea.content) === kind) &&
      (assignment === "all" ||
        (assignment === "assigned") === Boolean(idea.campaignId)) &&
      (filter === "all" ||
        (filter === "approved"
          ? idea.status === "approved"
          : idea.status !== "approved")) &&
      `${idea.name} ${adHomeContext(idea, homeContext).label} ${idea.campaignName ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const addAction = (
    <div className="flex flex-wrap gap-2">
      <AddAdDialog brandId={brandId} website={website} />
    </div>
  );
  const actions = (
    <>
      {addAction}
      <ClientPreviewLink brandId={brandId} />
      <StudioGeneration
        brandId={brandId}
        brandSlug={brandSlug}
        connected={connected}
      />
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
        count={ideas.length}
        actions={actions}
      >
        {drafted ? (
          <>
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
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Campaign assignment"
                value={assignment}
                onChange={(e) =>
                  setAssignment(e.target.value as typeof assignment)
                }
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">All assignments</option>
                <option value="unassigned">Unassigned ads</option>
                <option value="assigned">Assigned ads</option>
              </select>
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
            <div
              role="group"
              aria-label="Ad review status"
              className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-0.5"
            >
              {(["all", "review", "approved"] as const).map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filter === key ? "secondary" : "ghost"}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {key === "all"
                    ? `All ${ideas.length}`
                    : key === "review"
                      ? `Needs review ${unapproved}`
                      : `Approved ${approved}`}
                </Button>
              ))}
            </div>
            <AdFormatFilter
              value={kind}
              onChange={setKind}
              formats={AD_FORMATS.filter((format) =>
                ideas.some((idea) => adFormat(idea.content) === format.id),
              ).map((format) => ({
                ...format,
                count: ideas.filter(
                  (idea) =>
                    adFormat(idea.content) === format.id &&
                    (assignment === "all" ||
                      (assignment === "assigned") ===
                        Boolean(idea.campaignId)) &&
                    (filter === "all" ||
                      (filter === "approved") ===
                        (idea.status === "approved")) &&
                    `${idea.name} ${adHomeContext(idea, homeContext).label} ${idea.campaignName ?? ""}`
                      .toLowerCase()
                      .includes(search.trim().toLowerCase()),
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
                homes={homes}
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
