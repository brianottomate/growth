import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { orpc, HydrateClient, prefetch } from "@/orpc/server";
import { GroupingsClient } from "./GroupingsClient";

export default async function GroupingsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  prefetch(orpc.content.groupingSuggestions.queryOptions());

  return (
    <HydrateClient>
      <GroupingsClient />
    </HydrateClient>
  );
}
