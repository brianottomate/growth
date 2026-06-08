import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { trpc, HydrateClient, prefetch } from "@/trpc/server";
import { GroupingsClient } from "./GroupingsClient";

export default async function GroupingsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  prefetch(trpc.content.groupingSuggestions.queryOptions());

  return (
    <HydrateClient>
      <GroupingsClient />
    </HydrateClient>
  );
}
