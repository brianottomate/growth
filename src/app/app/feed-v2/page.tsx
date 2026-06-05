import { redirect } from "next/navigation";

import { loadFeedProtoData } from "../_feed-proto/data";
import { ProtoNav } from "../_feed-proto/ProtoNav";
import { LanesClient } from "./LanesClient";

export default async function FeedV2Page() {
  const data = await loadFeedProtoData();
  if (!data) redirect("/signin");
  if (!data.org) {
    return <div className="text-muted-foreground">No organization found.</div>;
  }

  return (
    <div>
      <ProtoNav active="v2" />
      <LanesClient
        brands={data.brands}
        entries={data.entries}
        nowISO={new Date().toISOString()}
      />
    </div>
  );
}
