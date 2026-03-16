export function InsightsSkeleton() {
  const rows = Array.from({ length: 3 }, (_, i) => i)

  return (
    <div
      className="bg-bg-card border border-border rounded-lg overflow-hidden"
      data-testid="insights-skeleton"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="h-5 w-20 bg-white/5 rounded animate-pulse" />
        <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
      </div>

      {/* Skeleton cards */}
      <div className="divide-y divide-border">
        {rows.map((i) => (
          <div key={i} className="p-4 border-l-4 border-l-white/10">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-5 w-24 bg-white/5 rounded animate-pulse" />
              <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
            </div>
            <div className="h-4 w-3/4 bg-white/5 rounded animate-pulse mb-2" />
            <div className="h-4 w-1/2 bg-white/5 rounded animate-pulse mb-2" />
            <div className="h-4 w-2/3 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
