import type { ReactNode } from "react";

import { PerformanceHeader } from "./PerformanceHeader";

/**
 * Wander Performance: the paid-media desk for the people who run client
 * campaigns and nothing else in this app. No section tabs: the sidebar and
 * ⌘K are the way in, and the tabs live on each client brand. The fuller brand
 * and campaign screens stay where they are; these are the simplified faces on
 * the same rows.
 */
export default function PerformanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PerformanceHeader />
      {children}
    </div>
  );
}
