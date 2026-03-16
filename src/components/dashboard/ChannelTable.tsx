'use client'

import { ChannelRow } from './ChannelRow'
import { ChannelTableSkeleton } from './ChannelTableSkeleton'
import { formatCurrency, formatNumber, formatMultiplier } from '@/lib/utils/format'
import { BLENDED_TAKE_RATE } from '@/types'
import type { ChannelMetrics } from '@/types'

interface ChannelTableProps {
  channels: ChannelMetrics[] | null
  isLoading?: boolean
}

interface TotalsRow {
  spend: number
  bookings: number
  cpb: number | null
  roas: number | null
  gmv: number
}

function calculateTotals(channels: ChannelMetrics[]): TotalsRow {
  const totals = channels.reduce(
    (acc, ch) => ({
      spend: acc.spend + (ch.spend ?? 0),
      bookings: acc.bookings + (ch.bookings ?? 0),
      gmv: acc.gmv + (ch.gmv ?? 0),
    }),
    { spend: 0, bookings: 0, gmv: 0 }
  )

  return {
    ...totals,
    cpb: totals.bookings > 0 ? totals.spend / totals.bookings : null,
    roas: totals.spend > 0 ? (totals.gmv * BLENDED_TAKE_RATE) / totals.spend : null,
  }
}

function sortBySpend(channels: ChannelMetrics[]): ChannelMetrics[] {
  return [...channels].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
}

export function ChannelTable({ channels, isLoading }: ChannelTableProps) {
  if (isLoading || !channels) {
    return <ChannelTableSkeleton />
  }

  const sortedChannels = sortBySpend(channels)
  const totals = calculateTotals(channels)

  return (
    <div
      className="bg-bg-card border border-border rounded-lg overflow-hidden"
      data-testid="channel-table"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-bg-secondary">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wide min-w-[180px]">
                Channel
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wide w-[100px]">
                Spend
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wide w-[80px]">
                Bookings
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wide w-[80px]">
                CPB
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wide w-[60px]">
                ROAS
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wide w-[100px]">
                GMV
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wide w-[40px]">
                <span className="sr-only">Status</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedChannels.map((metrics) => (
              <ChannelRow key={metrics.channel} metrics={metrics} />
            ))}
          </tbody>
          <tfoot>
            <tr
              className="bg-bg-secondary font-semibold sticky bottom-0"
              data-testid="channel-totals-row"
            >
              <td className="px-4 py-3 text-sm text-text-primary">
                Totals
              </td>
              <td className="px-4 py-3 text-right text-sm font-mono text-text-primary">
                {formatCurrency(totals.spend, { compact: true })}
              </td>
              <td className="px-4 py-3 text-right text-sm font-mono text-text-primary">
                {formatNumber(totals.bookings)}
              </td>
              <td className="px-4 py-3 text-right text-sm font-mono text-text-primary">
                {formatCurrency(totals.cpb)}
              </td>
              <td className="px-4 py-3 text-right text-sm font-mono text-text-primary">
                {formatMultiplier(totals.roas)}
              </td>
              <td className="px-4 py-3 text-right text-sm font-mono text-text-primary">
                {formatCurrency(totals.gmv, { compact: true })}
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
