import type { WanderOsListing } from "@/server/clients/wanderos-site.client";
import type { listAllBrandHomes } from "@/server/services/homes.service";

export type SavedStudioHome = WanderOsListing & {
  homeId: string;
  source: "wanderos" | "wander" | "manual";
};

/** Project saved inventory without importing homes or changing their source. */
export function studioHomeListing(
  home: Awaited<ReturnType<typeof listAllBrandHomes>>[number],
): SavedStudioHome {
  const gallery = home.galleryCache ?? [];
  const hero = home.heroSourceUrl ?? gallery[0]?.url;
  return {
    id: home.externalId,
    homeId: home.id,
    source: home.source,
    slug: home.externalId,
    name: home.name,
    url: home.url,
    imageUrl: hero ?? undefined,
    thumbUrl:
      gallery.find((photo) => photo.url === hero)?.thumbUrl ??
      hero ??
      undefined,
    gallery: gallery.map((photo) => ({
      url: photo.url,
      thumbUrl: photo.thumbUrl ?? photo.url,
    })),
    city: home.city ?? undefined,
    state: home.state ?? undefined,
    country: home.country ?? undefined,
    bedrooms: home.bedrooms ?? undefined,
    bathrooms: home.bathrooms ?? undefined,
    guests: home.guests ?? undefined,
    rating: home.rating ?? undefined,
    nightlyFrom: home.nightlyFrom ?? undefined,
  };
}
