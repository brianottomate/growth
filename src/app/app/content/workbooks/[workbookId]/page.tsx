import { HydrateClient, orpc, prefetch } from "@/orpc/server";
import { WorkbookReview } from "../WorkbookReview";
export default async function Page({
  params,
}: {
  params: Promise<{ workbookId: string }>;
}) {
  const { workbookId } = await params;
  prefetch(
    orpc.contentWorkbook.get.queryOptions({ input: { id: workbookId } }),
  );
  return (
    <HydrateClient>
      <WorkbookReview id={workbookId} />
    </HydrateClient>
  );
}
