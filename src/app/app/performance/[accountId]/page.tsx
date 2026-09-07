import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";
import { AccountDetail } from "./AccountDetail";

export const metadata: Metadata = {
  title: "Account · Wander Performance",
};

export default async function PerformanceAccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const { accountId } = await params;
  prefetch(trpc.performance.get.queryOptions({ accountId }));

  return (
    <HydrateClient>
      <AccountDetail accountId={accountId} />
    </HydrateClient>
  );
}
