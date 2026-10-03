import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { workspaceActor } from "@/server/workspace-actor";
import {
  loadPerformanceDesk,
  narrowDesk,
} from "@/server/services/performance-desk.service";
import { ProspectDesk } from "./ProspectDesk";

export const metadata: Metadata = { title: "Prospects · Wander Performance" };
export const dynamic = "force-dynamic";

export default async function PerformanceProspectsPage() {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  const desk = await loadPerformanceDesk(actor.orgId);
  return (
    <ProspectDesk
      prospects={narrowDesk(desk, "prospect").brands}
      existingDomains={desk.brands.flatMap((brand) =>
        brand.website ? [brand.website] : [],
      )}
    />
  );
}
