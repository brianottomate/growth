import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";
import { PerformanceClient } from "../PerformanceClient";

export const metadata: Metadata = {
  title: "Accounts · Wander Performance",
};

// The commercial layer of Performance by Wander: one account per paying
// client, with cycles of billed amount versus media budget. Replaces the
// "Performance Dashboard" sheet, so the columns deliberately mirror it.
export default async function PerformancePage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  prefetch(trpc.performance.list.queryOptions());

  return (
    <HydrateClient>
      <PerformanceClient />
    </HydrateClient>
  );
}
