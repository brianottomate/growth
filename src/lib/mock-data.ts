import type { DashboardSummary, ChannelMetrics, Channel } from '@/types'
import { CPB_TARGET } from '@/types'

/**
 * Generate realistic mock dashboard data based on Wander's metrics
 * This will be replaced with BigQuery data in Prompt 12
 */
export function getMockDashboardData(month?: string | null): DashboardSummary {
  const now = new Date()
  const targetMonth = month
    ? new Date(month + '-01')
    : new Date(now.getFullYear(), now.getMonth(), 1)

  const monthName = targetMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const daysInMonth = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0
  ).getDate()

  const daysElapsed = month
    ? daysInMonth // Full month if historical
    : Math.min(now.getDate(), daysInMonth)

  // Realistic Wander metrics (scaled to days elapsed)
  const dayRatio = daysElapsed / daysInMonth

  const bookings = Math.round(847 * dayRatio)
  const directBookings = Math.round(bookings * 0.75) // ~75% are direct (excludes OTA)

  const adSpend = Math.round(1250000 * dayRatio)
  const fixedCosts = Math.round(114725 * dayRatio / 30 * daysElapsed / dayRatio) // Pro-rated
  const pointsUsed = Math.round(50000 * dayRatio) // ~$50K/mo in points
  const couponOff = Math.round(75000 * dayRatio) // ~$75K/mo in coupons
  const totalMarketingSpend = adSpend + fixedCosts + pointsUsed + couponOff

  const gmv = Math.round(4850000 * dayRatio)
  const directGmv = Math.round(gmv * 0.85) // ~85% from direct channels
  const otaGmv = gmv - directGmv // ~15% from OTA
  const takeRateRevenue = Math.round(gmv * 0.44) // ~44% take rate on GMV
  const otaBookings = bookings - directBookings

  const totals = {
    adSpend,
    fixedCosts,
    pointsUsed,
    couponOff,
    totalMarketingSpend,
    spend: totalMarketingSpend,
    accountCreations: Math.round(12450 * dayRatio),
    checkoutPreviewed: Math.round(4200 * dayRatio),
    checkoutStarted: Math.round(2850 * dayRatio),
    bookings,
    directBookings,
    otaBookings,
    gmv,
    directGmv,
    otaGmv,
    takeRateRevenue,
  }

  // Kyle/Drayton methodology (March 2026)
  const efficiency = {
    cpac: totalMarketingSpend / totals.accountCreations,
    cpb: totalMarketingSpend / totals.bookings, // Total marketing spend / total bookings
    directCpb: totalMarketingSpend / totals.directBookings, // DCPB: total marketing spend / direct bookings
    fullyLoadedCpb: totalMarketingSpend / totals.bookings,
    roas: (gmv * 0.20) / adSpend, // (GMV × 20% blended take rate) / ad spend
  }

  // Mock channel data
  const channels: ChannelMetrics[] = buildChannelMetrics(daysElapsed)

  return {
    period: {
      month: monthName,
      daysInMonth,
      daysElapsed,
      asOfDate: now.toISOString().split('T')[0],
    },
    totals,
    efficiency,
    targets: {
      cpbTarget: CPB_TARGET,
      bookingsTarget: 1000,
    },
    channels,
    dataFreshness: {
      lastRefresh: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      latestDataDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      oldestData: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      nextScheduledRefresh: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours from now
    },
  }
}

function buildChannelMetrics(daysElapsed: number): ChannelMetrics[] {
  const dayRatio = daysElapsed / 30 // Normalize to ~30 days

  const channelData: Array<{
    channel: Channel
    spend: number
    bookings: number
    gmv: number
    accountCreations: number
  }> = [
    { channel: 'meta', spend: 450000, bookings: 320, gmv: 1850000, accountCreations: 4500 },
    { channel: 'google', spend: 380000, bookings: 280, gmv: 1620000, accountCreations: 3800 },
    { channel: 'tiktok', spend: 120000, bookings: 85, gmv: 490000, accountCreations: 1200 },
    { channel: 'pinterest', spend: 80000, bookings: 52, gmv: 300000, accountCreations: 800 },
    { channel: 'microsoft', spend: 45000, bookings: 28, gmv: 160000, accountCreations: 450 },
    { channel: 'criteo', spend: 35000, bookings: 22, gmv: 130000, accountCreations: 350 },
    { channel: 'mountain', spend: 60000, bookings: 25, gmv: 145000, accountCreations: 600 },
    { channel: 'influencer', spend: 40000, bookings: 18, gmv: 105000, accountCreations: 400 },
    { channel: 'lifecycle', spend: 15000, bookings: 12, gmv: 70000, accountCreations: 150 },
    { channel: 'seo', spend: 31000, bookings: 5, gmv: 30000, accountCreations: 200 },
  ]

  return channelData.map((ch) => {
    const spend = Math.round(ch.spend * dayRatio)
    const bookings = Math.round(ch.bookings * dayRatio)
    const gmv = Math.round(ch.gmv * dayRatio)
    const accountCreations = Math.round(ch.accountCreations * dayRatio)

    return {
      channel: ch.channel,
      date: new Date().toISOString().split('T')[0],
      spend,
      clicks: Math.round(spend / 2.5), // ~$2.50 CPC
      impressions: Math.round(spend / 0.015), // ~$15 CPM
      accountCreations,
      checkoutPreviewed: Math.round(accountCreations * 0.35),
      checkoutStarted: Math.round(accountCreations * 0.23),
      bookings,
      gmv,
      pointsUsed: null,
      couponOff: null,
      takeRateRevenue: Math.round(gmv * 0.12), // ~12% take rate for mock data
      directBookings: bookings,
      otaBookings: 0,
      cpac: spend / accountCreations,
      cpcp: spend / Math.round(accountCreations * 0.35),
      cpc: spend / Math.round(accountCreations * 0.23),
      cpb: spend / bookings,
      roas: (gmv * 0.20) / spend, // (GMV × 20% blended take rate) / spend
      dataSource: 'bigquery' as const,
      attribution: 'first_partner' as const,
      lastUpdated: new Date().toISOString(),
    }
  })
}

/**
 * Get mock channel metrics for API route
 */
export function getMockChannelMetrics(month?: string | null): ChannelMetrics[] {
  const dashboard = getMockDashboardData(month)
  return dashboard.channels
}

/**
 * Get mock dashboard summary for Claude context
 * Simplified version for AI context (uses current month)
 */
export function getMockDashboardSummary(): DashboardSummary {
  return getMockDashboardData()
}
