import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { cn } from "@/components/ui/lib/utils";
import { brandListings } from "@/server/services/wanderos-listings.service";

import { panel, SectionLabel } from "../../../_components";
import { HomesStrip } from "../HomesStrip";
import { brandTabHref, loadPerformanceBrand } from "../_data";

export const metadata: Metadata = { title: "Homes · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * Every home on the client's WanderOS site, as their own photos or as the
 * listing card a catalog ad would draw, with the featured home marked. This is
 * the catalog the ads read from; picking a set happens on the Ads tab.
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

  const homes = await brandListings({ id: brand.id, website: brand.website });
  const withPhoto = homes.filter((home) => home.imageUrl);
  const slug = brand.slug ?? brand.id;

  return (
    <div className="space-y-4">
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
        <p
          className={cn(
            panel,
            "px-4 py-8 text-center text-xs text-muted-foreground",
          )}
        >
          {brand.website
            ? "Not a WanderOS site, so there is no listing feed to read."
            : "No website on record."}
        </p>
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
