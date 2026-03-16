export function TrendsChartSkeleton() {
  return (
    <div
      className="bg-bg-card border border-border rounded-lg overflow-hidden"
      data-testid="trends-chart-skeleton"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="h-5 w-28 bg-white/5 rounded animate-pulse" />
        <div className="h-8 w-32 bg-white/5 rounded animate-pulse" />
      </div>

      {/* Chart area */}
      <div className="p-6">
        <div className="h-[300px] bg-white/5 rounded animate-pulse" />
      </div>

      {/* Legend */}
      <div className="px-6 pb-4 flex items-center gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white/5 animate-pulse" />
            <div className="h-3 w-16 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
