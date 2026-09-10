"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Download, Search, X } from "lucide-react";

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
import { hotelFeedRows, type HotelFeedHome } from "@/lib/meta-hotel-feed";

import { OnDemandTile } from "../OnDemandTile";

export type WorkspaceHome = HotelFeedHome & {
  imageUrl: string;
  thumbUrl: string | null;
  rating: number | null;
};

/** How many homes one campaign draws from; Meta's carousel holds ten cards. */
export const MAX_PICKED = 10;
/** Catalog cards drawn before "Show all"; every card is a server render. */
const CATALOG_FIRST = 24;

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

/** What the download is, on hover; the page itself stays heading and data. */
const FEED_TITLE =
  "Meta Hotels and rentals feed, one row per home with a photo. Street address and coordinates are not on the WanderOS feed and export empty.";

/**
 * The brand's ad draft space: pick up to ten homes from their WanderOS
 * catalog, see each one's static and the set's carousel drawn as they would
 * run, and below that the whole catalog as listing cards with the Meta feed
 * to download. Nothing here is saved until a card is kept; the pick lives in
 * the URL so a link carries it.
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
  const [query, setQuery] = useState("");
  const [card, setCard] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const byId = useMemo(
    () => new Map(homes.map((home) => [home.id, home])),
    [homes],
  );
  const pickedHomes = picked
    .map((id) => byId.get(id))
    .filter((home): home is WorkspaceHome => Boolean(home));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return homes;
    return homes.filter((home) =>
      [home.name, home.city, home.state]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [homes, query]);

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

  const rows = useMemo(
    () => hotelFeedRows(homes, brandName),
    [homes, brandName],
  );
  const catalogShown = showAll ? homes : homes.slice(0, CATALOG_FIRST);
  const exportHref = (format: "csv" | "xml") =>
    `/api/performance/catalog/${encodeURIComponent(brandId)}?format=${format}`;

  return (
    <div className="space-y-7">
      {/* 1 · The pick */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={sectionLabel}>
            Homes for the ads · {picked.length}/{MAX_PICKED}
          </p>
          <label className="relative block">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${homes.length} homes`}
              className="bg-muted/40 h-8 w-56 rounded-full border pr-3 pl-8 text-xs outline-none focus:ring-2 focus:ring-sky-400/40"
            />
          </label>
        </div>

        {pickedHomes.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {pickedHomes.map((home) => (
              <li key={home.id}>
                <button
                  type="button"
                  onClick={() => toggle(home.id)}
                  className="hover:bg-muted flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-[11.5px]"
                  title="Remove from the set"
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
        ) : (
          <p className="text-muted-foreground text-xs">Pick up to ten homes.</p>
        )}

        <div className={cn(panel, "max-h-[26rem] overflow-y-auto p-3")}>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">
              No home matches “{query}”.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 @xl:grid-cols-4 @3xl:grid-cols-6 @5xl:grid-cols-8">
              {filtered.map((home) => {
                const on = picked.includes(home.id);
                const full = !on && picked.length >= MAX_PICKED;
                return (
                  <li key={home.id}>
                    <button
                      type="button"
                      onClick={() => toggle(home.id)}
                      disabled={full}
                      className={cn(
                        "group relative block w-full overflow-hidden rounded-xl border text-left transition",
                        on
                          ? "border-sky-400 ring-2 ring-sky-400/40"
                          : "hover:border-white/30",
                        full && "opacity-40",
                      )}
                      title={
                        full
                          ? `Ten homes is the most one set holds`
                          : on
                            ? "Remove from the set"
                            : "Add to the set"
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={home.thumbUrl ?? home.imageUrl}
                        alt={home.name}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover"
                      />
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
                      <span className="block px-2 py-1.5">
                        <span className="block truncate text-[11.5px] font-medium">
                          {home.name}
                        </span>
                        <span className="text-muted-foreground block truncate text-[10.5px]">
                          {[
                            home.bedrooms ? `${home.bedrooms} bd` : null,
                            home.guests ? `${home.guests} guests` : null,
                            home.nightlyFrom
                              ? `${money(home.nightlyFrom)}/nt`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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

      {/* 3 · The catalog */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={sectionLabel}>
            Catalog · {rows.length} {rows.length === 1 ? "home" : "homes"}
          </p>
          <div className="flex items-center gap-3 text-[11.5px]">
            <a
              href={exportHref("csv")}
              download
              title={FEED_TITLE}
              className="inline-flex items-center gap-1 text-sky-300 hover:underline"
            >
              <Download className="size-3" />
              Meta CSV
            </a>
            <a
              href={exportHref("xml")}
              download
              title={FEED_TITLE}
              className="inline-flex items-center gap-1 text-sky-300 hover:underline"
            >
              <Download className="size-3" />
              Meta XML
            </a>
          </div>
        </div>
        {homes.length === 0 ? (
          <p
            className={cn(
              panel,
              "text-muted-foreground px-4 py-8 text-center text-xs",
            )}
          >
            No homes with a photo on the feed.
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-6">
              {catalogShown.map((home) => (
                <li key={home.id} className={cn(panel)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={homeCatalogPreviewUrl({
                      brandId,
                      source: { url: home.imageUrl },
                      formatId: "square",
                      copy: homeCatalogCopy(home),
                    })}
                    alt={home.name}
                    loading="lazy"
                    className="aspect-square w-full bg-black/20 object-cover"
                  />
                  <div className="px-2.5 py-2">
                    <p className="truncate text-[11.5px] font-medium">
                      {home.name}
                    </p>
                    <p className="text-muted-foreground truncate text-[10.5px]">
                      {[
                        home.id,
                        home.nightlyFrom
                          ? `${money(home.nightlyFrom)} USD`
                          : "no rate",
                      ].join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {!showAll && homes.length > CATALOG_FIRST ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-[11.5px] text-sky-300 hover:underline"
              >
                Show all {homes.length}
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
