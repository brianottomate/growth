"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui/lib/utils";

const TABS = [
  { label: "Overview", tab: "", exact: true },
  { label: "Setup", tab: "setup" },
  { label: "Catalog", tab: "catalog" },
  { label: "Campaigns", tab: "campaigns" },
  { label: "Newsletter", tab: "newsletters" },
  { label: "Settings", tab: "settings" },
  { label: "Ad studio", tab: "ads" },
] as const;

/**
 * One client's tabs. The section itself has none: the sidebar and ⌘K are the
 * way in, and once you are on a client everything about them is a tab here.
 */
export function BrandTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/app/performance/brands/${slug}`;
  return (
    <nav
      aria-label="Client"
      className="-mx-1 flex scrollbar-thin gap-1 overflow-x-auto overflow-y-hidden border-b px-1 whitespace-nowrap"
    >
      {TABS.map((item) => {
        const href = item.tab ? `${base}/${item.tab}` : base;
        const active =
          "exact" in item && item.exact
            ? pathname === href
            : pathname.startsWith(href) ||
              (item.tab === "setup" && pathname.startsWith(`${base}/homes/`));
        return (
          <Link
            key={item.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
