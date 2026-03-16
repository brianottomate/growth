import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isBigQueryEnabled } from '@/lib/bigquery/client'
import { getCachedMetrics } from '@/lib/bigquery/cache'
import { CPB_TARGET, BLENDED_TAKE_RATE, CPB_EXCLUDED_CHANNELS, OTA_CHANNELS } from '@/types'
import type { DashboardSummary, ChannelMetrics } from '@/types'
import { postSlackDigest } from '@/lib/slack/digest'

function buildSummary(
  metrics: ChannelMetrics[],
  month: string,
  fixedCosts: number
): DashboardSummary {
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
      adSpend: 0, accountCreations: 0, checkoutPreviewed: 0, checkoutStarted: 0,
      bookings: 0, directBookings: 0, otaBookings: 0, gmv: 0, directGmv: 0,
      otaGmv: 0, pointsUsed: 0, couponOff: 0, takeRateRevenue: 0,
    }
  )

  const { adSpend, directGmv, otaGmv, takeRateRevenue, otaBookings, pointsUsed, couponOff, ...rest } = aggregated
  const totalSpend = adSpend + fixedCosts + pointsUsed + couponOff

  const now = new Date()
  const targetMonth = new Date(month + '-01')
  const daysInMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate()
  const daysElapsed = month === now.toISOString().slice(0, 7) ? now.getDate() : daysInMonth

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
      cpac: aggregated.accountCreations > 0 ? totalSpend / aggregated.accountCreations : 0,
      cpb: aggregated.bookings > 0 ? totalSpend / aggregated.bookings : 0,
      directCpb: aggregated.directBookings > 0 ? totalSpend / aggregated.directBookings : 0,
      fullyLoadedCpb: aggregated.bookings > 0 ? totalSpend / aggregated.bookings : 0,
      roas: adSpend > 0 ? (aggregated.gmv * BLENDED_TAKE_RATE) / adSpend : 0,
    },
    targets: { cpbTarget: CPB_TARGET, bookingsTarget: 1000 },
    channels: metrics,
    dataFreshness: {
      lastRefresh: new Date().toISOString(),
      latestDataDate: metrics.reduce((max, m) => m.date > max ? m.date : max, ''),
      oldestData: metrics[0]?.lastUpdated ?? new Date().toISOString(),
      nextScheduledRefresh: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    },
  }
}

/**
 * GET /api/digest/cron
 *
 * Posts a daily digest to Slack with current month's KPIs.
 * Protected by CRON_SECRET (same as refresh endpoint).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isBigQueryEnabled()) {
    return NextResponse.json({ error: 'BigQuery not enabled' }, { status: 400 })
  }

  try {
    const now = new Date()
    const month = now.toISOString().slice(0, 7)
    const start = `${month}-01`
    const end = now.toISOString().split('T')[0]!

    // Fetch cached metrics
    const cachedData = await getCachedMetrics(start, end)
    if (!cachedData || cachedData.length === 0) {
      return NextResponse.json({ error: 'No cached data available' }, { status: 404 })
    }

    // Fetch fixed costs
    const serviceClient = createServiceClient()
    const { data: fixedCostsData } = await serviceClient
      .from('fixed_costs')
      .select('monthly_amount')

    const monthlyFixedCosts = (fixedCostsData || []).reduce(
      (sum, fc) => sum + (Number(fc.monthly_amount) || 0),
      0
    )

    // Pro-rate fixed costs for partial month (MTD = day 1 to today)
    const daysElapsed = now.getDate()
    const proRatedFixedCosts = Math.round((monthlyFixedCosts / 30) * daysElapsed)

    const summary = buildSummary(cachedData, month, proRatedFixedCosts)
    const posted = await postSlackDigest(summary)

    return NextResponse.json({
      success: true,
      slackPosted: posted,
      bookings: summary.totals.bookings,
      dcpb: summary.efficiency.directCpb,
    })
  } catch (error) {
    console.error('[Digest] Failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
