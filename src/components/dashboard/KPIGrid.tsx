'use client'

import { KPICard, KPIStatus } from './KPICard'
import { KPISkeleton } from './KPISkeleton'
import { formatCurrency, formatNumber, formatMultiplier } from '@/lib/utils/format'
import { CPB_TARGET } from '@/types'
import { useDateRange } from '@/providers/DateRangeProvider'
import type { DashboardSummary } from '@/types'

interface KPIGridProps {
  data: DashboardSummary | null
  isLoading?: boolean
}

function getCPBStatus(cpb: number): KPIStatus {
  if (cpb < 400) return 'good'
  if (cpb <= CPB_TARGET) return 'warning'
  return 'bad'
}

export function KPIGrid({ data, isLoading }: KPIGridProps) {
  const { dateRange } = useDateRange()
  const isAllTime = dateRange === 'all'

  if (isLoading || !data) {
    return <KPISkeleton />
  }

  const { totals, efficiency } = data

  // Format the latest data date for display
  const latestDate = data.dataFreshness?.latestDataDate
  const formattedDate = latestDate
    ? new Date(latestDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  // Note: Period-over-period comparison removed until we implement historical data fetching
  // The KPICard change prop is intentionally omitted

  return (
    <div className="space-y-4" data-testid="kpi-grid">
      {/* Primary KPIs - 4 column */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Marketing Spend"
          value={formatCurrency(totals.totalMarketingSpend, { compact: true })}
          sublabel={formattedDate ? `thru ${formattedDate} · ${formatCurrency(totals.adSpend, { compact: true })} ads` : `${formatCurrency(totals.adSpend, { compact: true })} ad spend`}
          size="large"
        />
        <KPICard
          label="Total Bookings"
          value={formatNumber(totals.bookings)}
          sublabel={`${formatNumber(totals.directBookings)} direct`}
          size="large"
        />
        <KPICard
          label="DCPB"
          value={formatCurrency(efficiency.directCpb)}
          status={getCPBStatus(efficiency.directCpb)}
          sublabel="mktg spend / direct"
          size="large"
        />
        <KPICard
          label="CPB"
          value={formatCurrency(efficiency.cpb)}
          status={getCPBStatus(efficiency.cpb)}
          sublabel="mktg spend / total"
          size="large"
        />
      </div>

      {/* Secondary KPIs - 4 column */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Total GMV"
          value={formatCurrency(totals.gmv, { compact: true })}
          sublabel={`${formatCurrency(totals.directGmv, { compact: true })} direct`}
        />
        <KPICard
          label="ROAS"
          value={formatMultiplier(efficiency.roas)}
          sublabel="GMV × 20% / ad spend"
        />
        {isAllTime ? (
          <KPICard
            label="Channels"
            value={formatNumber(data.channels.length)}
            sublabel="with data"
          />
        ) : (
          <KPICard
            label="Fixed Costs"
            value={formatCurrency(totals.fixedCosts, { compact: true })}
            sublabel="pro-rated"
          />
        )}
        <KPICard
          label="Checkouts Started"
          value={formatNumber(totals.checkoutStarted)}
        />
      </div>
    </div>
  )
}
