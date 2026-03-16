'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { TrendsChartSkeleton } from './TrendsChartSkeleton'
import { ChartTooltip } from './ChartTooltip'
import { formatChartDate } from '@/lib/mock-trends'
import { formatCurrency } from '@/lib/utils/format'
import { getChannelConfig } from '@/lib/channel-config'
import {
  CHART_THEME,
  getChannelChartColor,
  TOP_CHART_CHANNELS,
} from '@/lib/chart-config'
import type { TrendData, Channel } from '@/types'

interface TrendsChartProps {
  data: TrendData | null
  isLoading?: boolean
}

// Transform data for Recharts (flatten byChannel into top-level keys)
function transformDataForChart(data: TrendData) {
  return data.series.map((point) => ({
    date: formatChartDate(point.date),
    ...point.byChannel,
  }))
}

// Custom legend renderer
interface LegendPayload {
  value: string
  color?: string
}

function CustomLegend({ payload }: { payload?: LegendPayload[] }) {
  if (!payload) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
      {payload.map((entry) => {
        // Validate that entry.value is a valid channel before casting
        if (!TOP_CHART_CHANNELS.includes(entry.value as Channel)) {
          return null
        }
        const channel = entry.value as Channel
        const config = getChannelConfig(channel)
        const channelName = config?.name ?? channel.charAt(0).toUpperCase() + channel.slice(1).replace(/_/g, ' ')

        return (
          <div key={channel} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color || '#6b7280' }}
            />
            <span className="text-xs text-text-muted">{channelName}</span>
          </div>
        )
      })}
    </div>
  )
}

export function TrendsChart({ data, isLoading }: TrendsChartProps) {
  if (isLoading || !data) {
    return <TrendsChartSkeleton />
  }

  const chartData = transformDataForChart(data)

  return (
    <div
      className="bg-bg-card border border-border rounded-lg overflow-hidden"
      data-testid="trends-chart"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
          Spend Trend
        </h3>
        <span className="text-xs text-text-muted">{data.period}</span>
      </div>

      {/* Chart */}
      <div className="p-6" data-testid="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              {TOP_CHART_CHANNELS.map((channel) => (
                <linearGradient
                  key={channel}
                  id={`gradient-${channel}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={getChannelChartColor(channel)}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={getChannelChartColor(channel)}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke={CHART_THEME.grid}
              vertical={false}
            />

            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_THEME.axis, fontSize: 12 }}
              tickMargin={8}
              interval="preserveStartEnd"
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_THEME.axis, fontSize: 12 }}
              tickMargin={8}
              tickFormatter={(value) => formatCurrency(value, { compact: true })}
              width={60}
            />

            <Tooltip content={<ChartTooltip />} />

            <Legend content={<CustomLegend />} />

            {TOP_CHART_CHANNELS.map((channel) => (
              <Area
                key={channel}
                type="monotone"
                dataKey={channel}
                stackId="1"
                stroke={getChannelChartColor(channel)}
                fill={`url(#gradient-${channel})`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
