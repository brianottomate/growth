import Link from "next/link";
import { CampaignCard } from "../../../CampaignCard";
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
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ brandSlug }, { view }] = await Promise.all([params, searchParams]);
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
        <NewCampaignButton brandSlug={brandSlug} />
      </div>
      <nav
        aria-label="Campaign views"
        className="inline-flex rounded-lg border bg-muted/40 p-1"
      >
        {[
          { id: "cards", label: "Campaign cards" },
          { id: "list", label: "Compact list" },
        ].map((item) => (
          <Link
            key={item.id}
            href={`/app/performance/brands/${brandSlug}/campaigns?view=${item.id}`}
            aria-current={
              (view === "list" ? item.id === "list" : item.id === "cards")
                ? "page"
                : undefined
            }
            className={cn(
              "rounded-md px-3 py-2 text-xs font-medium",
              (view === "list" ? item.id === "list" : item.id === "cards")
                ? "bg-background shadow-xs"
                : "text-muted-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {deskBrand && campaigns.length > 0 ? (
        view !== "list" ? (
          <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                brand={deskBrand}
                campaign={campaign}
              />
            ))}
          </div>
        ) : (
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
        )
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
