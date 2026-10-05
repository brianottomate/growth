import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { studioListings } from "@/server/services/studio-homes.service";
import { homeGroupContext } from "@/server/services/home-groups.service";
import { listAdSet } from "@/server/services/ad-set.service";

import { brandAvatarUrl, loadPerformanceBrand } from "../_data";

import { MAX_SET_HOMES } from "@/lib/performance-ads";

import { AdPreviewsWorkspace, type WorkspaceHome } from "./AdPreviewsWorkspace";
import type { StudioIdea } from "./StudioIdeas";

export const metadata: Metadata = {
  title: "Ad studio · Wander Performance",
};
export const dynamic = "force-dynamic";

/**
 * The client's ad studio: every idea with no campaign yet, filed under the
 * home it is about. A set can be drawn from a pick of homes (carried in
 * `?homes=` so a link opens on it) or from a count, and any idea can be made
 * by hand and filled by upload.
 */
export default async function PerformanceBrandAdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ homes?: string; focus?: string }>;
}) {
  const [{ brandSlug }, query] = await Promise.all([params, searchParams]);
  const { session, org, brand, deskBrand } =
    await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const [listings, avatarUrl, drafted, groupContext] = await Promise.all([
    studioListings({ id: brand.id, website: brand.website }),
    brandAvatarUrl(brand),
    listAdSet({ brandId: brand.id, orgId: org.id }),
    homeGroupContext(brand.id, org.id),
  ]);
  const ideas: StudioIdea[] = drafted.map((ad) => ({
    id: ad.id,
    name: ad.name,
    content: ad.content,
    status: ad.status,
    updatedAt: ad.updatedAt.toISOString(),
    homeId: ad.homeId,
    home: ad.home
      ? { name: ad.home.name, url: ad.home.url, externalId: ad.home.externalId }
      : null,
  }));
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
  // A per-home link (`?focus=`) opens on one home: scroll to it if it is drawn,
  // and pre-tick it *on top of* the set already drawn so a rebuild draws it
  // without dropping the rest. `buildAdSet` replaces the whole set, so pre-
  // ticking only the focused home would silently wipe the others.
  const focusHomeId = (query.focus ?? "").trim();
  const focused = focusHomeId && ids.has(focusHomeId) ? focusHomeId : null;
  const initialPicked = (
    focused
      ? [...new Set([...fromSet, focused])]
      : fromUrl.length > 0
        ? fromUrl
        : fromSet
  ).slice(0, MAX_SET_HOMES);

  // Where approved ads can go. Only a campaign nothing has been pushed for
  // can still take ads; a live one is Meta's to edit.
  const campaigns = (deskBrand?.campaigns ?? [])
    .filter((campaign) =>
      campaign.platforms.every((row) => row.status === "draft"),
    )
    .map((campaign) => ({ id: campaign.id, name: campaign.name }));

  const slug = brand.slug ?? brand.id;

  return (
    <>
      <AdPreviewsWorkspace
        brandId={brand.id}
        brandSlug={slug}
        brandName={brand.name}
        brandLogo={avatarUrl}
        website={brand.website}
        homes={homes}
        withoutPhoto={withoutPhoto}
        initialPicked={initialPicked}
        ideas={ideas}
        campaigns={campaigns}
        hasHomes={listings.length > 0}
        homeGroups={groupContext.groups.map((group) => ({
          id: group.id,
          name: group.name,
          homeIds: group.homeIds.flatMap((id) => {
            const home = groupContext.homes.find((home) => home.id === id);
            return home && ids.has(home.externalId) ? [home.externalId] : [];
          }),
        }))}
        focusHomeId={focused}
      />
    </>
  );
}
