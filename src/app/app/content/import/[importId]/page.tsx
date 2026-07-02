import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { trpc, HydrateClient, prefetch } from "@/trpc/server";
import { ImportReviewClient } from "./ImportReviewClient";

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const { importId } = await params;

  prefetch(trpc.planImport.get.queryOptions({ importId }));

  return (
    <HydrateClient>
      <ImportReviewClient importId={importId} />
    </HydrateClient>
  );
}
