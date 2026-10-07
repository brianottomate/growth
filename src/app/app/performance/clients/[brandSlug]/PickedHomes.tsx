"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { House, Loader2, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DeleteAlert } from "@/components/ui/alert-dialog";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { ShapeBrandButton } from "./ShapeBrandButton";
import { EmptyState } from "@/components/ui/empty-state";
import { featuredHomeAdditions } from "@/lib/featured-home-selection";
import { orpc } from "@/orpc/client";

/** A committed home (a `home` row), enriched from its feed listing when matched. */
export type PickedHome = {
  id: string;
  externalId: string;
  source: "wanderos" | "wander" | "manual";
  name: string;
  hero: string | null;
  images: string[];
  /** Total photos on the listing, from the cached gallery (not just `images`). */
  photoCount: number;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  rating: number | null;
  nightlyFrom: number | null;
  city: string | null;
  state: string | null;
  offFeed: boolean;
};

const MAX = 10;
const MIN = 3;

function factsLine(home: PickedHome): string {
  const rating =
    home.rating != null
      ? home.rating > 5
        ? home.rating / 2
        : home.rating
      : null;
  return [
    home.bedrooms ? `${home.bedrooms} bd` : null,
    home.bathrooms ? `${home.bathrooms} ba` : null,
    home.guests ? `${home.guests} guests` : null,
    rating ? `★${rating.toFixed(1)}` : null,
    home.nightlyFrom ? `from $${home.nightlyFrom}` : null,
    [home.city, home.state].filter(Boolean).join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The homes currently in focus: the picked set as rich cards (hero, a strip of
 * more photos, facts, remove), with the count and the way on to the ads. This
 * is the head of the Homes tab; the grid below is how the set is chosen.
 */
export function PickedHomes({
  brandId,
  brandName,
  brandSlug,
  picked,
  embedded = false,
  groupActions,
  title = "Featured homes",
  label,
}: {
  brandId: string;
  brandName: string;
  brandSlug: string;
  picked: PickedHome[];
  embedded?: boolean;
  groupActions?: ReactNode;
  /** The group's name when it is not our Featured suggestion. */
  title?: string;
  /** Beside the count: which group this is and where it came from. */
  label?: ReactNode;
}) {
  const TitleTag = embedded ? "h3" : "h2";
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const suggest = useMutation(
    orpc.performance.suggestFeaturedHomes.mutationOptions(),
  );
  const feature = useMutation(orpc.brand.homesSetFeatured.mutationOptions());
  const select = async () => {
    setSelecting(true);
    try {
      const { picks } = await suggest.mutateAsync({ brandId, count: 5 });
      const additions = featuredHomeAdditions(
        picks,
        picked.map((home) => home.id),
        MAX,
      );
      for (const homeId of additions)
        await feature.mutateAsync({ homeId, featured: true });
      toast.info(
        additions.length
          ? `Featured ${additions.length} homes`
          : "The recommended homes are already featured.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not select homes.",
      );
    } finally {
      setSelecting(false);
      router.refresh();
    }
  };
  const actions = (primary = false) => (
    <>
      <Button
        size="sm"
        variant={primary ? "default" : "outline"}
        loading={selecting}
        disabled={picked.length >= MAX}
        onClick={() => void select()}
      >
        {!selecting && <Sparkles className="size-3.5" />}
        {selecting ? "Selecting homes…" : "Select homes"}
      </Button>
      <ShapeBrandButton
        brandId={brandId}
        brandName={brandName}
        section="featured homes"
      />
    </>
  );
  const [confirming, setConfirming] = useState<PickedHome | null>(null);

  const count = picked.length;
  const ready = count >= MIN;

  const remove = useMutation(
    orpc.brand.homesRemove.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
      onSettled: () => setBusyId(null),
    }),
  );

  function confirmRemove() {
    if (!confirming) return;
    setBusyId(confirming.id);
    remove.mutate({ brandId, homeId: confirming.id });
    setConfirming(null);
  }

  return (
    <section
      className={embedded ? "space-y-3" : "space-y-3 rounded-xl border p-4"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <TitleTag className="text-base font-semibold">{title}</TitleTag>
          <span
            className={cn(
              "text-[11px]",
              ready ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {count}/{MAX}
            {count < MIN ? " · pick at least three" : ""}
          </span>
          {label}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions()}
          {groupActions}
        </div>
      </div>

      {picked.length === 0 ? (
        <EmptyState
          compact
          icon={House}
          title="Choose the homes that lead"
          description={
            selecting ? (
              <span role="status">
                Reviewing the homes and selecting the featured set…
              </span>
            ) : undefined
          }
          actions={actions(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 @xl:grid-cols-2">
          {picked.map((home) => {
            const rest = home.images.filter((url) => url !== home.hero);
            const thumbs = rest.slice(0, 5);
            // Photos beyond the hero and the thumbnails shown, so the tile can
            // say how many more the gallery holds.
            const overflow = Math.max(0, home.photoCount - 1 - thumbs.length);
            const busy = busyId === home.id;
            return (
              <div
                key={home.id}
                className="flex gap-3 rounded-xl border bg-card p-2.5"
              >
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {home.hero ? (
                    <Image
                      src={home.hero}
                      alt={home.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {home.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {factsLine(home) ||
                          (home.source === "manual"
                            ? "Typed-in shell"
                            : "No facts on the feed")}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Link
                        href={`/app/performance/clients/${brandSlug}/homes/${encodeURIComponent(home.externalId)}`}
                        aria-label={`Edit ${home.name}`}
                        className="mr-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        Edit home
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirming(home)}
                        disabled={busy}
                        aria-label={`Remove ${home.name}`}
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  {thumbs.length > 0 ? (
                    <div className="mt-1.5 flex items-center gap-1">
                      {thumbs.map((url) => (
                        <div
                          key={url}
                          className="relative size-9 overflow-hidden rounded bg-muted"
                        >
                          <Image
                            src={url}
                            alt=""
                            fill
                            sizes="36px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ))}
                      {overflow > 0 ? (
                        <div className="flex size-9 shrink-0 items-center justify-center rounded bg-muted text-[10.5px] font-medium text-muted-foreground">
                          +{overflow}
                        </div>
                      ) : null}
                    </div>
                  ) : home.offFeed ? (
                    <div className="mt-1.5 text-[10.5px] text-muted-foreground">
                      No longer on their feed.
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DeleteAlert
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        onConfirm={confirmRemove}
        title={confirming ? `Remove ${confirming.name}?` : "Remove home?"}
        description="This deletes the home from this brand. You can add it back from the grid any time."
        isLoading={remove.isPending}
      />
    </section>
  );
}
