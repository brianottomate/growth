"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DeleteAlert } from "@/components/ui/alert-dialog";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

/** A feed listing the setup grid can offer. */
export type FeedListing = {
  id: string;
  name: string;
  imageUrl: string;
  thumbUrl: string | null;
  facts: string;
};

/** A committed home (a `home` row), enriched from its feed listing when matched. */
export type PickedHome = {
  id: string;
  externalId: string;
  source: "wanderos" | "wander" | "manual";
  name: string;
  hero: string | null;
  images: string[];
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

export function SetupHomes({
  brandId,
  brandSlug,
  brandWebsite,
  feed,
  picked,
}: {
  brandId: string;
  brandSlug: string;
  brandWebsite: string | null;
  feed: FeedListing[];
  picked: PickedHome[];
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [confirming, setConfirming] = useState<PickedHome | null>(null);

  const byExternal = new Map(picked.map((home) => [home.externalId, home]));
  const count = picked.length;

  const add = useMutation(
    trpc.brand.homesAddWanderOs.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
      onSettled: () => setBusyId(null),
    }),
  );
  const remove = useMutation(
    trpc.brand.homesRemove.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
      onSettled: () => setBusyId(null),
    }),
  );
  const shells = useMutation(
    trpc.brand.homesShellsFromText.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Added ${result.added} home${result.added === 1 ? "" : "s"}.`,
        );
        setPaste("");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function toggleListing(listing: FeedListing) {
    const existing = byExternal.get(listing.id);
    if (existing) {
      setBusyId(listing.id);
      remove.mutate({ brandId, homeId: existing.id });
      return;
    }
    if (count >= MAX) {
      toast.error("Ten is the most a set runs on.");
      return;
    }
    setBusyId(listing.id);
    add.mutate({ brandId, externalId: listing.id });
  }

  function confirmRemove() {
    if (!confirming) return;
    setBusyId(confirming.id);
    remove.mutate({ brandId, homeId: confirming.id });
    setConfirming(null);
  }

  const ready = count >= MIN;
  // Carry the pick to the Ads workspace so it opens ready to draw on exactly
  // these homes. The wall keys homes by their feed id, which is the home's
  // externalId; a manual shell has no feed listing to draw from, so it is not
  // carried.
  const setIds = picked
    .filter((home) => home.source === "wanderos")
    .map((home) => home.externalId);
  const adsHref =
    `/app/performance/brands/${brandSlug}/ads` +
    (setIds.length > 0 ? `?homes=${encodeURIComponent(setIds.join(","))}` : "");

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Picked
            </span>
            <span
              className={cn(
                "text-[11px]",
                ready ? "text-emerald-400" : "text-muted-foreground",
              )}
            >
              {count}/{MAX}
              {count < MIN ? " · pick at least three" : ""}
            </span>
          </div>
          {ready ? (
            <ButtonLink href={adsHref} size="sm">
              Continue to Ads
            </ButtonLink>
          ) : (
            <Button size="sm" disabled title="Pick at least three homes">
              Continue to Ads
            </Button>
          )}
        </div>

        {picked.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing picked yet.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {picked.map((home) => {
              const thumbs = home.images
                .filter((url) => url !== home.hero)
                .slice(0, 4);
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
                      <button
                        type="button"
                        onClick={() => setConfirming(home)}
                        disabled={busy}
                        aria-label={`Remove ${home.name}`}
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </div>
                    {thumbs.length > 0 ? (
                      <div className="mt-1.5 flex gap-1">
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
      </div>

      {feed.length > 0 ? (
        <div className="space-y-3">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            From their WanderOS site · {feed.length}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {feed.map((listing) => {
              const isPicked = byExternal.has(listing.id);
              const busy = busyId === listing.id;
              return (
                <button
                  key={listing.id}
                  type="button"
                  onClick={() => toggleListing(listing)}
                  disabled={busy || (!isPicked && count >= MAX)}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border text-left transition",
                    isPicked
                      ? "border-sky-400 ring-1 ring-sky-400"
                      : "border-border hover:border-foreground/40",
                    !isPicked && count >= MAX && "opacity-40",
                  )}
                >
                  <div className="relative aspect-[4/3] w-full bg-muted">
                    <Image
                      src={listing.thumbUrl ?? listing.imageUrl}
                      alt={listing.name}
                      fill
                      sizes="(max-width: 640px) 50vw, 20vw"
                      className="object-cover"
                      unoptimized
                    />
                    <span
                      className={cn(
                        "absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full text-white",
                        isPicked ? "bg-sky-500" : "bg-black/40",
                      )}
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : isPicked ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                    </span>
                  </div>
                  <div className="space-y-0.5 p-2">
                    <div className="truncate text-xs font-medium">
                      {listing.name}
                    </div>
                    {listing.facts ? (
                      <div className="truncate text-[10.5px] text-muted-foreground">
                        {listing.facts}
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            No WanderOS feed — paste the homes
          </div>
          <p className="max-w-2xl text-xs text-muted-foreground">
            {brandWebsite
              ? "Their site is not a WanderOS site, so there is no feed to read."
              : "No website on record."}{" "}
            Paste an email, a list, or a table and the agent pulls out the homes
            it names. Only stated facts are kept.
          </p>
          <Textarea
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            rows={6}
            placeholder={
              "Sycamore — 3 bd, sleeps 8, Logan OH\nElk Ridge, 2 bedrooms, $240/night\n..."
            }
            className="max-w-2xl"
          />
          <div>
            <Button
              size="sm"
              onClick={() => shells.mutate({ brandId, text: paste })}
              disabled={shells.isPending || paste.trim().length === 0}
            >
              {shells.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Reading…
                </>
              ) : (
                "Create homes from this"
              )}
            </Button>
          </div>
        </div>
      )}

      <DeleteAlert
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        onConfirm={confirmRemove}
        title={confirming ? `Remove ${confirming.name}?` : "Remove home?"}
        description="This deletes the home from this brand. You can add it back from the feed any time."
        isLoading={remove.isPending}
      />
    </div>
  );
}
