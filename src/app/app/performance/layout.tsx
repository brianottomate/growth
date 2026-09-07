import type { ReactNode } from "react";

import { PerformanceNav } from "./PerformanceNav";

/**
 * Wander Performance: the paid-media desk for the people who run client
 * campaigns and nothing else in this app. Four tabs, plain words, one job per
 * page. The fuller brand and campaign screens stay where they are; these are
 * the simplified faces on the same rows.
 */
export default function PerformanceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Wander Performance</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Clients, their campaigns, and what is spending.
        </p>
      </div>
      <PerformanceNav />
      {children}
    </div>
  );
}
