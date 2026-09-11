import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brandListings } from "@/server/services/wanderos-listings.service";
import { listAdSet } from "@/server/services/ad-set.service";

import { brandAvatarUrl, loadPerformanceBrand } from "../_data";

import { MAX_SET_HOMES } from "@/lib/performance-ads";

import { AdPreviewsWorkspace, type WorkspaceHome } from "./AdPreviewsWorkspace";

export const metadata: Metadata = { title: "Ads · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The client's ad draft space: a pick of homes from their WanderOS catalog and
 * the ads that pick would make. The pick is carried in `?homes=` so a link
 * opens on the same set, and otherwise reflects what the drafted set was
 * built from.
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

  const [listings, avatarUrl, drafted] = await Promise.all([
    brandListings({ id: brand.id, website: brand.website }),
    brandAvatarUrl(brand),
    listAdSet({ brandId: brand.id, orgId: org.id }),
  ]);
  // The mock needs the words and the cards; everything else about an ad row
  // is either derivable or not the reviewer's business.
  const ads = drafted.flatMap((ad) => {
    const content = ad.content;
    if (!("media" in content)) return [];
    return [
      {
        id: ad.id,
        name: ad.name,
        // `kept` is a retired middle state; anything not approved is a draft.
        status: ad.status === "approved" ? ("approved" as const) : ("drawn" as const),
        headline: content.headline,
        body: content.body,
        callToAction: content.callToAction ?? null,
        linkUrl: content.linkUrl ?? null,
        homeName: ad.home?.name ?? content.propertyName ?? null,
        cards: content.media.map((item) => ({
          url: item.url,
          thumbnail: item.thumbnail ?? null,
        })),
      },
    ];
  });
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

  // The URL's ids if the link carries them, else the homes the drafted set was
  // actually built from, else nothing. Never a guess: a set picked for them
  // reads exactly like one they picked, and disagrees with the set below.
  const ids = new Set(homes.map((home) => home.id));
  const fromUrl = (query.homes ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => ids.has(id));
  const fromSet = [
    ...new Set(
      drafted.flatMap((ad) =>
        ad.home?.externalId && ids.has(ad.home.externalId)
          ? [ad.home.externalId]
          : [],
      ),
    ),
  ];
  const initialPicked = (fromUrl.length > 0 ? fromUrl : fromSet).slice(
    0,
    MAX_SET_HOMES,
  );

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
      brandName={brand.name}
      brandLogo={avatarUrl}
      homes={homes}
      withoutPhoto={withoutPhoto}
      initialPicked={initialPicked}
      ads={ads}
    />
  );
}
