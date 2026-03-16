import { cn } from '@/lib/utils'
import type { InsightSeverity } from '@/types'

interface InsightBadgeProps {
  severity: InsightSeverity
  className?: string
}

const severityConfig: Record<
  InsightSeverity,
  { label: string; classes: string }
> = {
  action_needed: {
    label: 'Action Needed',
    classes: 'bg-status-red/10 text-status-red',
  },
  opportunity: {
    label: 'Opportunity',
    classes: 'bg-status-green/10 text-status-green',
  },
  monitor: {
    label: 'Monitor',
    classes: 'bg-status-yellow/10 text-status-yellow',
  },
  on_track: {
    label: 'On Track',
    classes: 'bg-accent-blue/10 text-accent-blue',
  },
}

export function InsightBadge({ severity, className }: InsightBadgeProps) {
  const config = severityConfig[severity]

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        config.classes,
        className
      )}
      data-testid={`insight-badge-${severity}`}
    >
      {config.label}
    </span>
  )
}
