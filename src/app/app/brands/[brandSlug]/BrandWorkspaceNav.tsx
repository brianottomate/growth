"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  ["", "Overview"],
  ["strategy", "Strategy"],
  ["inspiration", "Inspiration"],
  ["content", "Content"],
  ["newsletters", "Newsletters"],
  ["previews", "Organic previews"],
  ["ads", "Paid campaigns"],
  ["initiatives", "Initiatives"],
  ["homes", "Homes & targets"],
  ["setup", "Connections"],
] as const;
export function BrandWorkspaceNav({
  slug,
  performance,
}: {
  slug: string;
  performance: boolean;
}) {
  const pathname = usePathname();
  const base = `/app/brands/${slug}`;
  return (
    <div className="mb-5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/app/brands" className="underline">
          All brands
        </Link>
        {performance && (
          <Link href={`/app/performance/clients/${slug}`} className="underline">
            Open Performance workspace
          </Link>
        )}
      </div>
      <nav
        aria-label="Brand workspace"
        className="flex gap-1 overflow-x-auto border-b"
      >
        {tabs.map(([path, label]) => {
          const href = path ? `${base}/${path}` : base;
          const active = path
            ? pathname === href || pathname.startsWith(`${href}/`)
            : pathname === href;
          return (
            <Link
              key={path}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                active
                  ? "border-foreground font-medium"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
