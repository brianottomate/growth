import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Megaphone } from "lucide-react";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { EmptyState } from "@/components/ui/empty-state";
import {
  loadPerformanceDesk,
  type DeskCampaignState,
} from "@/server/services/performance-desk.service";

import { CampaignRow } from "../_components";

export const metadata: Metadata = { title: "Campaigns · Wander Performance" };
export const dynamic = "force-dynamic";

const GROUPS: { state: DeskCampaignState; title: string }[] = [
  { state: "live", title: "Live" },
  { state: "pushed", title: "Pushed, paused" },
  { state: "draft", title: "Drafts" },
  { state: "ended", title: "Ended" },
];

/** Every campaign across clients, grouped by where it stands. */
export default async function PerformanceCampaignsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) return <div className="text-muted-foreground">No organization found.</div>;

  const desk = await loadPerformanceDesk(org.id);
  const brandById = new Map(desk.brands.map((brand) => [brand.id, brand]));

  if (desk.campaigns.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No campaigns yet"
        description="Start one from a client."
      />
    );
  }

  return (
    <div className="space-y-6">
      {GROUPS.map((group) => {
        const rows = desk.campaigns.filter((campaign) => campaign.state === group.state);
        if (rows.length === 0) return null;
        return (
          <section key={group.state} className="space-y-2">
            <h2 className="text-sm font-semibold">
              {group.title}{" "}
              <span className="text-muted-foreground font-normal">{rows.length}</span>
            </h2>
            <ul className="bg-card divide-y rounded-xl border">
              {rows.map((campaign) => (
                <CampaignRow
                  key={campaign.id}
                  brand={brandById.get(campaign.brandId)!}
                  campaign={campaign}
                  showBrand
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
