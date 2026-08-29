import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";
import { CampaignsClient } from "./CampaignsClient";

export const metadata: Metadata = {
  title: "Campaigns",
};

// Campaigns & moments — the management surface over `campaign`. The moment
// planner (/app/plan) births these from a prompt; here is where you see them
// all, edit dates/status, and attach the content that belongs to each push.
export default async function CampaignsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return <div className="text-muted-foreground">No organization found.</div>;
  }

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true },
  });

  prefetch(trpc.campaign.overview.queryOptions());

  return (
    <HydrateClient>
      <CampaignsClient brands={brands} />
    </HydrateClient>
  );
}
