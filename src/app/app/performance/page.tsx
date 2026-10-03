import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { workspaceActor } from "@/server/workspace-actor";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";
import { performanceCardFromBrand } from "@/lib/performance-card";
import { PipelineBoard } from "./PipelineBoard";

export const metadata: Metadata = { title: "Overview · Wander Performance" };
export const dynamic = "force-dynamic";

export default async function PerformanceOverviewPage() {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  const desk = await loadPerformanceDesk(actor.orgId);
  const cards = desk.brands.map(performanceCardFromBrand);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        </div>
      </header>
      <PipelineBoard cards={cards} />
    </div>
  );
}
