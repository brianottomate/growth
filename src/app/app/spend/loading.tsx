import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant Suspense fallback for the Spend dashboard. The page is a dynamic
 * server component that awaits BigQuery + the Meta API on a cold cache (the
 * cache is warmed daily by /api/cron/spend, but the first human load after a
 * revalidation can lag several seconds). This skeleton mirrors the KPI grid and
 * channel table so navigating to /app/spend feels immediate instead of hanging
 * on a blank screen.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton shape="soft" className="h-9 w-40" />
      </div>

      {/* KPI grid — matches grid-cols-2 md:grid-cols-3 lg:grid-cols-4 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Channel table */}
      <div className="rounded-xl border">
        <div className="border-b px-4 py-3">
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0"
          >
            <Skeleton shape="round" className="size-2.5 shrink-0" />
            <Skeleton className="h-4 w-32" />
            <div className="ml-auto flex gap-6 sm:gap-8">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="hidden h-4 w-12 sm:block" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
