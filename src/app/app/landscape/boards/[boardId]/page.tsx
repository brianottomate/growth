import { HydrateClient, orpc, prefetch } from "@/orpc/server";
import { ReferenceBoard } from "../ReferenceBoard";
export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  prefetch(orpc.referenceBoard.get.queryOptions({ input: { id: boardId } }));
  return (
    <HydrateClient>
      <ReferenceBoard id={boardId} />
    </HydrateClient>
  );
}
