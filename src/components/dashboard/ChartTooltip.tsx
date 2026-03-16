import { formatCurrency } from '@/lib/utils/format'
import { getChannelConfig } from '@/lib/channel-config'
import { CHART_THEME } from '@/lib/chart-config'
import type { Channel } from '@/types'

interface TooltipPayloadItem {
  dataKey: string
  value: number
  color: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  // Calculate total
  const total = payload.reduce((sum, item) => sum + (item.value || 0), 0)

  return (
    <div
      className="rounded-lg shadow-lg p-3 min-w-[180px]"
      style={{
        backgroundColor: CHART_THEME.tooltip.background,
        border: `1px solid ${CHART_THEME.tooltip.border}`,
      }}
      data-testid="chart-tooltip"
    >
      {/* Date */}
      <p
        className="text-xs font-medium mb-2"
        style={{ color: CHART_THEME.tooltip.muted }}
      >
        {label}
      </p>

      {/* Total */}
      <p
        className="text-sm font-bold mb-2"
        style={{ color: CHART_THEME.tooltip.text }}
      >
        Total: {formatCurrency(total, { compact: true })}
      </p>

      {/* Channel breakdown */}
      <div className="space-y-1">
        {payload
          .filter((item) => item.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 5) // Top 5 channels
          .map((item) => {
            const channel = item.dataKey as Channel
            const config = getChannelConfig(channel)
            const channelName = config?.name ?? channel.charAt(0).toUpperCase() + channel.slice(1).replace(/_/g, ' ')

            return (
              <div key={channel} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: CHART_THEME.tooltip.muted }}
                  >
                    {channelName}
                  </span>
                </div>
                <span
                  className="text-xs font-mono"
                  style={{ color: CHART_THEME.tooltip.text }}
                >
                  {formatCurrency(item.value, { compact: true })}
                </span>
              </div>
            )
          })}
      </div>
    </div>
  )
}
