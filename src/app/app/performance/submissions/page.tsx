import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { HydrateClient, prefetch, orpc } from "@/orpc/server";
import { IntakePanel } from "../[accountId]/IntakePanel";

export const metadata: Metadata = {
  title: "Submissions · Wander Performance",
};

export default async function SubmissionsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  prefetch(orpc.performance.intakes.queryOptions({ input: {} }));

  return (
    <HydrateClient>
      <div className="space-y-6">
        <h2 className="text-base font-semibold">Submissions</h2>
        <IntakePanel />
      </div>
    </HydrateClient>
  );
}
