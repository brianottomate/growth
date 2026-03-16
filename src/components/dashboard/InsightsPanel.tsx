'use client'

import { InsightCard } from './InsightCard'
import { InsightsSkeleton } from './InsightsSkeleton'
import { countInsightsBySeverity } from '@/lib/insights'
import type { Insight } from '@/types'

interface InsightsPanelProps {
  insights: Insight[] | null
  isLoading?: boolean
}

export function InsightsPanel({ insights, isLoading }: InsightsPanelProps) {
  if (isLoading || !insights) {
    return <InsightsSkeleton />
  }

  const counts = countInsightsBySeverity(insights)
  const actionCount = counts.action_needed + counts.opportunity

  return (
    <div
      className="bg-bg-card border border-border rounded-lg overflow-hidden"
      data-testid="insights-panel"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
          Insights
        </h3>
        {actionCount > 0 && (
          <span className="text-xs text-text-muted">
            {actionCount} {actionCount === 1 ? 'item' : 'items'} need attention
          </span>
        )}
      </div>

      {/* Insights list */}
      {insights.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm text-text-muted">
            No insights available. All channels are performing within expected ranges.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border" data-testid="insights-list">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  )
}
