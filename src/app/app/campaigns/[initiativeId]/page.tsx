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
  params: Promise<{ initiativeId: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const { initiativeId } = await params;

  prefetch(trpc.initiative.get.queryOptions({ id: initiativeId }));

  return (
    <HydrateClient>
      <CampaignDetail initiativeId={initiativeId} />
    </HydrateClient>
  );
}
