"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";

import { toast } from "@/components/ui/toast";
import type { HotelFeedHome } from "@/lib/meta-hotel-feed";
import { useTRPC } from "@/trpc/react";

import { MAX_SET_HOMES } from "@/lib/performance-ads";

import { HomePicker } from "../HomePicker";
import { AdSetReview, type ReviewAd } from "./AdSetReview";

export type WorkspaceHome = HotelFeedHome & {
  imageUrl: string;
  thumbUrl: string | null;
  rating: number | null;
};

// `_components` reaches the desk service, which is server-only; the section
// label is spelled out here.
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";

/**
 * The brand's ad draft space: the homes a set runs on, and the set itself.
 *
 * The pick lives in the URL so a link carries it. Building writes real ad
 * rows against the brand with no campaign, which is what makes the set
 * something you can review, adjust and come back to rather than a picture
 * that disappears on reload.
 */
export function AdPreviewsWorkspace({
  brandId,
  brandName,
  brandLogo,
  homes,
  withoutPhoto,
  initialPicked,
  ads,
}: {
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  homes: WorkspaceHome[];
  withoutPhoto: number;
  initialPicked: string[];
  ads: ReviewAd[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const trpc = useTRPC();
  const build = useMutation(
    trpc.ads.buildAdSet.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Drew ${result.ads.length} ads${result.replaced > 0 ? `, replacing ${result.replaced}` : ""}.`,
        );
        router.refresh();
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

  return (
    <div className="space-y-7">
      {/* 1 · The set, as chips. Changing it is a dialog, because the set is
             a handful chosen once and a permanent grid of two hundred tiles
             was a lot of page to carry that. */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={sectionLabel}>
            Homes for the ads · {picked.length}/{MAX_SET_HOMES}
          </p>
          <div className="flex items-center gap-3">
            {picked.length > 0 ? (
              <button
                type="button"
                onClick={() => commit([])}
                className="text-[11.5px] text-sky-300 hover:underline"
              >
                Clear
              </button>
            ) : null}
            <HomePicker
              homes={homes}
              picked={picked}
              max={MAX_SET_HOMES}
              onChange={commit}
              label={picked.length > 0 ? "Change homes" : "Add homes"}
            />
          </div>
        </div>

        {pickedHomes.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {pickedHomes.map((home) => (
              <li key={home.id}>
                <button
                  type="button"
                  onClick={() => toggle(home.id)}
                  className="hover:bg-muted flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-[11.5px]"
                  title="Take out of the set"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={home.thumbUrl ?? home.imageUrl}
                    alt=""
                    className="size-5 rounded-full object-cover"
                  />
                  <span className="max-w-44 truncate">{home.name}</span>
                  <X className="text-muted-foreground size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {withoutPhoto > 0 ? (
          <p className="text-muted-foreground text-[11px]">
            {withoutPhoto} {withoutPhoto === 1 ? "home has" : "homes have"} no
            photo on the feed and cannot be a card.
          </p>
        ) : null}
      </section>

      {/* 2 · The set itself, drafted and reviewable */}
      <AdSetReview
        brandName={brandName}
        brandLogo={brandLogo}
        ads={ads}
        canBuild={pickedHomes.length > 0}
        building={build.isPending}
        onBuild={() =>
          build.mutate({ brandId, propertyIds: pickedHomes.map((h) => h.id) })
        }
      />
    </div>
  );
}
