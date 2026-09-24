"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, EyeOff, X } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import type { HomeDetail, HomePhoto } from "@/server/services/homes.service";
import { orpc } from "@/orpc/client";

const MAX_CAROUSEL = 10;

const panel = "bg-card overflow-hidden rounded-2xl border";
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";
const empty = cn(panel, "px-4 py-6 text-center text-xs text-muted-foreground");

/** The payload a photo becomes when the carousel is saved. */
const photoRef = (photo: HomePhoto) =>
  photo.assetId
    ? { assetId: photo.assetId, thumbUrl: photo.thumbUrl }
    : { sourceUrl: photo.url, thumbUrl: photo.thumbUrl };

/** Choose the hero and ordered source photos for new campaign ads. */
export function HomeWorkbench({ home }: { home: HomeDetail }) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(
    home.carousel.map((photo) => photo.key),
  );

  const byKey = useMemo(
    () => new Map(home.photos.map((photo) => [photo.key, photo])),
    [home.photos],
  );

  const onError = (error: { message: string }) => toast.error(error.message);
  const setHero = useMutation(
    orpc.brand.setHomeHero.mutationOptions({
      onSuccess: () => router.refresh(),
      onError,
    }),
  );
  const setMedia = useMutation(
    orpc.brand.setHomeMedia.mutationOptions({
      onSuccess: () => router.refresh(),
      onError,
    }),
  );
  const saveCarousel = useMutation(
    orpc.brand.setHomeCarousel.mutationOptions({
      onSuccess: () => router.refresh(),
      onError,
    }),
  );

  /** The carousel as photos, dropping any key whose photo has since gone. */
  const carousel = order.flatMap((key) => {
    const photo = byKey.get(key);
    return photo ? [photo] : [];
  });

  const commit = (keys: string[]) => {
    setOrder(keys);
    saveCarousel.mutate({
      homeId: home.id,
      photos: keys.flatMap((key) => {
        const photo = byKey.get(key);
        return photo ? [photoRef(photo)] : [];
      }),
    });
  };
  const toggleCarousel = (photo: HomePhoto) => {
    if (order.includes(photo.key)) {
      return commit(order.filter((key) => key !== photo.key));
    }
    if (order.length >= MAX_CAROUSEL) {
      toast.info(`Choose up to ${MAX_CAROUSEL} ad photos.`);
      return;
    }
    commit([...order, photo.key]);
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    commit(next);
  };

  const heroUrl = home.heroSourceUrl;
  const busy =
    setHero.isPending || setMedia.isPending || saveCarousel.isPending;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className={sectionLabel}>Hero preview</p>
        {heroUrl ? (
          <div className={cn(panel, "w-full max-w-sm")}>
            {/* oxlint-disable-next-line nextjs/no-img-element */}
            <img
              src={heroUrl}
              alt={home.name}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        ) : (
          <p className={empty}>Choose a hero from the gallery below.</p>
        )}
        <p className="text-xs text-muted-foreground">
          The lead photo for new ads. Choose Hero on any photo below to change
          it.
        </p>
      </section>
      {/* Saved shortlist; existing campaign ads are unchanged. */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={sectionLabel}>
            Ad photos · {carousel.length}/{MAX_CAROUSEL}
          </p>
          {carousel.length > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => commit([])}
              className="text-[11.5px] text-sky-300 hover:underline disabled:opacity-50"
            >
              Clear
            </button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          The hero leads new ads, followed by these photos in order (up to 10
          total). Existing ads stay unchanged.
        </p>
        {carousel.length === 0 ? (
          <p className={empty}>
            No shortlist yet. New ads will use the hero and gallery. Choose Ad
            photo below to curate the selection.
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {carousel.map((photo, index) => (
                <li key={photo.key} className={cn(panel, "w-28")}>
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
                  <img
                    src={photo.thumbUrl}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  <div className="flex items-center justify-between px-1 py-1 text-[10px] text-muted-foreground">
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                      title="Earlier"
                      className="hover:text-foreground disabled:opacity-25"
                    >
                      <ChevronLeft className="size-3.5" />
                    </button>
                    <span className="tabular-nums">{index + 1}</span>
                    <button
                      type="button"
                      disabled={busy || index === carousel.length - 1}
                      onClick={() => move(index, 1)}
                      title="Later"
                      className="hover:text-foreground disabled:opacity-25"
                    >
                      <ChevronRight className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleCarousel(photo)}
                      title="Take out"
                      className="hover:text-foreground disabled:opacity-25"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {/* 1 · Every photo, and what each one is for */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={sectionLabel}>All photos · {home.photos.length}</p>
          <span className="text-[11px] text-muted-foreground/70">
            {home.photos.some((photo) => photo.from === "library")
              ? "their site and uploads"
              : "from their site"}
          </span>
        </div>
        {home.photos.length === 0 ? (
          <p className={empty}>No photos on their feed for this home.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-6">
            {home.photos.map((photo) => {
              const inCarousel = order.includes(photo.key);
              const position = order.indexOf(photo.key) + 1;
              return (
                <li key={photo.key} className={cn(panel, "group")}>
                  <div className="relative">
                    {/* oxlint-disable-next-line nextjs/no-img-element */}
                    <img
                      src={photo.thumbUrl}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                    {inCarousel ? (
                      <span
                        className="absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-full bg-sky-500 text-[10px] font-semibold text-white tabular-nums"
                        title={`Ad photo ${position}`}
                      >
                        {position}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setMedia.mutate({
                          homeId: home.id,
                          ...photoRef(photo),
                          role: "excluded",
                        })
                      }
                      title="Hide this photo"
                      className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full border border-white/50 bg-black/50 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
                    >
                      <EyeOff className="size-3" />
                    </button>
                  </div>
                  {photo.room ? (
                    <p className="truncate px-2 pt-1.5 text-[10px] text-muted-foreground">
                      {photo.room}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-1 px-1.5 py-1.5">
                    <Chip
                      on={photo.isHero}
                      disabled={busy}
                      onClick={() =>
                        setHero.mutate({
                          homeId: home.id,
                          sourceUrl: photo.isHero ? null : photo.url,
                        })
                      }
                      title={
                        photo.isHero ? "Clear hero selection" : "Use as hero"
                      }
                    >
                      Hero
                    </Chip>
                    <Chip
                      on={inCarousel}
                      disabled={busy}
                      onClick={() => toggleCarousel(photo)}
                      title={
                        inCarousel
                          ? "Remove from ad photos"
                          : "Add to ad photos"
                      }
                    >
                      Ad photo
                    </Chip>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A labelled on/off control, because a photo can be hero and in the carousel. */
function Chip({
  on,
  disabled,
  onClick,
  title,
  children,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        "flex-1 rounded-full border px-2 py-1 text-[10.5px] font-medium whitespace-nowrap transition disabled:opacity-40",
        on
          ? "border-sky-400 bg-sky-500/20 text-sky-200"
          : "text-muted-foreground hover:border-white/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
