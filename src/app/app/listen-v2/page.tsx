import type { Metadata } from "next";

import { ListenV2 } from "./ListenV2";

export const metadata: Metadata = {
  title: "Listen v2",
};

const TABS = ["monitor", "reddit", "playbook"] as const;
type TabId = (typeof TABS)[number];

/**
 * /app/listen-v2 — the operator-first rebuild of /listen. Tabbed: "What we
 * monitor" (listening-source definition, modeled on /channels), "Reddit" (the
 * persisted execution queue off the `mention` store), and the Playbook (voice +
 * the Wander Test + what counts as signal). More per-channel rooms (X next)
 * follow the Reddit pattern.
 *
 * Built alongside the live /listen (the engineer console) the same way feed-v5
 * shipped next to the older feed prototypes — promote to /listen once it covers
 * the daily workflow.
 */
export default async function ListenV2Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const defaultTab: TabId = TABS.includes(tab as TabId)
    ? (tab as TabId)
    : "playbook";

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
      <ListenV2 defaultTab={defaultTab} />
    </div>
  );
}
