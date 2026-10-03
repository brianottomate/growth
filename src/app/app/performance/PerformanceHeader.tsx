"use client";

import { usePathname } from "next/navigation";

export function PerformanceHeader() {
  const pathname = usePathname();
  if (pathname === "/app/performance/prospects") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">
        Wander Performance
      </h1>
    </div>
  );
}
