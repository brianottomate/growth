import { getChannelConfig } from '@/lib/channel-config'
import { formatCurrency, formatPercent, formatMultiplier } from '@/lib/utils/format'
import { CPB_TARGET, CPB_EXCLUDED_CHANNELS } from '@/types'
import type { ChannelMetrics, Insight, InsightSeverity, Channel } from '@/types'

const CPB_EXCELLENT_THRESHOLD = 400
const ZERO_BOOKINGS_SPEND_THRESHOLD = 1000
const HIGH_ROAS_THRESHOLD = 5
const LOW_ROAS_THRESHOLD = 2
const LOW_ROAS_MIN_SPEND = 10000
const MIN_SPEND_FOR_INSIGHTS = 100 // Minimum spend to generate paid channel insights

// Channels where "increase budget" recommendations don't make sense
// - Unpaid/organic channels (no ad spend)
// - OTAs (commissions, not ad spend)
// - Catch-all channels with attribution issues
const UNPAID_CHANNELS: Channel[] = [
  'organic', 'airbnb', 'vrbo', 'booking', 'amex', 'lifecycle', 'affiliate', 'seo',
  'other', 'direct_mail', 'demand_sales', 'mountain' // mountain has CTV attribution issues
]

/**
 * Check if channel is a paid advertising channel
 */
function isPaidChannel(channel: Channel, spend: number | null): boolean {
  if (UNPAID_CHANNELS.includes(channel)) return false
  return spend != null && spend > MIN_SPEND_FOR_INSIGHTS
}

/**
 * Get display name for a channel
 */
function getChannelName(channel: Channel): string {
  const config = getChannelConfig(channel)
  if (!config) {
    // Fallback for unrecognized channels
    return channel.charAt(0).toUpperCase() + channel.slice(1).replace(/_/g, ' ')
  }
  return config.name
}

interface InsightRule {
  id: string
  check: (metrics: ChannelMetrics) => boolean
  generate: (metrics: ChannelMetrics, dateRange: string) => Omit<Insight, 'id' | 'generatedAt'>
}

const insightRules: InsightRule[] = [
  // Rule 1: CPB exceeds target (action_needed)
  {
    id: 'cpb-above-target',
    check: (m) => m.cpb != null && m.cpb > CPB_TARGET,
    generate: (m, dateRange) => ({
      type: 'above_target',
      severity: 'action_needed',
      channel: m.channel,
      title: `${getChannelName(m.channel)} CPB exceeds target`,
      description: `Based on ${dateRange}: CPB is ${formatCurrency(m.cpb!)} vs ${formatCurrency(CPB_TARGET)} target (+${formatPercent((m.cpb! - CPB_TARGET) / CPB_TARGET)})`,
      metric: {
        name: 'CPB',
        value: m.cpb!,
        comparison: CPB_TARGET,
        delta: (m.cpb! - CPB_TARGET) / CPB_TARGET,
        direction: 'up',
      },
      recommendation: `Review ${getChannelName(m.channel)} campaign targeting and bidding strategy`,
    }),
  },

  // Rule 2: CPB excellent (opportunity) - ONLY for paid channels with real spend
  {
    id: 'cpb-excellent',
    check: (m) =>
      m.cpb != null &&
      m.cpb > 0 && // Must have positive CPB (not $0)
      m.cpb < CPB_EXCELLENT_THRESHOLD &&
      m.bookings != null &&
      m.bookings > 0 &&
      isPaidChannel(m.channel, m.spend), // Only paid channels
    generate: (m, dateRange) => ({
      type: 'opportunity',
      severity: 'opportunity',
      channel: m.channel,
      title: `${getChannelName(m.channel)} showing strong efficiency`,
      description: `Based on ${dateRange}: CPB is ${formatCurrency(m.cpb!)}, well below ${formatCurrency(CPB_EXCELLENT_THRESHOLD)} threshold`,
      metric: {
        name: 'CPB',
        value: m.cpb!,
        comparison: CPB_EXCELLENT_THRESHOLD,
        delta: (CPB_EXCELLENT_THRESHOLD - m.cpb!) / CPB_EXCELLENT_THRESHOLD,
        direction: 'down',
      },
      recommendation: `Consider increasing ${getChannelName(m.channel)} budget to capture more efficient bookings`,
    }),
  },

  // Rule 3: Zero bookings with significant spend (action_needed)
  {
    id: 'zero-bookings',
    check: (m) =>
      (m.bookings == null || m.bookings === 0) &&
      m.spend != null &&
      m.spend > ZERO_BOOKINGS_SPEND_THRESHOLD,
    generate: (m, dateRange) => ({
      type: 'anomaly_low',
      severity: 'action_needed',
      channel: m.channel,
      title: `${getChannelName(m.channel)} has zero bookings`,
      description: `Based on ${dateRange}: Spent ${formatCurrency(m.spend!, { compact: true })} with no attributed bookings`,
      metric: {
        name: 'Bookings',
        value: 0,
        comparison: 1,
        delta: -100,
        direction: 'down',
      },
      recommendation: `Investigate ${getChannelName(m.channel)} attribution and campaign performance`,
    }),
  },

  // Rule 4: High ROAS (opportunity) - ONLY for paid channels with real spend
  {
    id: 'high-roas',
    check: (m) =>
      m.roas != null &&
      m.roas > HIGH_ROAS_THRESHOLD &&
      isPaidChannel(m.channel, m.spend), // Only paid channels
    generate: (m, dateRange) => ({
      type: 'opportunity',
      severity: 'opportunity',
      channel: m.channel,
      title: `${getChannelName(m.channel)} delivering exceptional ROAS`,
      description: `Based on ${dateRange}: ROAS is ${formatMultiplier(m.roas!)}, significantly above average`,
      metric: {
        name: 'ROAS',
        value: m.roas!,
        comparison: 3,
        delta: (m.roas! - 3) / 3,
        direction: 'up',
      },
      recommendation: `Explore scaling ${getChannelName(m.channel)} while maintaining efficiency`,
    }),
  },

  // Rule 5: Low ROAS with significant spend (monitor)
  {
    id: 'low-roas',
    check: (m) =>
      m.roas != null &&
      m.roas < LOW_ROAS_THRESHOLD &&
      m.spend != null &&
      m.spend > LOW_ROAS_MIN_SPEND,
    generate: (m, dateRange) => ({
      type: 'below_target',
      severity: 'monitor',
      channel: m.channel,
      title: `${getChannelName(m.channel)} ROAS below benchmark`,
      description: `Based on ${dateRange}: ROAS is ${formatMultiplier(m.roas!)}, below 2x benchmark`,
      metric: {
        name: 'ROAS',
        value: m.roas!,
        comparison: LOW_ROAS_THRESHOLD,
        delta: (m.roas! - LOW_ROAS_THRESHOLD) / LOW_ROAS_THRESHOLD,
        direction: 'down',
      },
      recommendation: `Monitor ${getChannelName(m.channel)} performance and consider optimization`,
    }),
  },
]

/**
 * Generate insights from channel metrics
 */
export function generateInsights(channels: ChannelMetrics[], dateRangeLabel: string = 'the past 30 days'): Insight[] {
  const insights: Insight[] = []
  const now = new Date().toISOString()

  // Track channels with spend/booking insights to avoid redundant ROAS alerts
  // e.g. "zero bookings" already explains why ROAS is 0 — no need for a second alert
  const channelsWithSpendInsight = new Set<Channel>()

  for (const channel of channels) {
    for (const rule of insightRules) {
      // Dedup: skip ROAS insights if channel already has a CPB or zero-bookings insight
      if ((rule.id === 'low-roas' || rule.id === 'high-roas') && channelsWithSpendInsight.has(channel.channel)) {
        continue
      }

      if (rule.check(channel)) {
        if (rule.id === 'cpb-above-target' || rule.id === 'zero-bookings') {
          channelsWithSpendInsight.add(channel.channel)
        }

        insights.push({
          id: `${rule.id}-${channel.channel}-${crypto.randomUUID()}`,
          ...rule.generate(channel, dateRangeLabel),
          generatedAt: now,
        })
      }
    }
  }

  // Portfolio-level insight: overall Ad CPB vs target
  const totalAdSpend = channels.reduce((sum, c) => sum + (c.spend || 0), 0)
  const directBookings = channels
    .filter(c => !CPB_EXCLUDED_CHANNELS.includes(c.channel))
    .reduce((sum, c) => sum + (c.bookings || 0), 0)

  if (totalAdSpend > 0 && directBookings > 0) {
    const portfolioCpb = totalAdSpend / directBookings
    if (portfolioCpb > CPB_TARGET) {
      insights.unshift({
        id: `portfolio-cpb-${crypto.randomUUID()}`,
        type: 'above_target',
        severity: 'action_needed',
        channel: null,
        title: 'Portfolio Ad CPB exceeds target',
        description: `Based on ${dateRangeLabel}: Overall CPB is ${formatCurrency(portfolioCpb)} across ${directBookings} direct bookings vs ${formatCurrency(CPB_TARGET)} target`,
        metric: {
          name: 'Portfolio CPB',
          value: portfolioCpb,
          comparison: CPB_TARGET,
          delta: (portfolioCpb - CPB_TARGET) / CPB_TARGET,
          direction: 'up',
        },
        recommendation: 'Review spend allocation across channels — consider shifting budget from high-CPB channels to more efficient ones',
        generatedAt: now,
      })
    }
  }

  // Sort by severity priority: action_needed > opportunity > monitor > on_track
  const severityOrder: Record<InsightSeverity, number> = {
    action_needed: 0,
    opportunity: 1,
    monitor: 2,
    on_track: 3,
  }

  return insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}

/**
 * Count insights by severity
 */
export function countInsightsBySeverity(
  insights: Insight[]
): Record<InsightSeverity, number> {
  return insights.reduce(
    (acc, insight) => {
      acc[insight.severity]++
      return acc
    },
    { action_needed: 0, opportunity: 0, monitor: 0, on_track: 0 }
  )
}
