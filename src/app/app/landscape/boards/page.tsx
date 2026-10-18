import { HydrateClient, orpc, prefetch } from "@/orpc/server";
import { ReferenceBoards } from "./ReferenceBoards";
export default function BoardsPage() {
  prefetch(orpc.referenceBoard.list.queryOptions({ input: {} }));
  return (
    <HydrateClient>
      <ReferenceBoards />
    </HydrateClient>
  );
}
