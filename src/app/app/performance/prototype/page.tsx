import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { workspaceActor } from "@/server/workspace-actor";
import { getSession } from "@/server/better-auth/server";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";
import { loadBrandReadiness } from "@/server/services/performance-readiness.service";
import { journeyBrands } from "../journey-data";

import { loadPerformanceBrand } from "../brands/[brandSlug]/_data";
import { JourneyBoard } from "../JourneyBoard";
import { ClientWorkspace } from "./ClientWorkspace";
import { loadLaunchWorkspace } from "../load-launch-workspace";

export const metadata: Metadata = {
  title: "Client journey (real data) · Wander Performance",
};
export const dynamic = "force-dynamic";

/**
 * The prototype's shell, wired to the real desk. No fixtures: the pipeline is
 * the org's actual Performance brands by delivery stage, and a chosen brand's
 * workspace reads its live homes, ad set, catalog, and campaigns. Selection is
 * a URL param so the server can load only the brand in view.
 */
export default async function PerformancePrototypeRealPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand: brandSlug } = await searchParams;
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const actor = await workspaceActor();
  if (!actor)
    return (
      <div className="text-muted-foreground">
        Select an organization to view the journey.
      </div>
    );

  if (!brandSlug) {
    const desk = await loadPerformanceDesk(actor.orgId);
    const readiness = await loadBrandReadiness(desk.brands);
    return <JourneyBoard brands={journeyBrands(desk.brands, readiness)} />;
  }

  const { brand, deskBrand } = await loadPerformanceBrand(brandSlug);
  if (!brand) redirect("/app/performance/prototype");

  const data = await loadLaunchWorkspace({ brand, deskBrand });

  return <ClientWorkspace data={data} />;
}
