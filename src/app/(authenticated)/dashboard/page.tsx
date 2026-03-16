'use client'

import { Info } from 'lucide-react'
import { KPIGrid } from '@/components/dashboard/KPIGrid'
import { ChannelTable } from '@/components/dashboard/ChannelTable'
import { InsightsPanel } from '@/components/dashboard/InsightsPanel'
import { TrendsChart } from '@/components/dashboard/TrendsChart'
import { useDashboard } from '@/hooks/use-dashboard'
import { useChannels } from '@/hooks/use-channels'
import { useInsights } from '@/hooks/use-insights'
import { useTrends } from '@/hooks/use-trends'
import { useRefresh } from '@/hooks/use-refresh'

export default function DashboardPage() {
  const { isRefreshing } = useRefresh()

  const { data, isLoading: dashboardLoading, error: dashboardError } = useDashboard()
  const { channels, isLoading: channelsLoading, error: channelsError } = useChannels()
  const { insights, isLoading: insightsLoading, error: insightsError } = useInsights()
  const { trends, isLoading: trendsLoading, error: trendsError } = useTrends()

  // Show loading states during refresh
  const isLoading = {
    dashboard: dashboardLoading || isRefreshing,
    channels: channelsLoading || isRefreshing,
    insights: insightsLoading || isRefreshing,
    trends: trendsLoading || isRefreshing,
  }

  const error = dashboardError || channelsError || insightsError || trendsError

  return (
    <div data-testid="dashboard-page">
      {/* Error State */}
      {error && (
        <div
          className="mb-6 p-4 bg-status-red/10 border border-status-red/20 rounded-lg text-status-red"
          role="alert"
          data-testid="dashboard-error"
        >
          {error}
        </div>
      )}

      {/* Data Methodology Note */}
      <div className="mb-4 flex items-start gap-2 px-1 text-xs text-text-muted">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
        <p>
          Showing <span className="text-text-secondary font-medium">marketing-attributed bookings only</span> — confirmed
          bookings matched to a channel via last-touch attribution (Drayton methodology). Not total Wander bookings.
        </p>
      </div>

      {/* KPI Grid - Prompt 05 */}
      <section className="mb-6" data-testid="kpi-section">
        <KPIGrid data={data} isLoading={isLoading.dashboard} />
      </section>

      {/* Channel Table - Prompt 06 */}
      <section className="mb-6" data-testid="channels-section">
        <ChannelTable channels={channels} isLoading={isLoading.channels} />
      </section>

      {/* Spend Trend - Single column */}
      <section className="mb-6" data-testid="trends-section">
        <TrendsChart data={trends} isLoading={isLoading.trends} />
      </section>

      {/* Insights - Single column */}
      <section data-testid="insights-section">
        <InsightsPanel insights={insights} isLoading={isLoading.insights} />
      </section>
    </div>
  )
}
