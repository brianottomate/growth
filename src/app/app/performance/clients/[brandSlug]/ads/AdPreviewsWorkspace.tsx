"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles, X } from "lucide-react";

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
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import type { HotelFeedHome } from "@/lib/meta-hotel-feed";
import { MAX_SET_HOMES } from "@/lib/performance-ads";
import { orpc } from "@/orpc/client";

import { HomePicker } from "../HomePicker";
import { AddAdDialog } from "./AddAdDialog";
import { CreativeDrop } from "./CreativeDrop";
import { StudioIdeas, type StudioIdea } from "./StudioIdeas";

export type WorkspaceHome = HotelFeedHome & {
  imageUrl: string;
  thumbUrl: string | null;
  rating: number | null;
};

// `_components` reaches the desk service, which is server-only; the section
// label is spelled out here.
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";
const panel = "bg-card overflow-hidden rounded-2xl border";
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
  homes,
  withoutPhoto,
  initialPicked,
  ideas,
  campaigns,
  hasSite,
  website,
  focusHomeId,
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  /** The resolved brand mark (vector/PNG), used on the feed mocks. */
  brandLogo: string | null;
  homes: WorkspaceHome[];
  withoutPhoto: number;
  initialPicked: string[];
  ideas: StudioIdea[];
  /** Campaigns nothing has been pushed for yet, which can still take ads. */
  campaigns: { id: string; name: string }[];
  hasSite: boolean;
  website: string | null;
  /** A single home a per-home link opened on: open and scroll to it. */
  focusHomeId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
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
          `${result.attached} ad${result.attached === 1 ? "" : "s"} now in ${result.campaignName}.`,
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
  const runBuild = () =>
    build.mutate(
      pickedHomes.length > 0
        ? { brandId, propertyIds: pickedHomes.map((h) => h.id) }
        : { brandId, count },
    );

  return (
    <div className="space-y-7">
      <AlertDialog open={confirmRebuild} onOpenChange={setConfirmRebuild}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rebuild the shells?</AlertDialogTitle>
            <AlertDialogDescription>
              {unapproved} unapproved ad{unapproved === 1 ? "" : "s"} and any
              edits on {unapproved === 1 ? "it" : "them"} are replaced.
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
      {/* 1 · The homes the set runs on, as chips, and the build. */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={sectionLabel}>
            Homes for the ads · {picked.length}/{MAX_SET_HOMES}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {picked.length > 0 ? (
              <button
                type="button"
                onClick={() => commit([])}
                className="text-[11.5px] text-sky-300 hover:underline"
              >
                Clear
              </button>
            ) : null}
            {hasSite ? (
              <HomePicker
                homes={homes}
                picked={picked}
                max={MAX_SET_HOMES}
                onChange={commit}
                label={picked.length > 0 ? "Change homes" : "Pick homes"}
              />
            ) : null}
            {hasSite && picked.length === 0 ? (
              <label className="flex items-center gap-1.5 text-[11.5px]">
                <span className="text-muted-foreground">or let it choose</span>
                <input
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
                  className="h-7 w-12 rounded-full border bg-muted/40 text-center text-xs outline-none focus:ring-2 focus:ring-sky-400/40"
                />
                <span className="text-muted-foreground">homes</span>
              </label>
            ) : null}
            {hasSite ? (
              <Button
                size="sm"
                disabled={build.isPending}
                onClick={() =>
                  drafted && allAds.length > approved
                    ? setConfirmRebuild(true)
                    : runBuild()
                }
                shape="round"
                density="editorial"
              >
                {build.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                {drafted ? "Rebuild the shells" : "Build the shells"}
              </Button>
            ) : null}
            {hasSite && drafted ? (
              <Button
                size="sm"
                variant="outline"
                disabled={writeCopy.isPending}
                onClick={() => writeCopy.mutate({ brandId })}
                shape="round"
                density="editorial"
              >
                {writeCopy.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                Write copy
              </Button>
            ) : null}
          </div>
        </div>

        {pickedHomes.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {pickedHomes.map((home) => (
              <li key={home.id}>
                <button
                  type="button"
                  onClick={() => toggle(home.id)}
                  className="flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-[11.5px] hover:bg-muted"
                  title="Take out of the set"
                >
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
                  <img
                    src={home.thumbUrl ?? home.imageUrl}
                    alt=""
                    className="size-5 rounded-full object-cover"
                  />
                  <span className="max-w-44 truncate">{home.name}</span>
                  <X className="size-3 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {!hasSite ? (
          <p className="text-[11px] text-muted-foreground">
            {website
              ? "Not a WanderOS site, so there is no catalog to build from. Ads can still be added by hand and filled by upload."
              : "No website on record, so there is no catalog to build from. Ads can still be added by hand and filled by upload."}
          </p>
        ) : withoutPhoto > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {withoutPhoto} {withoutPhoto === 1 ? "home has" : "homes have"} no
            photo on the feed and cannot be a card.
          </p>
        ) : null}
      </section>

      {/* 2 · By hand: an empty ad, or finished files. */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={sectionLabel}>By hand</p>
          <div className="flex flex-wrap items-center gap-2">
            <AddAdDialog brandId={brandId} homes={homes} />
            {approved > 0 ? (
              campaigns.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={campaignId}
                    onChange={(event) => setCampaignId(event.target.value)}
                    className="h-7 max-w-56 truncate rounded-full border bg-muted/40 px-2.5 text-[11.5px] outline-none focus:ring-2 focus:ring-sky-400/40"
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
                    disabled={!campaignId || attach.isPending}
                    onClick={() => attach.mutate({ brandId, campaignId })}
                    shape="round"
                    density="editorial"
                  >
                    Add {approved} frozen to campaign
                  </Button>
                </div>
              ) : (
                <Link
                  href={`/app/brands/${brandSlug}/ads`}
                  className="text-[11.5px] text-sky-300 hover:underline"
                >
                  New campaign for the {approved} frozen
                </Link>
              )
            ) : null}
          </div>
        </div>
        <CreativeDrop brandId={brandId} homes={homes} />
      </section>

      {/* 3 · Every idea, by home. */}
      {drafted ? (
        <StudioIdeas
          ideas={ideas}
          brandId={brandId}
          brandName={brandName}
          brandLogo={brandLogo}
          focusHomeId={focusHomeId}
        />
      ) : (
        <p
          className={cn(
            panel,
            "px-4 py-8 text-center text-xs text-muted-foreground",
          )}
        >
          {hasSite
            ? "No ideas yet. Build a set, add an ad, or drop finished creatives."
            : "No ideas yet. Add an ad or drop finished creatives."}
        </p>
      )}
    </div>
  );
}
