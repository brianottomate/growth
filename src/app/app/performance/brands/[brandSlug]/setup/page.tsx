import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brandListings } from "@/server/services/wanderos-listings.service";
import { listBrandHomes } from "@/server/services/homes.service";

import { SectionLabel } from "../../../_components";
import { loadPerformanceBrand } from "../_data";
import { SetupHomes, type FeedListing, type PickedHome } from "./SetupHomes";

export const metadata: Metadata = { title: "Setup · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The first thing a freshly signed client needs: a handful of homes the ads
 * run on. Pick them from the client's WanderOS feed, or, when there is no feed
 * to read, paste whatever you have and let the agent stand them up as shells.
 * Everything here writes `home` rows and nothing reaches an ad platform.
 */
export default async function PerformanceBrandSetupPage({
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

  const [listings, committed] = await Promise.all([
    brandListings({ id: brand.id, website: brand.website }),
    listBrandHomes(brand.id),
  ]);

  const feed: FeedListing[] = listings
    .filter((listing) => listing.imageUrl)
    .map((listing) => ({
      id: listing.id,
      name: listing.name,
      imageUrl: listing.imageUrl!,
      thumbUrl: listing.thumbUrl ?? null,
      facts: [
        listing.bedrooms ? `${listing.bedrooms} bd` : null,
        listing.guests ? `${listing.guests} guests` : null,
        [listing.city, listing.state].filter(Boolean).join(", ") || null,
      ]
        .filter(Boolean)
        .join(" · "),
    }));

  // Enrich each committed home from its live feed listing when we can match
  // one: the gallery and the fuller facts come for free off the feed we
  // already read. A manual shell (or a home gone off-feed) falls back to the
  // row's own facts and shows no gallery.
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  const picked: PickedHome[] = committed.map((home) => {
    const listing = byId.get(home.externalId) ?? null;
    const gallery = listing?.gallery ?? [];
    const images = (
      gallery.length > 0
        ? gallery.map((photo) => photo.thumbUrl || photo.url)
        : [listing?.imageUrl ?? home.heroSourceUrl].filter(
            (url): url is string => Boolean(url),
          )
    ).slice(0, 5);
    return {
      id: home.id,
      externalId: home.externalId,
      source: home.source,
      name: listing?.name ?? home.name,
      hero: listing?.imageUrl ?? home.heroSourceUrl ?? images[0] ?? null,
      images,
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
    <div className="space-y-5">
      <div className="space-y-1">
        <SectionLabel>Setup · homes</SectionLabel>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Pick 3–10 homes the ads will run on. Once a set is chosen, the work
          moves to the Ads tab.
        </p>
      </div>
      <SetupHomes
        brandId={brand.id}
        brandSlug={brand.slug ?? brand.id}
        brandWebsite={brand.website}
        feed={feed}
        picked={picked}
      />
    </div>
  );
}
