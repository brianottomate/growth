"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles, X, House, Images, Search } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { WorkspaceCard } from "../../../WorkspaceCard";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ShapeBrandButton } from "../ShapeBrandButton";
import { toast } from "@/components/ui/toast";
import type { HotelFeedHome } from "@/lib/meta-hotel-feed";
import { MAX_SET_HOMES } from "@/lib/performance-ads";
import { orpc } from "@/orpc/client";

import { StudioGeneration } from "./StudioGeneration";
import { NewTextAdButton } from "@/app/app/brands/[brandSlug]/ads/_views/TextAdCard";
import { CreativeDrop } from "./CreativeDrop";
import { HomePicker } from "../HomePicker";
import { AddAdDialog } from "./AddAdDialog";
import { StudioIdeas, type StudioIdea } from "./StudioIdeas";

export type WorkspaceHome = HotelFeedHome & {
  imageUrl: string;
  thumbUrl: string | null;
  rating: number | null;
};

const DEFAULT_COUNT = 5;

/**
 * The brand's ad studio: ideas with no campaign and no platform.
 *
 * Build draws a set, from the homes picked here or from a count when none
 * are. Add and Drop put single ideas here by hand. Each idea is composed and
 * worded in the idea editor and frozen when done, which saves its images for
 * every size it includes; frozen ideas go to a campaign, where each platform
 * takes the sizes it needs.
 */
export function AdPreviewsWorkspace({
  brandId,
  brandSlug,
  brandName,
  brandLogo,
  website,
  homes,
  homeGroups,
  withoutPhoto,
  initialPicked,
  ideas,
  campaigns,
  hasHomes,
  focusHomeId,
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  /** The resolved brand mark (vector/PNG), used on the feed mocks. */
  brandLogo: string | null;
  website: string | null;
  homes: WorkspaceHome[];
  homeGroups: { id: string; name: string; homeIds: string[] }[];
  withoutPhoto: number;
  initialPicked: string[];
  ideas: StudioIdea[];
  /** Campaigns nothing has been pushed for yet, which can still take ads. */
  campaigns: { id: string; name: string }[];
  hasHomes: boolean;
  /** A single home a per-home link opened on: open and scroll to it. */
  focusHomeId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState<"all" | "review" | "approved">("all");
  const [kind, setKind] = useState<"all" | "text" | "creative">("all");
  const [search, setSearch] = useState("");
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const build = useMutation(
    orpc.ads.buildAdSet.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Drew ${result.ads.length} ads from ${result.homes.length} home${result.homes.length === 1 ? "" : "s"}${
            result.replaced > 0 ? `, replacing ${result.replaced}` : ""
          }.${result.note ? ` ${result.note}` : ""}`,
        );
        // A set built by count chose its homes; the pick shows which.
        commit(result.homes.map((home) => home.id));
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const writeCopy = useMutation(
    orpc.ads.writeSetCopy.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.updated > 0
            ? `Wrote copy on ${result.updated} ad${result.updated === 1 ? "" : "s"}.`
            : "Nothing to write copy on yet.",
        );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const attach = useMutation(
    orpc.ads.attachAdSet.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `${result.attached} ad${result.attached === 1 ? "" : "s"} moved to ${result.campaignName}.`,
        );
        router.push(
          `/app/performance/clients/${brandSlug}/campaigns/${result.campaignId}`,
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const [picked, setPicked] = useState<string[]>(initialPicked);
  // The router reuses this component when only the query string changes, so
  // state alone would keep the last set and quietly ignore the link someone
  // just opened. Reset it when the URL's set differs from what we are holding.
  const [fromUrl, setFromUrl] = useState(initialPicked.join(","));
  if (initialPicked.join(",") !== fromUrl) {
    setFromUrl(initialPicked.join(","));
    setPicked(initialPicked);
  }

  const byId = useMemo(
    () => new Map(homes.map((home) => [home.id, home])),
    [homes],
  );
  const pickedHomes = picked
    .map((id) => byId.get(id))
    .filter((home): home is WorkspaceHome => Boolean(home));

  const commit = (next: string[]) => {
    setPicked(next);
    const params = new URLSearchParams();
    if (next.length > 0) params.set("homes", next.join(","));
    router.replace(
      params.size ? `${pathname}?${params.toString()}` : pathname,
      { scroll: false },
    );
  };
  const toggle = (id: string) => {
    if (picked.includes(id)) return commit(picked.filter((x) => x !== id));
    if (picked.length >= MAX_SET_HOMES) return;
    commit([...picked, id]);
  };

  const allAds = ideas;
  const approved = allAds.filter((ad) => ad.status === "approved").length;
  const drafted = allAds.length > 0;
  const unapproved = allAds.length - approved;
  const replaceable = allAds.filter(
    (ad) => ad.status !== "approved" && "media" in ad.content,
  ).length;
  const runBuild = () =>
    build.mutate(
      pickedHomes.length > 0
        ? { brandId, propertyIds: pickedHomes.map((h) => h.id) }
        : { brandId, count },
    );

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
      <AddAdDialog brandId={brandId} homes={homes} />
      <NewTextAdButton brandId={brandId} website={website} />
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
      <AlertDialog open={confirmRebuild} onOpenChange={setConfirmRebuild}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rebuild the shells?</AlertDialogTitle>
            <AlertDialogDescription>
              {replaceable} unapproved creative ad{replaceable === 1 ? "" : "s"}{" "}
              and any edits on {replaceable === 1 ? "it" : "them"} are replaced.
              {approved > 0
                ? ` ${approved} approved ${approved === 1 ? "stays as it is" : "stay as they are"}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRebuild(false);
                runBuild();
              }}
            >
              Rebuild
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {kind !== "text" && (
        <WorkspaceCard
          title="Build creative ads"
          icon={House}
          count={`${picked.length}/${MAX_SET_HOMES}`}
          actions={
            <>
              {hasHomes && (
                <HomePicker
                  homes={homes}
                  picked={picked}
                  max={MAX_SET_HOMES}
                  onChange={commit}
                  label={picked.length ? "Change homes" : "Choose homes"}
                />
              )}
              {hasHomes && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={build.isPending}
                  onClick={() =>
                    drafted && replaceable > 0
                      ? setConfirmRebuild(true)
                      : runBuild()
                  }
                >
                  {build.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {drafted ? "Rebuild ads" : "Build ads"}
                </Button>
              )}
              {drafted && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={writeCopy.isPending}
                  onClick={() => writeCopy.mutate({ brandId })}
                >
                  <Sparkles className="size-3.5" />
                  Write copy
                </Button>
              )}
              <ShapeBrandButton
                brandId={brandId}
                brandName={brandName}
                section="home selection for ad ideas"
              />
            </>
          }
        >
          {homeGroups.length > 0 && (
            <select
              aria-label="Select a home group"
              value=""
              disabled={build.isPending}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              onChange={(event) => {
                const group = homeGroups.find(
                  (group) => group.id === event.target.value,
                );
                if (group) commit(group.homeIds);
              }}
            >
              <option value="">Use a home group</option>
              {homeGroups.map((group) => (
                <option
                  key={group.id}
                  value={group.id}
                  disabled={
                    !group.homeIds.length ||
                    group.homeIds.length > MAX_SET_HOMES
                  }
                >
                  {group.name} · {group.homeIds.length} homes
                  {group.homeIds.length > MAX_SET_HOMES
                    ? " (pick up to 10 individually)"
                    : ""}
                </option>
              ))}
            </select>
          )}
          {pickedHomes.length > 0 ? (
            <div className="space-y-3">
              <ul className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-3">
                {pickedHomes.map((home) => (
                  <li
                    key={home.id}
                    className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/40 p-2"
                  >
                    <img
                      src={home.thumbUrl ?? home.imageUrl}
                      alt=""
                      className="size-12 shrink-0 rounded-md object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {home.name}
                    </span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${home.name} from selection`}
                      onClick={() => toggle(home.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="ghost" onClick={() => commit([])}>
                Clear selection
              </Button>
            </div>
          ) : hasHomes ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <span>Choose automatically</span>
                <Input
                  aria-label="Number of homes to choose"
                  type="number"
                  min={1}
                  max={MAX_SET_HOMES}
                  value={count}
                  onChange={(event) =>
                    setCount(
                      Math.min(
                        MAX_SET_HOMES,
                        Math.max(1, Number(event.target.value) || 1),
                      ),
                    )
                  }
                  className="w-20"
                />
                <span>homes</span>
              </label>
            </div>
          ) : (
            <EmptyState
              compact
              icon={House}
              title="Add homes to build ads"
              description="Use saved homes, or add an ad and upload creative below."
              actions={
                <Link
                  href={`/app/performance/clients/${brandSlug}/wanderos`}
                  className="text-sm font-medium underline underline-offset-4"
                >
                  Open WanderOS
                </Link>
              }
            />
          )}
          {withoutPhoto > 0 && (
            <p className="text-xs text-muted-foreground">
              {withoutPhoto} {withoutPhoto === 1 ? "home needs" : "homes need"}{" "}
              a photo before they can be selected.
            </p>
          )}
        </WorkspaceCard>
      )}
      {kind !== "text" && <CreativeDrop brandId={brandId} homes={homes} />}
      <WorkspaceCard
        title="Ad ideas"
        icon={Images}
        count={ideas.length}
        actions={
          <>
            {addAction}
            <ShapeBrandButton
              brandId={brandId}
              brandName={brandName}
              section="ad ideas and creative review"
            />
          </>
        }
      >
        <StudioGeneration brandId={brandId} website={website} />
        {drafted ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <InputGroup>
                  <InputGroupAddon>
                    <Search className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Search ad ideas"
                    placeholder="Search ad ideas"
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
              {approved > 0 &&
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
                      onClick={() => attach.mutate({ brandId, campaignId })}
                    >
                      Add {approved} approved to campaign
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
                focusHomeId={focusHomeId}
              />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No ad ideas match these filters.
              </p>
            )}
          </>
        ) : (
          <EmptyState
            compact
            icon={Images}
            title="Create the first ad idea"
            description={
              kind === "text"
                ? "Write a text ad or generate copy from a landing page and search themes."
                : "Build ads from homes, start a blank ad, or upload finished creative."
            }
            actions={addAction}
          />
        )}
      </WorkspaceCard>
    </div>
  );
}
