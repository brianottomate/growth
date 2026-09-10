import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brandListings } from "@/server/services/wanderos-listings.service";

import { brandAvatarUrl, loadPerformanceBrand } from "../_data";

import {
  AdPreviewsWorkspace,
  MAX_PICKED,
  type WorkspaceHome,
} from "./AdPreviewsWorkspace";

export const metadata: Metadata = { title: "Ads · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The client's ad draft space: a pick of homes from their WanderOS catalog,
 * the ads that pick would make, and the whole catalog as cards with the Meta
 * feed to download. The pick is carried in `?homes=`; the featured home, or
 * the first few on the feed, stand in until someone chooses.
 */
export default async function PerformanceBrandAdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ homes?: string }>;
}) {
  const [{ brandSlug }, query] = await Promise.all([params, searchParams]);
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const [listings, avatarUrl] = await Promise.all([
    brandListings({ id: brand.id, website: brand.website }),
    brandAvatarUrl(brand),
  ]);
  const homes: WorkspaceHome[] = listings
    .filter((home) => home.imageUrl)
    .map((home) => ({
      id: home.id,
      name: home.name,
      url: home.url,
      imageUrl: home.imageUrl!,
      thumbUrl: home.thumbUrl ?? null,
      city: home.city ?? null,
      state: home.state ?? null,
      country: home.country ?? null,
      bedrooms: home.bedrooms ?? null,
      bathrooms: home.bathrooms ?? null,
      guests: home.guests ?? null,
      rating: home.rating ?? null,
      nightlyFrom: home.nightlyFrom ?? null,
    }));
  const withoutPhoto = listings.length - homes.length;

  // The pick: the URL's ids that are still on the feed, else the featured
  // home and the next few, so the page never opens empty for a brand with homes.
  const ids = new Set(homes.map((home) => home.id));
  const fromUrl = (query.homes ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => ids.has(id))
    .slice(0, MAX_PICKED);
  const featured = brand.featuredListingUrl
    ? homes.find((home) => home.url === brand.featuredListingUrl)
    : undefined;
  const initialPicked =
    fromUrl.length > 0
      ? fromUrl
      : [
          ...(featured ? [featured] : []),
          ...homes.filter((home) => home.id !== featured?.id),
        ]
          .slice(0, 4)
          .map((home) => home.id);

  if (listings.length === 0) {
    return (
      <p className="bg-card text-muted-foreground rounded-2xl border px-4 py-8 text-center text-xs">
        {brand.website
          ? "Not a WanderOS site, so there is no catalog to draw from."
          : "No website on record, so there is no catalog to draw from."}
      </p>
    );
  }
  return (
    <AdPreviewsWorkspace
      brandId={brand.id}
      brandSlug={brand.slug ?? brand.id}
      brandName={brand.name}
      brandLogo={avatarUrl}
      homes={homes}
      withoutPhoto={withoutPhoto}
      initialPicked={initialPicked}
    />
  );
}
