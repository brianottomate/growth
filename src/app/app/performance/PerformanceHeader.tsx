"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeaderNewClient } from "./HeaderNewClient";

export function PerformanceHeader() {
  const pathname = usePathname();
  if (pathname === "/app/performance/prospects") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">
        Wander Performance
      </h1>
      <div className="flex items-center gap-3">
        <Link
          href="/app/performance/prospects"
          className="text-sm hover:underline"
        >
          Prospects
        </Link>
        <HeaderNewClient />
      </div>
    </div>
  );
}
