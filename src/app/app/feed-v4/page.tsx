import { redirect } from "next/navigation";

import { loadFeedProtoData } from "../_feed-proto/data";
import { ProtoNav } from "../_feed-proto/ProtoNav";
import { V4Client } from "./V4Client";

export default async function FeedV4Page() {
  const data = await loadFeedProtoData();
  if (!data) redirect("/signin");
  if (!data.org) {
    return <div className="text-muted-foreground">No organization found.</div>;
  }

  return (
    <div>
      <ProtoNav active="v4" />
      <V4Client
        brands={data.brands}
        entries={data.entries}
        campaigns={data.campaigns}
        initiatives={data.initiatives}
        nowISO={new Date().toISOString()}
      />
    </div>
  );
}
