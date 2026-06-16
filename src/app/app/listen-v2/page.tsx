import type { Metadata } from "next";

import { MonitorStrategy } from "./MonitorStrategy";

export const metadata: Metadata = {
  title: "Listen v2",
};

/**
 * /app/listen-v2 — the operator-first rebuild of /listen, starting at the
 * STRATEGY level: an editable playbook (voice + the Wander Test + what counts
 * as signal) and a "what we monitor" definition surface modeled on /channels.
 *
 * Built alongside the live /listen (the engineer console) the same way feed-v5
 * shipped next to the older feed prototypes — promote to /listen once it covers
 * the daily workflow.
 */
export default function ListenV2Page() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Listen</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Our social listening strategy — the channels we monitor, what we
          listen for, and how we reply. This is the brain behind every scan and
          draft reply; edit it live, no deploy.
        </p>
      </header>
      <MonitorStrategy />
    </div>
  );
}
