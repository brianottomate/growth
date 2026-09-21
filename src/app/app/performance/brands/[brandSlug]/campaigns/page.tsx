import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { cn } from "@/components/ui/lib/utils";

import { CampaignRow, panel, SectionLabel } from "../../../_components";
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
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <SectionLabel>
          Campaigns{campaigns.length ? ` · ${campaigns.length}` : ""}
        </SectionLabel>
        <NewCampaignButton brandId={brand.id} />
      </div>
      {deskBrand && campaigns.length > 0 ? (
        <ul className={cn(panel, "divide-y")}>
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
        <p
          className={cn(
            panel,
            "px-4 py-8 text-center text-xs text-muted-foreground",
          )}
        >
          No campaign yet.
        </p>
      )}
    </div>
  );
}
