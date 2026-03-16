import { InsightBadge } from '@/components/ui/InsightBadge'
import { getChannelConfig } from '@/lib/channel-config'
import { cn } from '@/lib/utils'
import type { Insight } from '@/types'

interface InsightCardProps {
  insight: Insight
  className?: string
}

const severityBorderColors: Record<Insight['severity'], string> = {
  action_needed: 'border-l-status-red',
  opportunity: 'border-l-status-green',
  monitor: 'border-l-status-yellow',
  on_track: 'border-l-accent-blue',
}

const severityBackgrounds: Record<Insight['severity'], string> = {
  action_needed: 'bg-status-red/5',
  opportunity: 'bg-status-green/5',
  monitor: 'bg-status-yellow/5',
  on_track: 'bg-accent-blue/5',
}

export function InsightCard({ insight, className }: InsightCardProps) {
  const config = insight.channel ? getChannelConfig(insight.channel) : null
  const channelName = insight.channel
    ? config?.name ?? insight.channel.charAt(0).toUpperCase() + insight.channel.slice(1).replace(/_/g, ' ')
    : 'Portfolio'

  return (
    <div
      className={cn(
        'p-4 border-l-4 hover:bg-white/[0.02] transition-colors',
        severityBorderColors[insight.severity],
        severityBackgrounds[insight.severity],
        className
      )}
      data-testid={`insight-card-${insight.id}`}
    >
      {/* Header: Badge */}
      <div className="flex items-center gap-2 mb-2">
        <InsightBadge severity={insight.severity} />
        {insight.channel && (
          <span className="text-xs text-text-muted">{channelName}</span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-text-primary mb-1">
        {insight.title}
      </h4>

      {/* Description */}
      <p className="text-sm text-text-secondary mb-2">{insight.description}</p>

      {/* Recommendation */}
      <p className="text-sm text-text-muted">
        <span className="text-text-secondary">→</span> {insight.recommendation}
      </p>
    </div>
  )
}
