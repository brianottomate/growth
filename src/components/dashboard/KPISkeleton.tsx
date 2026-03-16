import { cn } from '@/lib/utils'

function SkeletonCard({ large = false }: { large?: boolean }) {
  return (
    <div
      className={cn(
        'bg-bg-card border border-border rounded-lg',
        large ? 'p-6' : 'p-5'
      )}
    >
      {/* Label skeleton */}
      <div className="h-4 w-24 bg-white/5 rounded animate-pulse mb-3" />
      {/* Value skeleton */}
      <div
        className={cn(
          'bg-white/5 rounded animate-pulse',
          large ? 'h-9 w-32' : 'h-8 w-28'
        )}
      />
      {/* Change indicator skeleton */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-5 w-16 bg-white/5 rounded animate-pulse" />
        <div className="h-4 w-20 bg-white/5 rounded animate-pulse" />
      </div>
    </div>
  )
}

export function KPISkeleton() {
  return (
    <div className="space-y-4" data-testid="kpi-skeleton">
      {/* Primary - 3 column */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SkeletonCard large />
        <SkeletonCard large />
        <SkeletonCard large />
      </div>

      {/* Secondary - 2 column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Tertiary - 3 column */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
