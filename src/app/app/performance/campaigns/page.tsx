import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Megaphone } from "lucide-react";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/lib/utils";
import {
  deskMoney,
  loadPerformanceDesk,
  narrowDesk,
  type DeskCampaignState,
} from "@/server/services/performance-desk.service";

import { CampaignRow, panel } from "../_components";
import { CampaignGroups, type CampaignGroup } from "./CampaignGroups";

export const metadata: Metadata = { title: "Campaigns · Wander Performance" };
export const dynamic = "force-dynamic";

const GROUPS: { state: DeskCampaignState; title: string; dot: string }[] = [
  { state: "live", title: "Live", dot: "bg-emerald-400" },
  { state: "pushed", title: "Pushed, paused", dot: "bg-amber-400" },
  { state: "draft", title: "Drafts", dot: "bg-white/25" },
  { state: "ended", title: "Ended", dot: "bg-white/15" },
];

/** Every client campaign, grouped by where it stands, with chips to pick a group. */
export default async function PerformanceCampaignsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) return <div className="text-muted-foreground">No organization found.</div>;

  const desk = narrowDesk(await loadPerformanceDesk(org.id), "client");
  const brandById = new Map(desk.brands.map((brand) => [brand.id, brand]));

  if (desk.campaigns.length === 0) {
    return <EmptyState icon={Megaphone} title="No campaigns yet" description="Start one from a client." />;
  }

  const groups: CampaignGroup[] = GROUPS.flatMap((group) => {
    const rows = desk.campaigns.filter((campaign) => campaign.state === group.state);
    if (rows.length === 0) return [];
    return [
      {
        id: group.state,
        title: group.title,
        count: rows.length,
        dot: group.dot,
        node: (
          <ul className={cn(panel, "divide-y")}>
            {rows.map((campaign) => (
              <CampaignRow key={campaign.id} brand={brandById.get(campaign.brandId)!} campaign={campaign} showBrand deletable />
            ))}
          </ul>
        ),
      },
    ];
  });
  const planned = desk.campaigns
    .filter((campaign) => campaign.state === "draft")
    .reduce((sum, campaign) => sum + campaign.budget, 0);
  const summary = [
    `${desk.campaigns.length} campaign${desk.campaigns.length === 1 ? "" : "s"}`,
    desk.liveSpend > 0 ? `${deskMoney(desk.liveSpend)} spent` : null,
    planned > 0 ? `${deskMoney(planned)} planned` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return <CampaignGroups groups={groups} summary={summary} />;
}
