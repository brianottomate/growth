import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getMockChannelMetrics } from '@/lib/mock-data'
import { BLENDED_TAKE_RATE } from '@/types'
import type { ChannelMetrics, ApiResponse, Channel } from '@/types'

export async function GET(request: Request) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<ChannelMetrics[]>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  // Get date range from query params — supports start/end or days (backward compat)
  const { searchParams } = new URL(request.url)

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

  try {

    // Use service client for data queries (bypasses RLS)
    const serviceClient = createServiceClient()

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
      const channelAggregates = aggregateByChannel(snapshots)
      return NextResponse.json<ApiResponse<ChannelMetrics[]>>({ data: channelAggregates })
    }

    // Fall back to mock data if no uploaded data
    const data = getMockChannelMetrics()
    return NextResponse.json<ApiResponse<ChannelMetrics[]>>({ data })
  } catch (error) {
    console.error('Channels API error:', error)
    return NextResponse.json<ApiResponse<ChannelMetrics[]>>(
      { error: { code: 'FETCH_ERROR', message: 'Failed to load channel data' } },
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

function aggregateByChannel(snapshots: ChannelSnapshot[]): ChannelMetrics[] {
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
    const channel = snap.channel as Channel
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

  const metrics: ChannelMetrics[] = []
  channelMap.forEach((agg, channel) => {
    metrics.push({
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

  // Sort by spend descending
  metrics.sort((a, b) => (b.spend || 0) - (a.spend || 0))

  return metrics
}
