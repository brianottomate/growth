import { HydrateClient, orpc, prefetch } from "@/orpc/server";
import { Workbooks } from "./Workbooks";
export default function Page() {
  prefetch(orpc.contentWorkbook.options.queryOptions({ input: {} }));
  prefetch(orpc.contentWorkbook.list.queryOptions({ input: {} }));
  return (
    <HydrateClient>
      <Workbooks />
    </HydrateClient>
  );
}
