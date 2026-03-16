import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isBigQueryEnabled } from '@/lib/bigquery/client'
import { getCachedMetrics } from '@/lib/bigquery/cache'
import { getMockDashboardSummary } from '@/lib/mock-data'
import { CPB_TARGET, BLENDED_TAKE_RATE, CPB_EXCLUDED_CHANNELS, OTA_CHANNELS } from '@/types'
import type { DashboardSummary, ChannelMetrics, ApiResponse } from '@/types'

function getMonthRange(month: string | null): { start: string; end: string } {
  const now = new Date()
  const targetMonth = month ? new Date(month + '-01') : new Date(now.getFullYear(), now.getMonth(), 1)

  const start = targetMonth.toISOString().split('T')[0]
  const endDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0)
  const end = endDate.toISOString().split('T')[0]

  return { start, end }
}

function aggregateToSummary(
  metrics: ChannelMetrics[],
  month: string,
  fixedCosts: number = 0
): DashboardSummary {
  // Aggregate all channel metrics into totals
  // Now uses real pointsUsed/couponOff/takeRateRevenue from cache (no longer hardcoded)
  const aggregated = metrics.reduce(
    (acc, m) => {
      const excludeFromCpb = CPB_EXCLUDED_CHANNELS.includes(m.channel)
      const isOta = OTA_CHANNELS.includes(m.channel)
      return {
        adSpend: acc.adSpend + (m.spend ?? 0),
        accountCreations: acc.accountCreations + (m.accountCreations ?? 0),
        checkoutPreviewed: acc.checkoutPreviewed + (m.checkoutPreviewed ?? 0),
        checkoutStarted: acc.checkoutStarted + (m.checkoutStarted ?? 0),
        bookings: acc.bookings + (m.bookings ?? 0),
        directBookings: acc.directBookings + (excludeFromCpb ? 0 : (m.bookings ?? 0)),
        otaBookings: acc.otaBookings + (isOta ? (m.bookings ?? 0) : 0),
        gmv: acc.gmv + (m.gmv ?? 0),
        directGmv: acc.directGmv + (isOta ? 0 : (m.gmv ?? 0)),
        otaGmv: acc.otaGmv + (isOta ? (m.gmv ?? 0) : 0),
        pointsUsed: acc.pointsUsed + (m.pointsUsed ?? 0),
        couponOff: acc.couponOff + (m.couponOff ?? 0),
        takeRateRevenue: acc.takeRateRevenue + (m.takeRateRevenue ?? 0),
      }
    },
    {
      adSpend: 0,
      accountCreations: 0,
      checkoutPreviewed: 0,
      checkoutStarted: 0,
      bookings: 0,
      directBookings: 0,
      otaBookings: 0,
      gmv: 0,
      directGmv: 0,
      otaGmv: 0,
      pointsUsed: 0,
      couponOff: 0,
      takeRateRevenue: 0,
    }
  )

  const { adSpend, directGmv, otaGmv, takeRateRevenue, otaBookings, pointsUsed, couponOff, ...rest } = aggregated
  // Total marketing spend = ad spend + fixed costs + points + coupons (Dylan Wright, March 2026)
  const totalSpend = adSpend + fixedCosts + pointsUsed + couponOff
  const now = new Date()
  const targetMonth = new Date(month + '-01')
  const daysInMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate()
  const daysElapsed = month === now.toISOString().slice(0, 7)
    ? now.getDate()
    : daysInMonth

  return {
    period: {
      month: targetMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      daysInMonth,
      daysElapsed,
      asOfDate: now.toISOString().split('T')[0],
    },
    totals: {
      adSpend,
      fixedCosts,
      pointsUsed,
      couponOff,
      totalMarketingSpend: totalSpend,
      spend: totalSpend,
      ...rest,
      otaBookings,
      directGmv,
      otaGmv,
      takeRateRevenue,
    },
    efficiency: {
      // Per Dylan Wright: CPAC and CPB use ALL marketing spend (ads + fixed + points + giveaways)
      cpac: aggregated.accountCreations > 0 ? totalSpend / aggregated.accountCreations : 0,
      cpb: aggregated.bookings > 0 ? totalSpend / aggregated.bookings : 0,
      // DCPB = total marketing spend / direct bookings (Kyle/Drayton, March 2026)
      directCpb: aggregated.directBookings > 0 ? totalSpend / aggregated.directBookings : 0,
      fullyLoadedCpb: aggregated.bookings > 0 ? totalSpend / aggregated.bookings : 0,
      // ROAS = (GMV × 20% blended take rate) / ad spend
      roas: adSpend > 0 ? (aggregated.gmv * BLENDED_TAKE_RATE) / adSpend : 0,
    },
    targets: {
      cpbTarget: CPB_TARGET,
      bookingsTarget: 1000,
    },
    channels: metrics,
    dataFreshness: {
      lastRefresh: new Date().toISOString(),
      latestDataDate: metrics.reduce((max, m) => m.date > max ? m.date : max, ''),
      oldestData: metrics[0]?.lastUpdated ?? new Date().toISOString(),
      nextScheduledRefresh: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    },
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<DashboardSummary>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)
  const { start, end } = getMonthRange(month)

  try {
    // Fetch fixed costs (monthly amounts)
    const serviceClient = createServiceClient()
    const { data: fixedCostsData } = await serviceClient
      .from('fixed_costs')
      .select('monthly_amount')

    // Calculate monthly fixed costs total
    const monthlyFixedCosts = (fixedCostsData || []).reduce(
      (sum, fc) => sum + (Number(fc.monthly_amount) || 0),
      0
    )

    // Check if BigQuery is enabled
    if (!isBigQueryEnabled()) {
      const mockData = getMockDashboardSummary()
      return NextResponse.json<ApiResponse<DashboardSummary>>({ data: mockData })
    }

    // Get cached metrics
    const cachedData = await getCachedMetrics(start, end)

    if (cachedData && cachedData.length > 0) {
      const summary = aggregateToSummary(cachedData, month, monthlyFixedCosts)
      return NextResponse.json<ApiResponse<DashboardSummary>>({ data: summary })
    }

    // Fall back to mock data
    const mockData = getMockDashboardSummary()
    return NextResponse.json<ApiResponse<DashboardSummary>>({ data: mockData })
  } catch (error) {
    console.error('Summary API error:', error)
    const mockData = getMockDashboardSummary()
    return NextResponse.json<ApiResponse<DashboardSummary>>({ data: mockData })
  }
}
