import { HydrateClient, orpc, prefetch } from "@/orpc/server";
import { InitiativeDetail } from "../InitiativesClient";
export default async function InitiativePage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  prefetch(orpc.initiative.get.queryOptions({ input: { id: initiativeId } }));
  return (
    <HydrateClient>
      <InitiativeDetail id={initiativeId} />
    </HydrateClient>
  );
}
