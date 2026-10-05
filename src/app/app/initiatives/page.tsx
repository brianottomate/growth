import { HydrateClient, orpc, prefetch } from "@/orpc/server";
import { InitiativesClient } from "./InitiativesClient";
export default function InitiativesPage() {
  prefetch(orpc.initiative.list.queryOptions({ input: {} }));
  return (
    <HydrateClient>
      <InitiativesClient />
    </HydrateClient>
  );
}
