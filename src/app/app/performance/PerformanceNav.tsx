"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui/lib/utils";

// Accounts (the List+ sponsorship records: sponsored homes, billing cycles)
// is deliberately not a tab. Its pages still answer at /app/performance/accounts
// and /app/performance/perf_… for the history they hold.
const TABS = [
  { label: "Dashboard", href: "/app/performance", exact: true },
  { label: "Clients", href: "/app/performance/clients" },
  { label: "Campaigns", href: "/app/performance/campaigns" },
  { label: "Prospects", href: "/app/performance/prospects" },
] as const;

/** The section's tabs. */
export function PerformanceNav() {
  const pathname = usePathname();
  const active = (tab: (typeof TABS)[number]) =>
    "exact" in tab && tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
  return (
    <nav
      aria-label="Wander Performance"
      className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto border-b px-1 whitespace-nowrap"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active(tab) ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
            active(tab)
              ? "border-foreground text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
