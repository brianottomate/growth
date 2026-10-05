import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { HydrateClient, prefetch, orpc } from "@/orpc/server";
import { CampaignsClient } from "./CampaignsClient";

export const metadata: Metadata = {
  title: "Campaigns",
};

// Paid campaign index across workspace brands. Initiatives coordinate shared pushes.
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

  prefetch(orpc.campaign.overview.queryOptions());

  return (
    <HydrateClient>
      <CampaignsClient brands={brands} />
    </HydrateClient>
  );
}
