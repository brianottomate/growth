"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Images, Search } from "lucide-react";

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
import { orpc } from "@/orpc/client";

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
  homes,
  connected,
  ideas,
  campaigns,
  focusHomeId,
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  /** The resolved brand mark (vector/PNG), used on the feed mocks. */
  brandLogo: string | null;
  website: string | null;
  homes: WorkspaceHome[];
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
  const [search, setSearch] = useState("");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const attach = useMutation(
    orpc.ads.attachAdSet.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `${result.attached} ad${result.attached === 1 ? "" : "s"} assigned to ${result.campaignName}.`,
        );
        router.push(
          `/app/performance/clients/${brandSlug}/campaigns/${result.campaignId}`,
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const approvedAds = ideas.filter(
    (ad) => ad.status === "approved" && !ad.campaignId,
  );
  const approved = ideas.filter((ad) => ad.status === "approved").length;
  const attachable = approvedAds.length;
  const drafted = ideas.length > 0;
  const unapproved = ideas.filter((ad) => ad.status !== "approved").length;

  const visible = ideas.filter(
    (idea) =>
      (kind === "all" || (kind === "creative") === "media" in idea.content) &&
      (filter === "all" ||
        (filter === "approved"
          ? idea.status === "approved"
          : idea.status !== "approved")) &&
      `${idea.name} ${idea.home?.name ?? "Brand-wide"}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const addAction = (
    <div className="flex flex-wrap gap-2">
      <AddAdDialog brandId={brandId} website={website} />
    </div>
  );
  return (
    <div className="space-y-4">
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
      {kind !== "text" && (
        <StudioGeneration
          brandId={brandId}
          brandSlug={brandSlug}
          connected={connected}
        />
      )}
      <WorkspaceCard
        title="Ads"
        icon={Images}
        count={ideas.length}
        actions={
          <>
            {addAction}
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
              {attachable > 0 &&
                (campaigns.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Destination campaign"
                      value={campaignId}
                      onChange={(event) => setCampaignId(event.target.value)}
                      className="h-9 max-w-56 rounded-md border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={attach.isPending}
                      disabled={!campaignId}
                      onClick={() =>
                        attach.mutate({
                          brandId,
                          campaignId,
                          adIds: approvedAds.map((ad) => ad.id),
                        })
                      }
                    >
                      Add {attachable} approved to campaign
                    </Button>
                  </div>
                ) : (
                  <Link
                    href={`/app/performance/clients/${brandSlug}/campaigns`}
                    className="text-sm font-medium underline underline-offset-4"
                  >
                    Create a campaign for approved ads
                  </Link>
                ))}
            </div>
            {visible.length ? (
              <StudioIdeas
                ideas={visible}
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
              <p className="py-6 text-center text-sm text-muted-foreground">
                No ads match these filters.
              </p>
            )}
          </>
        ) : (
          <EmptyState
            compact
            icon={Images}
            title="Create the first ad"
            description={
              kind === "text"
                ? "Create a text ad with headlines, descriptions and a destination URL."
                : "Build ads from a home group, or create an individual ad and add its creative in the editor."
            }
          />
        )}
      </WorkspaceCard>
    </div>
  );
}
