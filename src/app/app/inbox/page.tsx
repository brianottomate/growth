import type { Metadata } from "next";

import { InboxHub } from "./InboxHub";
import type { InboxTabId } from "./InboxTabs";

export const metadata: Metadata = {
  title: "Inbox",
};

const TABS: InboxTabId[] = ["all", "dms", "comments", "ads"];

// Owned-inbound surface. `?tab=` deep-links a tab; defaults to the "All"
// overview. External listening lives on /app/listen.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const defaultTab = TABS.includes(tab as InboxTabId)
    ? (tab as InboxTabId)
    : "all";

  return <InboxHub defaultTab={defaultTab} />;
}
