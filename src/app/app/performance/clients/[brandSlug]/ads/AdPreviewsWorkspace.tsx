"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Images, Search } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { WorkspaceCard } from "../../../WorkspaceCard";
import { EmptyState } from "@/components/ui/empty-state";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ShapeBrandButton } from "../ShapeBrandButton";
import { toast } from "@/components/ui/toast";
import type { HotelFeedHome } from "@/lib/meta-hotel-feed";
import { campaignDisplayName } from "@/lib/campaign-navigation";
import { orpc } from "@/orpc/client";

import {
  adHomeContext,
  type AdGrouping,
  type AdHomeContext,
} from "@/lib/ad-collection-groups";
import { StudioGeneration, StudioGenerationProgress } from "./StudioGeneration";
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
  homes,
  connected,
  ideas,
  campaigns,
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
  /** Campaigns nothing has been pushed for yet, which can still take ads. */
  campaigns: { id: string; name: string }[];
  /** A single home a per-home link opened on: open and scroll to it. */
  focusHomeId?: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "review" | "approved">("all");
  const [kind, setKind] = useState<"all" | "text" | "creative">("all");
  const [assignment, setAssignment] = useState<
    "all" | "unassigned" | "assigned"
  >("all");
  const [grouping, setGrouping] = useState<AdGrouping>("home");
  const [search, setSearch] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createdCampaign, setCreatedCampaign] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const selectAds = (ids: string[], checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const attach = useMutation(
    orpc.ads.attachAdSet.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `${result.attached} ad${result.attached === 1 ? "" : "s"} assigned to ${result.campaignName}.`,
        );
        setSelectedIds(new Set());
        setCreatedCampaign(null);
        router.push(
          `/app/performance/clients/${brandSlug}/campaigns/${result.campaignId}`,
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const selectedAds = ideas.filter(
    (ad) => selectedIds.has(ad.id) && !ad.campaignId,
  );
  const selected = new Set(selectedAds.map((ad) => ad.id));
  const needsApproval = selectedAds.filter(
    (ad) => ad.status !== "approved",
  ).length;
  const handoffReady =
    selectedAds.length > 0 && needsApproval === 0 && selectedAds.length <= 100;
  const createCampaign = useMutation(
    orpc.ads.createDraft.mutationOptions({
      onSuccess: (result, _variables, context) => {
        const campaign = { id: result.campaign.id, name: result.campaign.name };
        setCreatedCampaign(campaign);
        setCampaignId(campaign.id);
        attach.mutate({
          brandId,
          campaignId: campaign.id,
          adIds: context.adIds,
        });
      },
      onMutate: () => ({ adIds: selectedAds.map((ad) => ad.id) }),
      onError: (error) => toast.error(error.message),
    }),
  );
  const handingOff = attach.isPending || createCampaign.isPending;
  const destinations =
    createdCampaign &&
    !campaigns.some((campaign) => campaign.id === createdCampaign.id)
      ? [...campaigns, createdCampaign]
      : campaigns;
  const approved = ideas.filter((ad) => ad.status === "approved").length;
  const drafted = ideas.length > 0;
  const unapproved = ideas.filter((ad) => ad.status !== "approved").length;

  const visible = ideas.filter(
    (idea) =>
      (kind === "all" || (kind === "creative") === "media" in idea.content) &&
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
  const visibleSelectableIds = visible
    .filter((ad) => !ad.campaignId)
    .map((ad) => ad.id);
  const selectedVisibleCount = visibleSelectableIds.filter((id) =>
    selected.has(id),
  ).length;
  const hiddenSelectedCount = selected.size - selectedVisibleCount;
  const allVisibleSelected =
    visibleSelectableIds.length > 0 &&
    selectedVisibleCount === visibleSelectableIds.length;
  const addAction = (
    <div className="flex flex-wrap gap-2">
      <AddAdDialog brandId={brandId} website={website} />
    </div>
  );
  return (
    <div className="space-y-4">
      <StudioGenerationProgress brandId={brandId} />
      <div
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-0.5"
        role="group"
        aria-label="Ad approach"
      >
        {(["all", "text", "creative"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={kind === value ? "secondary" : "ghost"}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {value === "all"
              ? "All ads"
              : value === "text"
                ? "Text-first"
                : "Creative-first"}
          </Button>
        ))}
      </div>
      <WorkspaceCard
        title="Ads"
        icon={Images}
        count={ideas.length}
        actions={
          <>
            {addAction}
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
        }
      >
        {drafted ? (
          <>
            <div
              role="group"
              aria-label="Group ads"
              className="flex flex-wrap gap-1"
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
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
                <div className="flex flex-wrap gap-1 rounded-lg border p-0.5">
                  {(["all", "review", "approved"] as const).map((key) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={filter === key ? "secondary" : "ghost"}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {key === "all"
                        ? "All"
                        : key === "review"
                          ? `Needs review ${unapproved}`
                          : `Approved ${approved}`}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            {createdCampaign && attach.isError && (
              <p role="alert" className="text-sm">
                Campaign created. Assignment failed: {attach.error.message}{" "}
                Retry with Add selected.
              </p>
            )}
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
                selectedIds={selected}
                onSelect={selectAds}
                selectionDisabled={handingOff}
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
                      setKind("all");
                      setFilter("all");
                      setAssignment("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )}
            <div
              className={
                selected.size > 0
                  ? "sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-lg"
                  : "flex flex-wrap items-center justify-between gap-3"
              }
            >
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    aria-label="Select visible ads"
                    disabled={handingOff || visibleSelectableIds.length === 0}
                    checked={
                      allVisibleSelected
                        ? true
                        : selectedVisibleCount > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(checked) =>
                      selectAds(visibleSelectableIds, checked === true)
                    }
                  />
                  Select visible
                </label>
                {selected.size > 0 && (
                  <>
                    <span className="text-sm" role="status">
                      {selected.size} selected
                      {needsApproval > 0
                        ? ` · ${needsApproval} need approval`
                        : ""}
                      {selected.size > 100
                        ? " · Maximum 100 per campaign handoff"
                        : ""}
                    </span>
                    {hiddenSelectedCount > 0 && (
                      <Button
                        size="sm"
                        variant="link"
                        onClick={() => {
                          setSearch("");
                          setKind("all");
                          setFilter("all");
                          setAssignment("all");
                        }}
                      >
                        {hiddenSelectedCount} hidden by filters
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={handingOff}
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Clear selection
                    </Button>
                  </>
                )}
              </div>
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {destinations.length > 0 && (
                    <>
                      <select
                        aria-label="Destination campaign"
                        value={campaignId}
                        disabled={handingOff}
                        onChange={(event) => setCampaignId(event.target.value)}
                        className="h-9 max-w-56 rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="">Choose campaign</option>
                        {destinations.map((campaign) => (
                          <option key={campaign.id} value={campaign.id}>
                            {campaignDisplayName(campaign.name)}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={attach.isPending}
                        disabled={
                          !handoffReady ||
                          !destinations.some(
                            (campaign) => campaign.id === campaignId,
                          ) ||
                          handingOff
                        }
                        onClick={() =>
                          attach.mutate({
                            brandId,
                            campaignId,
                            adIds: selectedAds.map((ad) => ad.id),
                          })
                        }
                      >
                        Add selected
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    loading={createCampaign.isPending}
                    disabled={
                      !handoffReady || handingOff || Boolean(createdCampaign)
                    }
                    onClick={() => createCampaign.mutate({ brandSlug })}
                  >
                    Create campaign from selected
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          <EmptyState compact icon={Images} title="Create the first ad" />
        )}
      </WorkspaceCard>
    </div>
  );
}
