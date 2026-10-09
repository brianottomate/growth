import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { workspaceActor } from "@/server/workspace-actor";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";
import { financeAccounts } from "@/lib/performance-finance";
import { PerformancePageHeader } from "./PageHeader";
import { FinanceOverview } from "./FinanceOverview";

export const metadata: Metadata = { title: "Dashboard · Wander Performance" };
export const dynamic = "force-dynamic";

export default async function PerformanceOverviewPage() {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  const desk = await loadPerformanceDesk(actor.orgId);
  return (
    <div className="space-y-6">
      <PerformancePageHeader
        title="Dashboard"
        description="Fees and media across signed clients, paying against signed, carried forward from recorded dates."
      />
      <FinanceOverview accounts={financeAccounts(desk.brands)} />
    </div>
  );
}
