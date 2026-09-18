import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { platformCampaignTable } from "@/server/db/schema";

import { CampaignView } from "../_views/CampaignView";

export const dynamic = "force-dynamic";

/**
 * The first-party campaign — the thing we author here and push. A platform
 * campaign is a different object with a different lifecycle, so it lives at
 * /ads/platform/[id] rather than sharing this path; a `pcamp_` id landing here
 * is an old link and gets forwarded once.
 *
 * "Draft" is a status on the campaign, so it is not a path segment.
 */
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string; campaignId: string }>;
  searchParams: Promise<{ group?: string }>;
}) {
  const { brandSlug, campaignId } = await params;
  const { group } = await searchParams;

  if (!campaignId.startsWith("camp_")) {
    const platformCampaign = await db.query.platformCampaignTable.findFirst({
      where: eq(platformCampaignTable.id, campaignId),
      columns: { id: true },
    });
    if (!platformCampaign) notFound();
    redirect(`/app/brands/${brandSlug}/ads/platform/${campaignId}`);
  }

  return (
    <CampaignView
      brandSlug={brandSlug}
      campaignId={campaignId}
      group={group === "format" ? "format" : "home"}
    />
  );
}
