import type { Metadata } from "next";

import { SignalHub } from "../_signal/SignalHub";
import type { SignalTabId } from "../_signal/SignalTabs";

export const metadata: Metadata = {
  title: "Listen",
};

const TABS: SignalTabId[] = [
  "all",
  "dms",
  "comments",
  "mentions",
  "x",
  "llm",
  "strategy",
];

// The single unified inbound surface. `?tab=` deep-links a tab (e.g. the
// /app/inbox redirect lands on ?tab=dms); defaults to the "All" overview.
export default async function ListenPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const defaultTab = TABS.includes(tab as SignalTabId)
    ? (tab as SignalTabId)
    : "all";

  return (
    <SignalHub
      defaultTab={defaultTab}
      title="Listen"
      subtitle="Everything inbound across channels — DMs, comments on owned posts and ads, and social mentions. Triage on-demand, copy context to Claude / ChatGPT, or reply natively."
    />
  );
}
