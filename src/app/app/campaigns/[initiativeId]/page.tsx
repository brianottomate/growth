import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";
import { CampaignDetail } from "./CampaignDetail";

export const metadata: Metadata = {
  title: "Campaign",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const { campaignId } = await params;

  prefetch(trpc.initiative.get.queryOptions({ id: campaignId }));

  return (
    <HydrateClient>
      <CampaignDetail campaignId={campaignId} />
    </HydrateClient>
  );
}
