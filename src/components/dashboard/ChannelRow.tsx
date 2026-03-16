import { ChannelAvatar } from './ChannelAvatar'
import { StatusDot } from './StatusDot'
import { getChannelConfig } from '@/lib/channel-config'
import { formatCurrency, formatNumber, formatMultiplier } from '@/lib/utils/format'
import type { ChannelMetrics } from '@/types'

interface ChannelRowProps {
  metrics: ChannelMetrics
}

export function ChannelRow({ metrics }: ChannelRowProps) {
  const config = getChannelConfig(metrics.channel)
  const channelName = config?.name ?? metrics.channel.charAt(0).toUpperCase() + metrics.channel.slice(1).replace(/_/g, ' ')

  return (
    <tr
      className="border-b border-border hover:bg-bg-card-hover transition-colors"
      data-testid={`channel-row-${metrics.channel}`}
    >
      {/* Channel */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-3">
          <ChannelAvatar channel={metrics.channel} />
          <span className="text-sm font-medium text-text-primary">
            {channelName}
          </span>
        </div>
      </td>

      {/* Spend */}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span className="text-sm font-mono text-text-primary">
          {metrics.spend !== null
            ? formatCurrency(metrics.spend, { compact: true })
            : '—'}
        </span>
      </td>

      {/* Bookings */}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span className="text-sm font-mono text-text-primary">
          {metrics.bookings !== null ? formatNumber(metrics.bookings) : '—'}
        </span>
      </td>

      {/* CPB */}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span className="text-sm font-mono text-text-primary">
          {metrics.cpb != null ? formatCurrency(metrics.cpb) : '—'}
        </span>
      </td>

      {/* ROAS */}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span className="text-sm font-mono text-text-primary">
          {metrics.roas != null ? formatMultiplier(metrics.roas) : '—'}
        </span>
      </td>

      {/* GMV */}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span className="text-sm font-mono text-text-primary">
          {metrics.gmv !== null
            ? formatCurrency(metrics.gmv, { compact: true })
            : '—'}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <div className="flex justify-center">
          <StatusDot cpb={metrics.cpb ?? null} />
        </div>
      </td>
    </tr>
  )
}
