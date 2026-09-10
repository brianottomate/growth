"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, EyeOff, X } from "lucide-react";

import { AdMock } from "@/components/ad-mock";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import type { CompositionFormatId } from "@/lib/compositions";
import {
  homeCatalogCopy,
  homeCatalogPreviewUrl,
  homePreviewRecipes,
  type HomeForPreview,
  type PreviewSpec,
} from "@/lib/home-ad-previews";
import type { HomeDetail, HomePhoto } from "@/server/services/homes.service";
import { useTRPC } from "@/trpc/react";

import { OnDemandTile } from "../../OnDemandTile";

// The sizes Brooke's own exports use: one file per creative per size.
const FORMATS: CompositionFormatId[] = ["square", "portrait", "story", "wide"];
/** Meta's carousel holds ten cards. */
const MAX_CAROUSEL = 10;

const panel = "bg-card overflow-hidden rounded-2xl border";
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";
const empty = cn(panel, "text-muted-foreground px-4 py-6 text-center text-xs");

/** The payload a photo becomes when the carousel is saved. */
const photoRef = (photo: HomePhoto) =>
  photo.assetId
    ? { assetId: photo.assetId, thumbUrl: photo.thumbUrl }
    : { sourceUrl: photo.url, thumbUrl: photo.thumbUrl };

/**
 * One home's workbench, in the three parts a photo can belong to: all of
 * them, the one the creatives draw on, and the ones the carousel runs.
 *
 * Each photo carries its own labelled controls rather than a badge, because
 * "hero" and "in the carousel" are separate choices and a photo can be both.
 * An earlier pass marked them with a star and a tick, which could never
 * disagree and so said nothing.
 */
export function HomeWorkbench({
  home,
  brandId,
  brandSlug,
  brandName,
  brandLogo,
}: {
  home: HomeDetail;
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [order, setOrder] = useState<string[]>(
    home.carousel.map((photo) => photo.key),
  );
  const [card, setCard] = useState(0);

  const byKey = useMemo(
    () => new Map(home.photos.map((photo) => [photo.key, photo])),
    [home.photos],
  );

  const onError = (error: { message: string }) => toast.error(error.message);
  const setHero = useMutation(
    trpc.brand.setHomeHero.mutationOptions({
      onSuccess: () => router.refresh(),
      onError,
    }),
  );
  const setMedia = useMutation(
    trpc.brand.setHomeMedia.mutationOptions({
      onSuccess: () => router.refresh(),
      onError,
    }),
  );
  const saveCarousel = useMutation(
    trpc.brand.setHomeCarousel.mutationOptions({
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
    setCard(0);
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
      toast.info(`A carousel holds ${MAX_CAROUSEL} cards.`);
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

  const facts: HomeForPreview = {
    name: home.name,
    city: home.city,
    state: home.state,
    bedrooms: home.bedrooms,
    bathrooms: home.bathrooms,
    guests: home.guests,
    rating: home.rating,
  };
  const recipes = homePreviewRecipes(facts);
  const catalog = homeCatalogCopy(facts);
  // With no hero picked the creatives still have to draw on something, and
  // the first photo is what the rest of the desk falls back to.
  const heroUrl = home.hero?.url ?? home.photos[0]?.url ?? null;
  const busy =
    setHero.isPending || setMedia.isPending || saveCarousel.isPending;

  return (
    <div className="space-y-8">
      {/* 1 · Every photo, and what each one is for */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={sectionLabel}>All photos · {home.photos.length}</p>
          <span className="text-muted-foreground/70 text-[11px]">
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbUrl}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                    {inCarousel ? (
                      <span
                        className="absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-full bg-sky-500 text-[10px] font-semibold text-white tabular-nums"
                        title={`Card ${position} of the carousel`}
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
                        photo.isHero
                          ? "Stop drawing the creatives on this"
                          : "Draw the creatives on this"
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
                          ? "Take out of the carousel"
                          : "Add to the carousel"
                      }
                    >
                      Carousel
                    </Chip>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 2 · The hero, and what it draws */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={sectionLabel}>Hero</p>
          {!home.hero && heroUrl ? (
            <span className="text-muted-foreground/80 text-[11px]">
              None picked, so the creatives use the first photo
            </span>
          ) : null}
        </div>
        {!heroUrl ? (
          <p className={empty}>Pick a hero above to draw the creatives.</p>
        ) : (
          <>
            <div className={cn(panel, "w-full max-w-56")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroUrl}
                alt=""
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            {recipes.map((recipe) => (
              <div key={recipe.id} className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={sectionLabel}>{recipe.label}</span>
                  <span className="text-muted-foreground/80 truncate text-[11px]">
                    {recipe.title}
                  </span>
                </div>
                <ul className="flex scrollbar-thin gap-4 overflow-x-auto pb-1">
                  {FORMATS.map((formatId) => {
                    const spec: PreviewSpec = {
                      brandId,
                      templateId: "hero-overlay",
                      formatId,
                      source: { url: heroUrl },
                      title: recipe.title,
                      cta: recipe.cta,
                    };
                    return (
                      <OnDemandTile
                        key={`${recipe.id}-${formatId}`}
                        variant="canvas"
                        brandId={brandId}
                        brandSlug={brandSlug}
                        brandName={brandName}
                        brandLogo={brandLogo}
                        spec={spec}
                        home={{
                          name: home.name,
                          url: home.url,
                          imageUrl: heroUrl,
                        }}
                      />
                    );
                  })}
                </ul>
              </div>
            ))}
          </>
        )}
      </section>

      {/* 3 · The carousel, in the order it runs */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={sectionLabel}>
            Carousel · {carousel.length}/{MAX_CAROUSEL}
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
        {carousel.length === 0 ? (
          <p className={empty}>
            Nothing in the carousel. Add photos from All photos above.
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {carousel.map((photo, index) => (
                <li key={photo.key} className={cn(panel, "w-28")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbUrl}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  <div className="text-muted-foreground flex items-center justify-between px-1 py-1 text-[10px]">
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
            {carousel.length >= 2 ? (
              <div className="flex justify-center pt-1 @2xl:justify-start">
                <AdMock
                  surface="instagram"
                  brandName={brandName}
                  brandLogo={brandLogo}
                  body={[catalog.title, catalog.subtitle]
                    .filter(Boolean)
                    .join(". ")}
                  headline={home.name}
                  link={home.url}
                  callToAction="See details"
                  media={carousel.map((photo) => ({
                    url: homeCatalogPreviewUrl({
                      brandId,
                      source: { url: photo.url },
                      formatId: "square",
                      copy: catalog,
                    }),
                    thumbnail: null,
                    type: "image",
                  }))}
                  card={card}
                  onCard={setCard}
                  className="w-full max-w-96"
                />
              </div>
            ) : (
              <p className="text-muted-foreground text-[11px]">
                Two cards is the minimum Meta will run.
              </p>
            )}
          </>
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
          : "text-muted-foreground hover:text-foreground hover:border-white/30",
      )}
    >
      {children}
    </button>
  );
}
