import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { loadPerformanceBrand } from "../_data";
import { CatalogCards } from "./CatalogCards";
import { listAllBrandHomes } from "@/server/services/homes.service";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { WorkspaceCard } from "../../../WorkspaceCard";
import { Layers } from "lucide-react";

export const metadata: Metadata = { title: "Catalog · Wander Performance" };
export const dynamic = "force-dynamic";

/** The client's catalog ads: one card per home, exported to the library. */
export default async function PerformanceBrandCatalogPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const homes = await listAllBrandHomes(brand.id);
  if (!homes.length) {
    return (
      <WorkspaceCard title="Catalog cards" icon={Layers} count={0}>
        <EmptyState
          icon={Layers}
          title="Add homes to start the catalog"
          description="Import homes from WanderOS or add them manually. Then choose a template, prepare copy, and review the catalog cards."
          actions={
            <ButtonLink
              href={`/app/performance/clients/${brand.slug ?? brand.id}/wanderos`}
            >
              Set up homes
            </ButtonLink>
          }
        />
      </WorkspaceCard>
    );
  }

  return <CatalogCards brandId={brand.id} brandName={brand.name} />;
}
