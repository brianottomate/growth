import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Listen } from "./Listen";

export const metadata: Metadata = {
  title: "Listen",
};

const TABS = [
  "monitor",
  "reddit",
  "instagram",
  "x",
  "llm",
  "playbook",
] as const;
type TabId = (typeof TABS)[number];

// Legacy v1 SignalHub tabs → their new homes. Owned-inbound tabs moved to
// /app/inbox; the rest fold into the current tab set.
const LEGACY_TABS: Record<string, TabId> = {
  all: "monitor",
  mentions: "reddit",
  strategy: "monitor",
};

/**
 * /app/listen — external social listening: what we monitor, the per-channel
 * rooms (Reddit / Instagram / X), the tool directory, and the Playbook.
 * Promoted from /app/listen-v2 (which now redirects here). Owned-inbound
 * triage (DMs + comments on our own posts and ads) lives on /app/inbox.
 */
export default async function ListenPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;

  // v1's DMs/comments tabs moved to /app/inbox — honor old bookmarks.
  if (tab === "dms") redirect("/app/inbox?tab=dms");
  if (tab === "comments") redirect("/app/inbox?tab=comments");

  const defaultTab: TabId = TABS.includes(tab as TabId)
    ? (tab as TabId)
    : (LEGACY_TABS[tab ?? ""] ?? "monitor");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Listen</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Our social listening strategy — the channels we monitor, what we
          listen for, and how we reply. The brain behind every scan and draft
          reply; edit it live, no deploy.
        </p>
      </header>
      <Listen defaultTab={defaultTab} />
    </div>
  );
}
