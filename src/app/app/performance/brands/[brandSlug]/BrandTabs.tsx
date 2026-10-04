"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui/lib/utils";

const TABS = [
  { label: "Overview", tab: "", exact: true },
  { label: "Setup", tab: "setup" },
  { label: "WanderOS", tab: "wanderos" },
  { label: "Catalog", tab: "catalog" },
  { label: "Campaigns", tab: "campaigns" },
  { label: "Email", tab: "newsletters" },
  { label: "Settings", tab: "settings" },
  { label: "Ad studio", tab: "ads" },
  { label: "Pitch", tab: "pitch" },
  { label: "Extra", tab: "extra" },
] as const;

/**
 * One client's tabs. The section itself has none: the sidebar and ⌘K are the
 * way in, and once you are on a client everything about them is a tab here.
 */
export function BrandTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    // Scroll this strip only; scrollIntoView also moves the page vertically.
    const strip = nav.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    if (tab.left < strip.left || tab.right > strip.right) {
      nav.scrollLeft += tab.left - strip.left - (strip.width - tab.width) / 2;
    }
  }, [pathname]);
  const base = `/app/performance/brands/${slug}`;
  return (
    <nav
      ref={navRef}
      aria-label="Client"
      className="-mx-1 flex scrollbar-thin gap-1 overflow-x-auto overflow-y-hidden border-b px-1 whitespace-nowrap"
    >
      {TABS.map((item) => {
        const href = item.tab ? `${base}/${item.tab}` : base;
        const active =
          "exact" in item && item.exact
            ? pathname === href
            : pathname.startsWith(href) ||
              (item.tab === "wanderos" &&
                (pathname.startsWith(`${base}/homes/`) ||
                  pathname.startsWith(`${base}/booking`)));
        return (
          <Link
            key={item.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 py-2 text-sm transition-colors",
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
