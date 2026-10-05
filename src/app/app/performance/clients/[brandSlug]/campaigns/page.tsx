import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Megaphone } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspaceCard } from "../../../WorkspaceCard";
import { ShapeBrandButton } from "../ShapeBrandButton";

import { CampaignRow } from "../../../_components";
import { NewCampaignButton } from "../../../NewCampaignButton";
import { loadPerformanceBrand } from "../_data";

export const metadata: Metadata = { title: "Campaigns · Wander Performance" };
export const dynamic = "force-dynamic";

/** The client's campaigns, one row each, and the way to start the next one. */
export default async function PerformanceBrandCampaignsPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand, deskBrand } =
    await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const campaigns = deskBrand?.campaigns ?? [];
  const actions = (
    <>
      <NewCampaignButton brandSlug={brandSlug} />
      <ShapeBrandButton
        brandId={brand.id}
        brandName={brand.name}
        section="campaigns"
      />
    </>
  );
  return (
    <div className="space-y-4">
      <WorkspaceCard
        title="Campaigns"
        icon={Megaphone}
        count={campaigns.length}
        actions={actions}
      >
        {deskBrand && campaigns.length > 0 ? (
          <ul className="divide-y">
            {campaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                brand={deskBrand}
                campaign={campaign}
                deletable
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={Megaphone}
            title="Create the first campaign"
          />
        )}
      </WorkspaceCard>
    </div>
  );
}
