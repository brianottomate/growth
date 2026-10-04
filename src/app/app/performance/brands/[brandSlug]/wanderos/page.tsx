import { HomeGroupsWorkspace } from "@/app/app/brands/[brandSlug]/homes/HomeGroupsWorkspace";
import { MarketsCard } from "../MarketsCard";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brandHomeInventory } from "@/server/services/home-inventory.service";
import {
  listAllBrandHomes,
  listBrandHomes,
} from "@/server/services/homes.service";

import { SectionLabel } from "../../../_components";
import { HomeRowsGrid } from "../HomeRowsGrid";
import { HomesStrip } from "../HomesStrip";
import { AddHomesByHand } from "../AddHomesByHand";
import { PickedHomes, type PickedHome } from "../PickedHomes";
import { brandTabHref, loadPerformanceBrand } from "../_data";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "WanderOS · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * Every home on the client's record: browse them, feature the set the ads
 * run on. A brand with no feed
 * pastes its homes in by hand instead. This is where a signed client's homes
 * are set up; the catalog cards have their own tab.
 */
export default async function PerformanceWanderOsPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const [rows, committed] = await Promise.all([
    listAllBrandHomes(brand.id),
    listBrandHomes(brand.id),
  ]);
  // Ingested brands work from their rows. The live feed is read only for a
  // brand not ingested yet, which still browses it through `HomesStrip`.
  const feedRows = rows.filter((home) => home.source === "wanderos");
  const inventory =
    feedRows.length > 0
      ? null
      : await brandHomeInventory({ id: brand.id, website: brand.website });
  const homes = inventory?.homes ?? [];
  const withPhoto = homes.filter((home) => home.imageUrl);
  // Use stored homes when available, otherwise the live feed for destinations.
  const inventoryHomes =
    rows.length > 0
      ? rows
      : withPhoto.map((home) => ({
          name: home.name,
          url: home.url,
          city: home.city ?? null,
          state: home.state ?? null,
          bedrooms: home.bedrooms ?? null,
          bathrooms: home.bathrooms ?? null,
          guests: home.guests ?? null,
          rating: home.rating ?? null,
          heroSourceUrl: home.imageUrl ?? null,
          featured: false,
        }));
  const slug = brand.slug ?? brand.id;
  // Tiles draw the hero's gallery thumbnail, a fifth the weight of the file.
  const heroThumb = (home: {
    heroSourceUrl: string | null;
    galleryCache?: { url: string; thumbUrl: string }[] | null;
  }) =>
    home.galleryCache?.find((photo) => photo.url === home.heroSourceUrl)
      ?.thumbUrl ?? home.heroSourceUrl;
  const factsOf = (home: {
    bedrooms: number | null;
    guests: number | null;
    city: string | null;
    state: string | null;
  }) =>
    [
      home.bedrooms ? `${home.bedrooms} bd` : null,
      home.guests ? `${home.guests} guests` : null,
      [home.city, home.state].filter(Boolean).join(", ") || null,
    ]
      .filter(Boolean)
      .join(" · ");
  // The legacy strip's tick keys the set by feed id → home row id.
  const picked = committed.map((home) => ({
    externalId: home.externalId,
    homeId: home.id,
  }));
  // The in-focus band shows each featured home from its row: ingestion
  // stored the full gallery on it.
  const pickedHomes: PickedHome[] = committed.map((home) => {
    const gallery = (home.galleryCache ?? []).map(
      (photo) => photo.thumbUrl || photo.url,
    );
    const images = (
      gallery.length > 0 ? gallery : [home.heroSourceUrl].filter(Boolean)
    ) as string[];
    return {
      id: home.id,
      externalId: home.externalId,
      source: home.source,
      name: home.name,
      hero: home.heroSourceUrl,
      images: images.slice(0, 12),
      photoCount: images.length,
      bedrooms: home.bedrooms,
      bathrooms: home.bathrooms,
      guests: home.guests,
      rating: home.rating,
      nightlyFrom: home.nightlyFrom,
      city: home.city,
      state: home.state,
      offFeed: false,
    };
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">WanderOS</h2>
        <p className="text-sm text-muted-foreground">
          Organize homes and destinations, and create booking targets for
          campaigns.
        </p>
        <ButtonLink
          size="sm"
          variant="outline"
          href={`${brandTabHref(slug, "settings")}#wanderos`}
        >
          Connection & sync settings
        </ButtonLink>
      </div>
      {inventory?.enrichmentError && (
        <p className="text-sm text-muted-foreground">
          {inventory.enrichmentError}
        </p>
      )}
      <HomeGroupsWorkspace
        brandId={brand.id}
        brandSlug={slug}
        setupHref={`${brandTabHref(slug, "settings")}#wanderos`}
        featuredContent={
          <PickedHomes
            brandId={brand.id}
            brandName={brand.name}
            brandSlug={slug}
            picked={pickedHomes}
          />
        }
        betweenSections={
          <MarketsCard
            brandId={brand.id}
            brandName={brand.name}
            markets={brand.markets ?? null}
            towns={[
              ...inventoryHomes.reduce((counts, home) => {
                if (home.city)
                  counts.set(home.city, (counts.get(home.city) ?? 0) + 1);
                return counts;
              }, new Map<string, number>()),
            ].map(([town, homes]) => ({ town, homes }))}
          />
        }
      />
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionLabel>
            All homes
            {(rows.length || homes.length) > 0
              ? ` · ${rows.length || homes.length}`
              : ""}
          </SectionLabel>
          <div className="flex items-center gap-2">
            <ButtonLink
              href={brandTabHref(slug, "catalog")}
              size="sm"
              variant="outline"
            >
              Continue to Catalog
            </ButtonLink>
          </div>
        </div>
        {rows.length > 0 ? (
          <HomeRowsGrid
            homes={rows.map((home) => ({
              id: home.id,
              externalId: home.externalId,
              name: home.name,
              url: home.url,
              heroThumbUrl: heroThumb(home),
              featured: home.featured,
              facts: factsOf(home),
            }))}
            brandSlug={slug}
          />
        ) : homes.length === 0 ? (
          <AddHomesByHand
            brandId={brand.id}
            brandSlug={slug}
            brandWebsite={brand.website}
            homes={committed.map((home) => ({
              id: home.id,
              name: home.name,
              facts: factsOf(home),
            }))}
          />
        ) : (
          <>
            <HomesStrip
              homes={withPhoto.map((home) => ({
                id: home.id,
                name: home.name,
                url: home.url,
                imageUrl: home.imageUrl!,
                thumbUrl: home.thumbUrl ?? null,
                city: home.city ?? null,
                state: home.state ?? null,
                bedrooms: home.bedrooms ?? null,
                bathrooms: home.bathrooms ?? null,
                guests: home.guests ?? null,
                rating: home.rating ?? null,
                facts: factsOf({
                  bedrooms: home.bedrooms ?? null,
                  guests: home.guests ?? null,
                  city: home.city ?? null,
                  state: home.state ?? null,
                }),
              }))}
              brandId={brand.id}
              brandSlug={brand.slug}
              picked={picked}
            />
            {homes.length > withPhoto.length ? (
              <p className="text-[11px] text-muted-foreground">
                {homes.length - withPhoto.length} more on their site have no
                photo on the feed.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
