"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Star } from "lucide-react";

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
import type { HomeDetail } from "@/server/services/homes.service";
import { useTRPC } from "@/trpc/react";

import { OnDemandTile } from "../../OnDemandTile";

// The sizes Brooke's own exports use, in her order: the folder is a home's
// name, then one file per creative per size.
const FORMATS: CompositionFormatId[] = ["square", "portrait", "story", "wide"];

const panel = "bg-card overflow-hidden rounded-2xl border";
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";

/**
 * One home's workbench: its photos, the creatives those photos make in every
 * size, its own carousel, and the listing card Meta would draw from a catalog.
 *
 * The photo picker is the only thing here that writes: choosing one records
 * it on the home, because which photo the ads draw on is a decision and not
 * something the feed can tell us. Everything else is drawn on demand.
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
  const [source, setSource] = useState<string | null>(
    home.heroSourceUrl ?? home.photos[0]?.url ?? null,
  );
  const [card, setCard] = useState(0);

  const setHero = useMutation(
    trpc.brand.setHomeHero.mutationOptions({
      onSuccess: () => {
        toast.success("The ads draw on that photo now.");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

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
  const chosen = source ?? home.photos[0]?.url ?? null;

  // Its own carousel: a walk through this house, one card per photo, which is
  // the shape a listing carousel actually takes.
  const carousel = home.photos.slice(0, 10).map((photo) => ({
    url: homeCatalogPreviewUrl({
      brandId,
      source: { url: photo.url },
      formatId: "square",
      copy: catalog,
    }),
    thumbnail: null,
    type: "image",
  }));

  return (
    <div className="space-y-7">
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={sectionLabel}>
            Photos · {home.photos.length}
            {home.photos.some((photo) => photo.from === "library")
              ? " · some uploaded"
              : " · from their site"}
          </p>
          {home.heroSourceUrl ? (
            <button
              type="button"
              disabled={setHero.isPending}
              onClick={() =>
                setHero.mutate({ homeId: home.id, sourceUrl: null })
              }
              className="text-[11.5px] text-sky-300 hover:underline disabled:opacity-50"
            >
              Clear the pick
            </button>
          ) : null}
        </div>
        {home.photos.length === 0 ? (
          <p
            className={cn(
              panel,
              "text-muted-foreground px-4 py-8 text-center text-xs",
            )}
          >
            No photos on their feed for this home.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 @xl:grid-cols-4 @3xl:grid-cols-6 @5xl:grid-cols-8">
            {home.photos.map((photo) => {
              const on = chosen === photo.url;
              return (
                <li key={photo.key}>
                  <button
                    type="button"
                    disabled={setHero.isPending}
                    onClick={() => {
                      setSource(photo.url);
                      setCard(0);
                      setHero.mutate({
                        homeId: home.id,
                        sourceUrl: photo.url,
                      });
                    }}
                    className={cn(
                      "group relative block w-full overflow-hidden rounded-xl border transition",
                      on
                        ? "border-sky-400 ring-2 ring-sky-400/40"
                        : "hover:border-white/30",
                    )}
                    title={
                      on ? "The ads draw on this photo" : "Draw the ads on this"
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbUrl}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                    {photo.isHero ? (
                      <span className="absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-full bg-black/50">
                        <Star className="size-3 fill-amber-300 text-amber-300" />
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full border text-white",
                        on
                          ? "border-sky-400 bg-sky-500"
                          : "border-white/60 bg-black/40 opacity-0 group-hover:opacity-100",
                      )}
                    >
                      {on ? <Check className="size-3" /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {chosen ? (
        <section className="space-y-4">
          <p className={sectionLabel}>
            Creatives · {recipes.length} × {FORMATS.length}
          </p>
          {recipes.map((recipe) => (
            <div key={recipe.id} className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={sectionLabel}>{recipe.label}</span>
                <span className="text-muted-foreground/80 truncate text-[11px]">
                  {recipe.title}
                </span>
              </div>
              <ul className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
                {FORMATS.map((formatId) => {
                  const spec: PreviewSpec = {
                    brandId,
                    templateId: "hero-overlay",
                    formatId,
                    source: { url: chosen },
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
                        imageUrl: chosen,
                      }}
                    />
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {home.photos.length >= 2 ? (
        <section className="space-y-2.5">
          <p className={sectionLabel}>
            Its own carousel · {carousel.length} cards
          </p>
          <div className="flex justify-center @2xl:justify-start">
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
              media={carousel}
              card={card}
              onCard={setCard}
              className="w-full max-w-96"
            />
          </div>
        </section>
      ) : null}

      {chosen ? (
        <section className="space-y-2.5">
          <p className={sectionLabel}>Listing card</p>
          <div className={cn(panel, "w-full max-w-72")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={homeCatalogPreviewUrl({
                brandId,
                source: { url: chosen },
                formatId: "square",
                copy: catalog,
              })}
              alt={home.name}
              loading="lazy"
              className="aspect-square w-full bg-black/20 object-cover"
            />
            <div className="px-2.5 py-2">
              <p className="truncate text-[11.5px] font-medium">{home.name}</p>
              <p className="text-muted-foreground truncate text-[10.5px]">
                {home.externalId}
                {home.nightlyFrom
                  ? ` · $${home.nightlyFrom.toLocaleString("en-US")} USD`
                  : " · no rate"}
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
