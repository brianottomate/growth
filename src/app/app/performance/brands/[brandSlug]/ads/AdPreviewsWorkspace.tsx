"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

import {
  AD_MOCK_SURFACES,
  AdMock,
  type AdMockSurface,
} from "@/components/ad-mock";
import { cn } from "@/components/ui/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CompositionFormatId } from "@/lib/compositions";
import {
  homeCatalogCopy,
  homeCatalogPreviewUrl,
  homePreviewRecipes,
  type PreviewSpec,
} from "@/lib/home-ad-previews";
import type { HotelFeedHome } from "@/lib/meta-hotel-feed";

import { HomePicker } from "../HomePicker";
import { OnDemandTile } from "../OnDemandTile";

export type WorkspaceHome = HotelFeedHome & {
  imageUrl: string;
  thumbUrl: string | null;
  rating: number | null;
};

/** How many homes one campaign draws from; Meta's carousel holds ten cards. */
export const MAX_PICKED = 10;

// `_components` reaches the desk service, which is server-only; the section
// shapes are spelled out here.
const panel = "bg-card overflow-hidden rounded-2xl border";
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";

/** The canvas each placement is drawn on, so the copy survives the crop. */
const FORMAT_FOR_SURFACE: Record<AdMockSurface, CompositionFormatId> = {
  facebook: "landscape",
  instagram: "square",
  story: "story",
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * The brand's ad draft space: the set of homes an ad runs on, and what that
 * set makes. The roster and the catalog feed live on the Homes tab, so this
 * page is only about the handful chosen. Nothing here is saved until a card
 * is kept; the pick lives in the URL so a link carries it.
 */
export function AdPreviewsWorkspace({
  brandId,
  brandSlug,
  brandName,
  brandLogo,
  homes,
  withoutPhoto,
  initialPicked,
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  homes: WorkspaceHome[];
  withoutPhoto: number;
  initialPicked: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [picked, setPicked] = useState<string[]>(initialPicked);
  const [surface, setSurface] = useState<AdMockSurface>("instagram");
  const [card, setCard] = useState(0);

  const byId = useMemo(
    () => new Map(homes.map((home) => [home.id, home])),
    [homes],
  );
  const pickedHomes = picked
    .map((id) => byId.get(id))
    .filter((home): home is WorkspaceHome => Boolean(home));

  const commit = (next: string[]) => {
    setPicked(next);
    setCard(0);
    const params = new URLSearchParams();
    if (next.length > 0) params.set("homes", next.join(","));
    router.replace(
      params.size ? `${pathname}?${params.toString()}` : pathname,
      { scroll: false },
    );
  };
  const toggle = (id: string) => {
    if (picked.includes(id)) return commit(picked.filter((x) => x !== id));
    if (picked.length >= MAX_PICKED) return;
    commit([...picked, id]);
  };

  const formatId = FORMAT_FOR_SURFACE[surface];
  const carouselCards = pickedHomes.map((home) => ({
    url: homeCatalogPreviewUrl({
      brandId,
      source: { url: home.imageUrl },
      formatId: "square",
      copy: homeCatalogCopy(home),
    }),
    thumbnail: null,
    type: "image",
  }));
  const place = (() => {
    const cities = new Set(
      pickedHomes.map((home) => home.city).filter(Boolean),
    );
    const states = new Set(
      pickedHomes.map((home) => home.state).filter(Boolean),
    );
    if (cities.size === 1) return [...cities][0]!;
    if (states.size === 1) return [...states][0]!;
    return null;
  })();

  return (
    <div className="space-y-7">
      {/* 1 · The set, as chips. Changing it is a dialog, because the set is
             a handful chosen once and a permanent grid of two hundred tiles
             was a lot of page to carry that. */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={sectionLabel}>
            Homes for the ads · {picked.length}/{MAX_PICKED}
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
              max={MAX_PICKED}
              onChange={commit}
              label={picked.length > 0 ? "Change homes" : "Add homes"}
            />
          </div>
        </div>

        {pickedHomes.length === 0 ? (
          <p
            className={cn(
              panel,
              "text-muted-foreground px-4 py-6 text-center text-xs",
            )}
          >
            No homes in the set yet.
          </p>
        ) : (
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
        )}
        {withoutPhoto > 0 ? (
          <p className="text-muted-foreground text-[11px]">
            {withoutPhoto} {withoutPhoto === 1 ? "home has" : "homes have"} no
            photo on the feed and cannot be a card.
          </p>
        ) : null}
      </section>

      {/* 2 · The ads for the set */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={sectionLabel}>Ads for the set</p>
          <Tabs
            value={surface}
            onValueChange={(value) => setSurface(value as AdMockSurface)}
          >
            <TabsList>
              {AD_MOCK_SURFACES.map((option) => (
                <TabsTrigger
                  key={option.id}
                  value={option.id}
                  className="text-xs"
                >
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {pickedHomes.length === 0 ? (
          <p
            className={cn(
              panel,
              "text-muted-foreground px-4 py-8 text-center text-xs",
            )}
          >
            Nothing to draw yet. Pick a home above.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <ul
                className={cn(
                  "grid gap-5",
                  surface === "story"
                    ? "grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-5"
                    : "grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3",
                )}
              >
                {pickedHomes.map((home) => {
                  const recipe = homePreviewRecipes(home)[0]!;
                  const spec: PreviewSpec = {
                    brandId,
                    templateId: "hero-overlay",
                    formatId,
                    source: { url: home.imageUrl },
                    title: recipe.title,
                    cta: recipe.cta,
                  };
                  return (
                    <OnDemandTile
                      key={`${home.id}-${surface}`}
                      brandId={brandId}
                      brandSlug={brandSlug}
                      brandName={brandName}
                      brandLogo={brandLogo}
                      surface={surface}
                      spec={spec}
                      home={{
                        name: home.name,
                        url: home.url,
                        imageUrl: home.imageUrl,
                      }}
                    />
                  );
                })}
              </ul>
            </div>

            {pickedHomes.length >= 2 ? (
              <div className="space-y-2">
                <p className={sectionLabel}>
                  Portfolio carousel · {pickedHomes.length} cards
                </p>
                <div className="flex justify-center @2xl:justify-start">
                  <AdMock
                    surface={surface === "story" ? "instagram" : surface}
                    brandName={brandName}
                    brandLogo={brandLogo}
                    body={
                      place
                        ? `${pickedHomes.length} homes in ${place}. Private stays with room for everyone.`
                        : `${pickedHomes.length} homes, each with room for everyone.`
                    }
                    headline={pickedHomes[card]?.name ?? null}
                    link={pickedHomes[card]?.url ?? null}
                    callToAction="See details"
                    media={carouselCards}
                    card={card}
                    onCard={setCard}
                    className="w-full max-w-96"
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
