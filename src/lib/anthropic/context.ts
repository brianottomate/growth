import { formatCurrency, formatNumber, formatMultiplier } from '@/lib/utils/format'
import { getChannelConfig } from '@/lib/channel-config'
import { CPB_TARGET, BLENDED_TAKE_RATE, OTA_CHANNELS } from '@/types'
import type { DashboardSummary, ChannelMetrics, Insight, Channel } from '@/types'

export interface MonthlyMetrics {
  month: string // "2025-01" format
  spend: number
  bookings: number
  gmv: number
  cpb: number | null
  roas: number | null
}

export interface ChannelMonthlyMetrics {
  channel: Channel
  months: MonthlyMetrics[]
}

export interface ContextData {
  summary: DashboardSummary | null
  channels: ChannelMetrics[]
  insights: Insight[]
  monthlyTrends?: MonthlyMetrics[]
  channelMonthly?: ChannelMonthlyMetrics[]
  dateRange?: { start: string; end: string }
  periodLabel?: string // e.g. "Last 30 Days", "All Time"
}

/**
 * Format dashboard summary for system prompt
 */
export function formatSummaryForPrompt(summary: DashboardSummary | null): string {
  if (!summary) {
    return 'Dashboard data is currently loading...'
  }

  const { totals, efficiency, period } = summary

  const directBookings = totals.directBookings || 0
  const otaBookings = totals.bookings - directBookings

  return `
Period: ${period.month} (${period.daysElapsed}/${period.daysInMonth} days)

Spend Breakdown:
- Ad Spend: ${formatCurrency(totals.adSpend)} (channel media spend only)
- Fixed Costs: ${formatCurrency(totals.fixedCosts)} (pro-rated for period)
- Points Used: ${formatCurrency(totals.pointsUsed)}
- Coupons/Giveaways: ${formatCurrency(totals.couponOff)}
- Total Marketing Spend: ${formatCurrency(totals.spend)} (ad spend + fixed + points + coupons)

Efficiency Metrics:
- DCPB: ${formatCurrency(efficiency.directCpb)} (target: ${formatCurrency(CPB_TARGET)}) — total marketing spend / direct bookings — PRIMARY METRIC
- CPB: ${formatCurrency(efficiency.cpb)} — total marketing spend / total bookings
- ROAS: ${formatMultiplier(efficiency.roas)} — (GMV × ${BLENDED_TAKE_RATE * 100}% blended take rate) / ad spend
- GMV: ${formatCurrency(totals.gmv)}
- Take Rate Revenue (estimated): ${formatCurrency(totals.gmv * BLENDED_TAKE_RATE)} (GMV × ${BLENDED_TAKE_RATE * 100}%)

Booking Breakdown:
- Direct Bookings: ${formatNumber(directBookings)} (excludes OTA — used for DCPB)
- OTA Bookings: ${formatNumber(otaBookings)} (Airbnb, Vrbo, Booking.com, Amex/MyBookingPal)
- Total Bookings: ${formatNumber(totals.bookings)}

Funnel Metrics:
- Account Creations: ${formatNumber(totals.accountCreations)}
- Checkouts Started: ${formatNumber(totals.checkoutStarted)}
`.trim()
}

/**
 * Format channel metrics for system prompt
 */
export function formatChannelsForPrompt(channels: ChannelMetrics[]): string {
  if (channels.length === 0) {
    return 'Channel data is currently loading...'
  }

  // Sort by spend descending
  const sorted = [...channels].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))

  const rows = sorted.map((ch) => {
    const config = getChannelConfig(ch.channel)
    const channelName = config?.name ?? ch.channel.charAt(0).toUpperCase() + ch.channel.slice(1).replace(/_/g, ' ')
    const cpbStatus = getCPBStatusLabel(ch.cpb)

    return `- ${channelName}: Spend ${formatCurrency(ch.spend ?? 0, { compact: true })}, ` +
      `Bookings ${formatNumber(ch.bookings ?? 0)}, ` +
      `CPB ${ch.cpb ? formatCurrency(ch.cpb) : 'N/A'} ${cpbStatus}, ` +
      `ROAS ${ch.roas ? formatMultiplier(ch.roas) : 'N/A'}`
  })

  return rows.join('\n')
}

function getCPBStatusLabel(cpb: number | null | undefined): string {
  if (cpb === null || cpb === undefined) return ''
  if (cpb < 400) return '(excellent)'
  if (cpb <= CPB_TARGET) return '(on target)'
  return '(over target)'
}

/**
 * Format insights for system prompt
 */
export function formatInsightsForPrompt(insights: Insight[]): string {
  if (insights.length === 0) {
    return 'No active insights at this time.'
  }

  return insights.map((insight) => {
    const severity = insight.severity.replace('_', ' ').toUpperCase()
    return `[${severity}] ${insight.title}: ${insight.description}`
  }).join('\n')
}

/**
 * Format monthly trends for system prompt
 */
export function formatMonthlyTrendsForPrompt(months: MonthlyMetrics[] | undefined): string {
  if (!months || months.length === 0) {
    return 'Monthly trend data not available.'
  }

  // Show last 12 months
  const recent = months.slice(-12)

  const rows = recent.map((m) => {
    const monthName = new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return `- ${monthName}: Spend ${formatCurrency(m.spend, { compact: true })}, ` +
      `Bookings ${formatNumber(m.bookings)}, ` +
      `CPB ${m.cpb ? formatCurrency(m.cpb) : 'N/A'}, ` +
      `ROAS ${m.roas ? formatMultiplier(m.roas) : 'N/A'}`
  })

  return rows.join('\n')
}

/**
 * Format channel monthly breakdown for top channels
 */
export function formatChannelMonthlyForPrompt(channelMonthly: ChannelMonthlyMetrics[] | undefined): string {
  if (!channelMonthly || channelMonthly.length === 0) {
    return 'Channel monthly breakdown not available.'
  }

  // Show top 5 channels by total spend
  const topChannels = channelMonthly.slice(0, 5)

  const sections = topChannels.map((cm) => {
    const config = getChannelConfig(cm.channel)
    const channelName = config?.name ?? cm.channel.charAt(0).toUpperCase() + cm.channel.slice(1).replace(/_/g, ' ')
    const recentMonths = cm.months.slice(-6) // Last 6 months

    const monthRows = recentMonths.map((m) => {
      const monthName = new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      return `  ${monthName}: Spend ${formatCurrency(m.spend, { compact: true })}, Bookings ${m.bookings}, CPB ${m.cpb ? formatCurrency(m.cpb) : 'N/A'}, ROAS ${m.roas ? formatMultiplier(m.roas) : 'N/A'}`
    })

    return `${channelName}:\n${monthRows.join('\n')}`
  })

  return sections.join('\n\n')
}

/**
 * Build complete context for the system prompt
 */
export function buildContextString(data: ContextData): string {
  const period = data.periodLabel || 'All Time'
  const dateRangeStr = data.dateRange
    ? `Data covers: ${data.dateRange.start} to ${data.dateRange.end}`
    : 'Data Source: BigQuery (updated periodically)'

  return `
## Current Dashboard Data (${period})
${formatSummaryForPrompt(data.summary)}

## Channel Performance (${period})
${formatChannelsForPrompt(data.channels)}

## Monthly Trends (Last 12 Months)
${formatMonthlyTrendsForPrompt(data.monthlyTrends)}

## Top Channels by Month (Last 6 Months)
${formatChannelMonthlyForPrompt(data.channelMonthly)}

## Active Insights
${formatInsightsForPrompt(data.insights)}

## Key Business Context
- CPB Target: ${formatCurrency(CPB_TARGET)} (profitability threshold)
- Attribution: Last-touch attribution model (Drayton methodology)
- ${dateRangeStr}

## Metric Formulas (Kyle/Drayton methodology, March 2026)
- DCPB = Total Marketing Spend / Direct Bookings (PRIMARY metric, target: $${CPB_TARGET})
- CPB = Total Marketing Spend / Total Bookings
- ROAS = (GMV × ${BLENDED_TAKE_RATE * 100}% blended take rate) / Ad Spend

Where:
- Ad Spend = sum of all channel media spend (Meta, Google, TikTok, etc.)
- Total Marketing Spend = Ad Spend + Fixed Costs + Points Used + Coupons
- Direct Bookings = all bookings EXCLUDING OTA channels (${OTA_CHANNELS.join(', ')})
- Total Bookings = Direct + OTA
- Blended Take Rate = ${BLENDED_TAKE_RATE * 100}% (temporary — Drayton confirming per-channel rates)

EXCLUDED from Direct CPB denominator:
- OTA channels (${OTA_CHANNELS.join(', ')}) — bookings come through third-party platforms

DCPB is the primary metric Kyle and Drayton use. CPB includes all bookings. Both use total marketing spend (not just ad spend) in the numerator.
`.trim()
}
