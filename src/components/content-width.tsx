"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Maximize2, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ContentWidth = "contained" | "full";

// Longest prefix wins. Anything unlisted is contained.
const DEFAULTS: Array<[prefix: string, width: ContentWidth]> = [
  ["/app/performance", "contained"],
];

const STORAGE_KEY = "growth.content-width";
const CHANGE_EVENT = "growth:content-width";

function scopeFor(pathname: string) {
  // The overview pipeline gets its own width preference; client workspaces
  // and all other Performance pages retain the contained default.
  if (pathname === "/app/performance")
    return {
      prefix: "/app/performance/overview",
      fallback: "full" as ContentWidth,
    };
  const match = DEFAULTS.filter(
    ([p]) => pathname === p || pathname.startsWith(`${p}/`),
  ).sort((a, b) => b[0].length - a[0].length)[0];
  return {
    prefix: match?.[0] ?? pathname,
    fallback: match?.[1] ?? "contained",
  };
}

function readOverrides(): Record<string, ContentWidth> {
  try {
    return JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, ContentWidth>;
  } catch {
    return {};
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useContentWidth() {
  const pathname = usePathname();
  const { prefix, fallback } = scopeFor(pathname);
  const width = useSyncExternalStore(
    subscribe,
    () => readOverrides()[prefix] ?? fallback,
    () => fallback,
  );
  const toggle = useCallback(() => {
    const next: ContentWidth = width === "full" ? "contained" : "full";
    const overrides = readOverrides();
    if (next === fallback) delete overrides[prefix];
    else overrides[prefix] = next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [width, fallback, prefix]);
  return { width, toggle };
}

export function ContentWidthToggle({ className }: { className?: string }) {
  const { width, toggle } = useContentWidth();
  const Icon = width === "full" ? Minimize2 : Maximize2;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", className)}
      onClick={toggle}
      title={width === "full" ? "Contain page" : "Full width"}
    >
      <Icon />
      <span className="sr-only">Toggle page width</span>
    </Button>
  );
}

export function ContentColumn({ children }: { children: ReactNode }) {
  const isPerformanceOverview = usePathname() === "/app/performance";
  const { width } = useContentWidth();
  return (
    <div
      className={cn(
        "mx-auto w-full p-4 pb-20 transition-[max-width] duration-300 ease-out motion-reduce:transition-none @xl:p-8 @xl:pb-20",
        isPerformanceOverview && "h-full min-h-0 pb-4 @xl:pb-8",
        width === "contained" ? "max-w-5xl" : "max-w-full",
      )}
    >
      {children}
    </div>
  );
}
