import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { workspaceActor } from "@/server/workspace-actor";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";
import { performanceCardFromBrand } from "@/lib/performance-card";
import { PipelineBoard } from "../PipelineBoard";
import { PerformancePageHeader } from "../PageHeader";
import { HeaderNewClient } from "../HeaderNewClient";
import { clientDetails } from "../ClientCard";
import {
  loadBrandReadiness,
  readinessLinks,
} from "@/server/services/performance-readiness.service";

export const metadata: Metadata = { title: "Clients · Wander Performance" };
export const dynamic = "force-dynamic";

export default async function PerformanceClientsPage() {
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
      <PerformancePageHeader
        title="Clients"
        description="Every account by stage, with recorded status and the next step."
        action={<HeaderNewClient />}
      />
      <PipelineBoard
        cards={cards}
        defaultLayout="board"
        details={clientDetails(desk.brands, readiness)}
      />
    </div>
  );
}
