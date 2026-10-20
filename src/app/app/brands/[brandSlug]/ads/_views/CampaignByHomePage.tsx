import { notFound, redirect } from "next/navigation";
import { workspaceActor } from "@/server/workspace-actor";

import { getSession } from "@/server/better-auth/server";
import { getDraftCampaign } from "@/server/services/ads-draft.service";
import { groupWall, toWallAd, type WallAd } from "@/lib/ad-wall";

import { ByHomeView } from "./ByHomeView";

/**
 * The campaign by home: every ad about one house, in every placement, with
 * its copy beside it. A review surface on its own page so one house can be
 * looked at whole, or one at a time with `?home=`.
 */
export async function CampaignByHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string; campaignId: string }>;
  searchParams: Promise<{ home?: string }>;
}) {
  const [{ brandSlug, campaignId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const actor = await workspaceActor();
  if (!actor) notFound();
  const org = { id: actor.orgId };

  const draft = await getDraftCampaign(org.id, campaignId).catch(() => null);
  // Chat result cards link by brand id; the brand route resolves both.
  if (draft?.brand.slug !== brandSlug && draft?.brand.id !== brandSlug)
    notFound();
  const { campaign, brand, ads } = draft;

  const wall: WallAd[] = [...ads]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .flatMap((ad) => {
      const row = toWallAd(ad);
      return row ? [row] : [];
    });

  return (
    <ByHomeView
      brandSlug={brandSlug}
      brandName={brand.name}
      brandLogo={brand.logo}
      campaignId={campaign.id}
      campaignName={campaign.name}
      landingUrl={campaign.landingUrl}
      grouped={groupWall(wall)}
      only={query.home ?? null}
    />
  );
}
