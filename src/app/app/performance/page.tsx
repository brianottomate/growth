import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { workspaceActor } from "@/server/workspace-actor";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";
import { performanceCardFromBrand } from "@/lib/performance-card";
import { PipelineBoard } from "./PipelineBoard";
import {
  loadBrandReadiness,
  readinessLinks,
} from "@/server/services/performance-readiness.service";

export const metadata: Metadata = { title: "Dashboard · Wander Performance" };
export const dynamic = "force-dynamic";

export default async function PerformanceOverviewPage() {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  const desk = await loadPerformanceDesk(actor.orgId);
  const readiness = await loadBrandReadiness(desk.brands);
  const cards = desk.brands.map((brand) => {
    const card = performanceCardFromBrand(brand);
    const observed = readiness.get(brand.id);
    return {
      ...card,
      ...(card.stage !== "prospects" && observed
        ? {
            readiness: {
              checklist: observed.checklist,
              links: readinessLinks(brand),
            },
          }
        : {}),
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Client journey, recorded status, and the next step.
          </p>
        </div>
      </header>
      <PipelineBoard cards={cards} />
    </div>
  );
}
