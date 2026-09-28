import { BrandBrandingCard } from "@/app/app/brands/[brandSlug]/BrandBrandingCard";
import { BrandPreviewCard } from "../BrandPreviewCard";
import { BrandMarkCard } from "@/app/app/brands/[brandSlug]/BrandMarkCard";
import { db } from "@/server/db";
import { mediaAssetTable } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brandHomeInventory } from "@/server/services/home-inventory.service";
import { RefreshHomes } from "../RefreshHomes";
import {
  listAllBrandHomes,
  listBrandHomes,
} from "@/server/services/homes.service";

import { SectionLabel } from "../../../_components";
import { BrandStoryCard } from "../BrandStoryCard";
import { MarketsCard } from "../MarketsCard";
import { HeroCard } from "../HeroCard";
import { HomeRowsGrid } from "../HomeRowsGrid";
import { HomesStrip } from "../HomesStrip";
import { AddHomesByHand } from "../AddHomesByHand";
import { PickedHomes, type PickedHome } from "../PickedHomes";
import { brandTabHref, loadPerformanceBrand } from "../_data";
import { ButtonLink } from "@/components/ui/button";
import { resolvePreviewHome } from "../_preview-home";

export const metadata: Metadata = { title: "Setup · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * Every home on the client's record: browse them, feature the set the ads
 * run on, and choose the hero that stands for the brand. A brand with no feed
 * pastes its homes in by hand instead. This is where a signed client's homes
 * are set up; the catalog cards have their own tab.
 */
export default async function PerformanceBrandHomesPage({
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
  const marks = brand.brandMark
    ? await db.query.mediaAssetTable.findMany({
        where: inArray(
          mediaAssetTable.id,
          Object.values(brand.brandMark.variants),
        ),
        columns: { id: true, url: true },
      })
    : [];
  const markUrl = (id: string) => marks.find((row) => row.id === id)?.url ?? "";
  const markVariants = brand.brandMark
    ? {
        color: markUrl(brand.brandMark.variants.color),
        white: markUrl(brand.brandMark.variants.white),
        dark: markUrl(brand.brandMark.variants.dark),
      }
    : null;

  // The homes a hero can come from: the rows, or for a brand not ingested
  // yet, the feed with each listing's own cover as its hero.
  const heroHomes =
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
  // The hero's own row, for the card's facts, photos and link. Absent when
  // the hero is a library photo or the brand is not ingested yet.
  const heroRow = rows.find((home) => home.url === brand.featuredListingUrl);
  const previewHome = resolvePreviewHome({
    brandName: brand.name,
    featuredListingUrl: brand.featuredListingUrl,
    previewSourceUrl: brand.previewSourceUrl,
    homes: heroHomes,
  });
  // The picker offers the featured homes once there are any, else them all.
  const withHero = heroHomes.filter((home) => home.heroSourceUrl);
  const featuredWithHero = withHero.filter((home) => home.featured);
  const slug = brand.slug ?? brand.id;
  const townCounts = [
    ...heroHomes
      .reduce((counts, home) => {
        if (home.city) counts.set(home.city, (counts.get(home.city) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())
      .entries(),
  ].map(([town, homes]) => ({ town, homes }));
  // Tiles draw the hero's gallery thumbnail, a fifth the weight of the file.
  const heroThumb = (home: {
    heroSourceUrl: string | null;
    galleryCache?: { url: string; thumbUrl: string }[] | null;
  }) =>
    home.galleryCache?.find((photo) => photo.url === home.heroSourceUrl)
      ?.thumbUrl ?? home.heroSourceUrl;
  const heroOptions = (
    featuredWithHero.length > 0 ? featuredWithHero : withHero
  ).map((home) => ({
    name: home.name,
    url: home.url,
    imageUrl: home.heroSourceUrl!,
    thumbUrl: heroThumb(home),
  }));
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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Brand and home setup</h2>
        <RefreshHomes brandId={brand.id} />
      </div>
      {inventory?.enrichmentError && (
        <p className="text-sm text-muted-foreground">
          {inventory.enrichmentError}
        </p>
      )}
      <BrandBrandingCard
        brandId={brand.id}
        logo={brand.logo}
        identity={brand.brandIdentity ?? null}
        website={brand.website}
      />
      <BrandMarkCard
        brandId={brand.id}
        brandName={brand.name}
        logo={brand.logo}
        identity={brand.brandIdentity ?? null}
        mark={brand.brandMark ?? null}
        variants={markVariants}
        photo={previewHome?.imageUrl ?? null}
      />
      <BrandStoryCard brandId={brand.id} story={brand.story} />
      <MarketsCard
        brandId={brand.id}
        markets={brand.markets ?? null}
        towns={townCounts}
      />
      <HeroCard
        brandId={brand.id}
        hero={
          previewHome
            ? {
                name: previewHome.name,
                imageUrl: previewHome.imageUrl,
                ...(heroRow ? heroCardDetail(heroRow, slug) : {}),
              }
            : null
        }
        options={heroOptions}
        heroUrl={brand.featuredListingUrl}
      >
        <BrandPreviewCard
          brandId={brand.id}
          brandName={brand.name}
          identity={brand.brandIdentity ?? null}
          previewHome={previewHome}
        />
      </HeroCard>
      {committed.length > 0 || feedRows.length > 0 ? (
        <PickedHomes
          brandId={brand.id}
          brandName={brand.name}
          brandSlug={slug}
          picked={pickedHomes}
        />
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>
          Homes
          {(feedRows.length || homes.length) > 0
            ? ` · ${feedRows.length || homes.length}`
            : ""}
        </SectionLabel>
        <ButtonLink
          href={brandTabHref(slug, "catalog")}
          size="sm"
          variant="outline"
        >
          Continue to Catalog
        </ButtonLink>
      </div>
      {feedRows.length > 0 ? (
        <HomeRowsGrid
          homes={feedRows.map((home) => ({
            id: home.id,
            externalId: home.externalId,
            name: home.name,
            url: home.url,
            heroThumbUrl: heroThumb(home),
            featured: home.featured,
            facts: factsOf(home),
          }))}
          brandSlug={slug}
          heroUrl={brand.featuredListingUrl}
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
            featuredUrl={brand.featuredListingUrl}
            picked={picked}
          />
          {homes.length > withPhoto.length ? (
            <p className="text-[11px] text-muted-foreground">
              {homes.length - withPhoto.length} more on their site have no photo
              on the feed.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** What the hero card shows beyond the photo, read from the hero's row. */
function heroCardDetail(
  home: Awaited<ReturnType<typeof listAllBrandHomes>>[number],
  slug: string,
) {
  // Some feeds rate out of 10; the card reads out of 5 like the listing.
  const rating =
    home.rating == null
      ? null
      : home.rating > 5
        ? home.rating / 2
        : home.rating;
  return {
    place: [home.city, home.state].filter(Boolean).join(", ") || null,
    facts: [
      home.bedrooms ? `${home.bedrooms} bd` : null,
      home.bathrooms ? `${home.bathrooms} ba` : null,
      home.guests ? `${home.guests} guests` : null,
      rating ? `★${rating.toFixed(1)}` : null,
      home.nightlyFrom ? `from $${home.nightlyFrom}/night` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    photos: (home.galleryCache ?? [])
      .filter((photo) => photo.url !== home.heroSourceUrl)
      .slice(0, 5)
      .map((photo) => photo.thumbUrl || photo.url),
    photoCount: home.galleryCache?.length ?? 0,
    href: `/app/performance/brands/${slug}/homes/${home.externalId}`,
  };
}
