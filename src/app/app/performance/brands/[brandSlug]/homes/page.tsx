import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { cn } from "@/components/ui/lib/utils";
import { brandListings } from "@/server/services/wanderos-listings.service";
import { listBrandHomes } from "@/server/services/homes.service";

import { panel, SectionLabel } from "../../../_components";
import { HomesStrip } from "../HomesStrip";
import { AddHomesByHand } from "../AddHomesByHand";
import { PickedHomes, type PickedHome } from "../PickedHomes";
import { brandTabHref, loadPerformanceBrand } from "../_data";

export const metadata: Metadata = { title: "Homes · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * Every home on the client's WanderOS site: browse them, pick the set the ads
 * run on, and feature the one that stands for the brand. A brand with no feed
 * pastes its homes in by hand instead. This is where a signed client's homes
 * are set up; the catalog cards live at the foot of Ads.
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

  const [homes, committed] = await Promise.all([
    brandListings({ id: brand.id, website: brand.website }),
    listBrandHomes(brand.id),
  ]);
  const withPhoto = homes.filter((home) => home.imageUrl);
  const slug = brand.slug ?? brand.id;
  // The grid's tick toggle keys the set by feed id → home row id.
  const picked = committed.map((home) => ({
    externalId: home.externalId,
    homeId: home.id,
  }));
  // The in-focus band shows each picked home enriched from its live listing:
  // the gallery and fuller facts come free off the feed already read.
  const byId = new Map(homes.map((listing) => [listing.id, listing]));
  const pickedHomes: PickedHome[] = committed.map((home) => {
    const listing = byId.get(home.externalId) ?? null;
    // The full gallery is cached on the row at pick time; the live feed only
    // carries a ~5-photo preview. Prefer the cache, fall back to the feed.
    const cached = home.galleryCache ?? [];
    const feed = listing?.gallery ?? [];
    const galleryUrls =
      cached.length > 0
        ? cached.map((photo) => photo.thumbUrl || photo.url)
        : feed.length > 0
          ? feed.map((photo) => photo.thumbUrl || photo.url)
          : [listing?.imageUrl ?? home.heroSourceUrl].filter(
              (url): url is string => Boolean(url),
            );
    const photoCount = galleryUrls.length;
    const images = galleryUrls.slice(0, 12);
    return {
      id: home.id,
      externalId: home.externalId,
      source: home.source,
      name: listing?.name ?? home.name,
      hero: listing?.imageUrl ?? home.heroSourceUrl ?? images[0] ?? null,
      images,
      photoCount,
      bedrooms: listing?.bedrooms ?? home.bedrooms,
      bathrooms: listing?.bathrooms ?? home.bathrooms,
      guests: listing?.guests ?? home.guests,
      rating: listing?.rating ?? home.rating,
      nightlyFrom: listing?.nightlyFrom ?? home.nightlyFrom,
      city: listing?.city ?? home.city,
      state: listing?.state ?? home.state,
      offFeed: home.source === "wanderos" && !listing,
    };
  });

  return (
    <div className="space-y-4">
      {committed.length > 0 ? (
        <PickedHomes brandId={brand.id} brandSlug={slug} picked={pickedHomes} />
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>
          Homes{homes.length ? ` · ${homes.length}` : ""}
        </SectionLabel>
        <div className="flex items-center gap-3 text-[11.5px]">
          <Link
            href={brandTabHref(slug, "ads")}
            className="text-sky-300 hover:underline"
          >
            Draw ads from a set
          </Link>
          {brand.website ? (
            <a
              href={brand.website}
              target="_blank"
              rel="noreferrer"
              className="text-sky-300 hover:underline"
            >
              Their site
            </a>
          ) : null}
        </div>
      </div>
      {homes.length === 0 ? (
        <AddHomesByHand
          brandId={brand.id}
          brandSlug={slug}
          brandWebsite={brand.website}
          homes={committed.map((home) => ({
            id: home.id,
            name: home.name,
            facts: [
              home.bedrooms ? `${home.bedrooms} bd` : null,
              home.guests ? `${home.guests} guests` : null,
              [home.city, home.state].filter(Boolean).join(", ") || null,
            ]
              .filter(Boolean)
              .join(" · "),
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
              facts: [
                home.bedrooms ? `${home.bedrooms} bd` : null,
                home.guests ? `${home.guests} guests` : null,
                [home.city, home.state].filter(Boolean).join(", ") || null,
              ]
                .filter(Boolean)
                .join(" · "),
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
