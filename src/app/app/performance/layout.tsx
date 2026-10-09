"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

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
  const overview = usePathname() === "/app/performance/clients";
  return (
    <div
      className={overview ? "flex h-full min-h-0 flex-col gap-6" : "space-y-6"}
    >
      {children}
    </div>
  );
}
