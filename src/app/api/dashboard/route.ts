import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getMockDashboardData } from '@/lib/mock-data'
import type { DashboardSummary, ApiResponse, ChannelMetrics, Channel } from '@/types'
import { CPB_TARGET, BLENDED_TAKE_RATE, CPB_EXCLUDED_CHANNELS, OTA_CHANNELS } from '@/types'

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

  // Get query params — supports start/end or days (backward compat)
  const { searchParams } = new URL(request.url)
  const includeFixed = searchParams.get('includeFixed') !== 'false' // default true

  let startDate: Date
  let endDate: Date

  if (searchParams.get('start') && searchParams.get('end')) {
    startDate = new Date(searchParams.get('start')! + 'T00:00:00')
    endDate = new Date(searchParams.get('end')! + 'T23:59:59')
  } else {
    const days = parseInt(searchParams.get('days') || '30', 10)
    endDate = new Date()
    startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
  }

  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

  try {

    // Use service client for data queries (bypasses RLS)
    const serviceClient = createServiceClient()

    // Fetch fixed costs (monthly amounts)
    const { data: fixedCosts } = await serviceClient
      .from('fixed_costs')
      .select('monthly_amount')

    // Calculate monthly fixed costs total
    const monthlyFixedCosts = (fixedCosts || []).reduce(
      (sum, fc) => sum + (Number(fc.monthly_amount) || 0),
      0
    )

    // Pro-rate fixed costs for the selected date range
    // (monthly amount / 30 days * selected days)
    const proRatedFixedCosts = includeFixed
      ? Math.round((monthlyFixedCosts / 30) * days)
      : 0

    // Fetch ALL data with pagination (Supabase default limit is 1000)
    let allSnapshots: ChannelSnapshot[] = []
    let offset = 0
    const pageSize = 1000

    while (true) {
      const { data: snapshots, error: dbError } = await serviceClient
        .from('channel_snapshots')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('channel', { ascending: true })
        .range(offset, offset + pageSize - 1)

      if (dbError) {
        console.error('Database error:', dbError)
        break
      }

      allSnapshots = allSnapshots.concat(snapshots || [])

      if (!snapshots || snapshots.length < pageSize) {
        break
      }
      offset += pageSize
    }

    const snapshots = allSnapshots

    // If we have uploaded data, aggregate and return it
    if (snapshots && snapshots.length > 0) {
      const summary = buildSummaryFromSnapshots(snapshots, days, proRatedFixedCosts)
      return NextResponse.json<ApiResponse<DashboardSummary>>({ data: summary })
    }

    // Fall back to mock data if no uploaded data
    const data = getMockDashboardData()
    return NextResponse.json<ApiResponse<DashboardSummary>>({ data })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json<ApiResponse<DashboardSummary>>(
      { error: { code: 'FETCH_ERROR', message: 'Failed to load dashboard data' } },
      { status: 500 }
    )
  }
}

interface ChannelSnapshot {
  channel: string
  date: string
  spend: number | null
  bookings: number | null
  account_creations: number | null
  checkout_previewed: number | null
  checkout_started: number | null
  gmv: number | null
  take_rate_revenue: number | null
  points_used: number | null
  coupon_off: number | null
  direct_bookings: number | null
  ota_bookings: number | null
  clicks: number | null
  impressions: number | null
  data_source: string
  attribution: string
  synced_at: string
}

function buildSummaryFromSnapshots(
  snapshots: ChannelSnapshot[],
  days: number,
  fixedCosts: number = 0
): DashboardSummary {
  const now = new Date()

  // Aggregate totals - track ad spend separately from fixed costs
  let adSpend = 0
  let directGmv = 0
  let otaGmv = 0
  let takeRateRevenue = 0
  let pointsUsed = 0
  let couponOff = 0
  let directBookingsNative = 0
  let otaBookingsNative = 0
  const totals = {
    adSpend: 0,
    fixedCosts: fixedCosts,
    pointsUsed: 0,
    couponOff: 0,
    totalMarketingSpend: 0,
    spend: 0,
    accountCreations: 0,
    checkoutPreviewed: 0,
    checkoutStarted: 0,
    bookings: 0,
    directBookings: 0,
    otaBookings: 0,
    gmv: 0,
    directGmv: 0,
    otaGmv: 0,
    takeRateRevenue: 0,
  }

  const channelMap = new Map<Channel, {
    spend: number
    bookings: number
    accountCreations: number
    checkoutStarted: number
    gmv: number
    takeRateRevenue: number
    pointsUsed: number
    couponOff: number
    directBookings: number
    otaBookings: number
    clicks: number
    impressions: number
    lastDate: string
    dataSource: string
    attribution: string
  }>()

  for (const snap of snapshots) {
    adSpend += snap.spend || 0
    totals.accountCreations += snap.account_creations || 0
    totals.checkoutPreviewed += snap.checkout_previewed || 0
    totals.checkoutStarted += snap.checkout_started || 0
    totals.bookings += snap.bookings || 0
    totals.gmv += snap.gmv || 0
    takeRateRevenue += snap.take_rate_revenue || 0
    pointsUsed += snap.points_used || 0
    couponOff += snap.coupon_off || 0
    directBookingsNative += snap.direct_bookings || 0
    otaBookingsNative += snap.ota_bookings || 0

    const channel = snap.channel as Channel

    // Track GMV by channel type (OTA vs Direct)
    if (OTA_CHANNELS.includes(channel)) {
      otaGmv += snap.gmv || 0
    } else {
      directGmv += snap.gmv || 0
    }

    // Track direct bookings — prefer native is_direct_booking flag from bookings_reconciled_v2
    // Fall back to channel-based exclusion if native flags aren't populated
    if (!CPB_EXCLUDED_CHANNELS.includes(channel)) {
      totals.directBookings += snap.bookings || 0
    }

    // Aggregate by channel for channels array
    const existing = channelMap.get(channel) || {
      spend: 0,
      bookings: 0,
      accountCreations: 0,
      checkoutStarted: 0,
      gmv: 0,
      takeRateRevenue: 0,
      pointsUsed: 0,
      couponOff: 0,
      directBookings: 0,
      otaBookings: 0,
      clicks: 0,
      impressions: 0,
      lastDate: snap.date,
      dataSource: snap.data_source,
      attribution: snap.attribution,
    }

    existing.spend += snap.spend || 0
    existing.bookings += snap.bookings || 0
    existing.accountCreations += snap.account_creations || 0
    existing.checkoutStarted += snap.checkout_started || 0
    existing.gmv += snap.gmv || 0
    existing.takeRateRevenue += snap.take_rate_revenue || 0
    existing.pointsUsed += snap.points_used || 0
    existing.couponOff += snap.coupon_off || 0
    existing.directBookings += snap.direct_bookings || 0
    existing.otaBookings += snap.ota_bookings || 0
    existing.clicks += snap.clicks || 0
    existing.impressions += snap.impressions || 0

    if (snap.date > existing.lastDate) {
      existing.lastDate = snap.date
    }

    channelMap.set(channel, existing)
  }

  // Set final totals
  totals.adSpend = adSpend
  totals.pointsUsed = pointsUsed
  totals.couponOff = couponOff
  totals.takeRateRevenue = takeRateRevenue
  totals.directGmv = directGmv
  totals.otaGmv = otaGmv
  totals.otaBookings = otaBookingsNative

  // Use native direct booking count if available, otherwise keep channel-based calculation
  if (directBookingsNative > 0) {
    totals.directBookings = directBookingsNative
  }

  // Total marketing spend = ad spend + fixed costs + points + coupons (Dylan Wright, March 2026)
  const totalMarketingSpend = adSpend + fixedCosts + pointsUsed + couponOff
  totals.totalMarketingSpend = totalMarketingSpend
  totals.spend = totalMarketingSpend

  // Efficiency metrics — Kyle/Drayton methodology (March 2026)
  // DCPB = total marketing spend / direct bookings (PRIMARY metric, $500 target)
  // CPB = total marketing spend / total bookings
  // CPAC = total marketing spend / account creations
  // ROAS = (GMV × 20% blended take rate) / ad spend
  const efficiency = {
    cpac: totals.accountCreations > 0 ? totalMarketingSpend / totals.accountCreations : 0,
    cpb: totals.bookings > 0 ? totalMarketingSpend / totals.bookings : 0,
    directCpb: totals.directBookings > 0 ? totalMarketingSpend / totals.directBookings : 0,
    fullyLoadedCpb: totals.bookings > 0 ? totalMarketingSpend / totals.bookings : 0,
    roas: adSpend > 0 ? (totals.gmv * BLENDED_TAKE_RATE) / adSpend : 0,
  }

  // Build channels array
  const channels: ChannelMetrics[] = []
  channelMap.forEach((agg, channel) => {
    channels.push({
      channel,
      date: agg.lastDate,
      spend: agg.spend,
      bookings: agg.bookings,
      accountCreations: agg.accountCreations,
      checkoutPreviewed: null,
      checkoutStarted: agg.checkoutStarted,
      gmv: agg.gmv,
      pointsUsed: agg.pointsUsed || null,
      couponOff: agg.couponOff || null,
      takeRateRevenue: agg.takeRateRevenue || null,
      directBookings: agg.directBookings || null,
      otaBookings: agg.otaBookings || null,
      clicks: agg.clicks || null,
      impressions: agg.impressions || null,
      cpac: agg.accountCreations > 0 ? agg.spend / agg.accountCreations : null,
      cpcp: null,
      cpc: agg.checkoutStarted > 0 ? agg.spend / agg.checkoutStarted : null,
      cpb: agg.bookings > 0 ? agg.spend / agg.bookings : null,
      roas: agg.spend > 0 ? (agg.gmv * BLENDED_TAKE_RATE) / agg.spend : null,
      dataSource: agg.dataSource as 'bigquery' | 'meta_api' | 'fixed_cost' | 'manual',
      attribution: agg.attribution as 'first_partner' | 'view_click' | 'data_driven' | 'last_click',
      lastUpdated: new Date().toISOString(),
    })
  })

  // Sort channels by spend
  channels.sort((a, b) => (b.spend || 0) - (a.spend || 0))

  // Get date range for period
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  // Find the most recent date with data (across all channels)
  const latestDataDate = snapshots.reduce((max, snap) => {
    if (snap.date > max) return snap.date
    return max
  }, '')

  return {
    period: {
      month: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      daysInMonth: days,
      daysElapsed: days,
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
      lastRefresh: new Date().toISOString(),
      latestDataDate: latestDataDate || now.toISOString().split('T')[0],
      oldestData: startDate.toISOString(),
      nextScheduledRefresh: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
    },
  }
}
