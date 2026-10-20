import { adReviewOf } from "@/lib/ad-review";
import type { CampaignWorkspace } from "@/lib/campaign-navigation";
import { notFound, redirect } from "next/navigation";

import { studioListings } from "@/server/services/studio-homes.service";
import { homeGroupContext } from "@/server/services/home-groups.service";
import { listAdSet } from "@/server/services/ad-set.service";

import { brandAvatarUrl, loadPerformanceBrand } from "../_data";

import { AdPreviewsWorkspace, type WorkspaceHome } from "./AdPreviewsWorkspace";
import type { StudioIdea } from "./StudioIdeas";

/**
 * Ad Studio keeps the full brand collection, including assigned ads. The
 * Performance desk and the brand workspace render the same studio; the
 * workspace only decides where campaign links land.
 */
export async function AdStudio({
  brandSlug,
  focus,
  workspace,
}: {
  brandSlug: string;
  focus?: string;
  workspace: CampaignWorkspace;
}) {
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
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
    review: adReviewOf(ad),
    updatedAt: ad.updatedAt.toISOString(),
    homeId: ad.homeId,
    bookingTargetId: ad.bookingTargetId,
    campaignId: ad.campaignId,
    campaignName: ad.campaign?.name ?? null,
    deliveryState: ad.platformAds.some(
      (row) => row.platformCampaign?.externalId,
    )
      ? ("pushed" as const)
      : undefined,
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
  const focusHomeId = (focus ?? "").trim();
  const focused = homes.some((home) => home.id === focusHomeId)
    ? focusHomeId
    : null;

  const slug = brand.slug ?? brand.id;

  return (
    <AdPreviewsWorkspace
      brandId={brand.id}
      brandSlug={slug}
      brandName={brand.name}
      brandLogo={avatarUrl}
      website={brand.website}
      ideas={ideas}
      homeContext={groupContext.homes}
      connected={groupContext.connected}
      focusHomeId={focused}
      workspace={workspace}
    />
  );
}
