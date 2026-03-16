import { NextResponse } from 'next/server'
import { isBigQueryEnabled } from '@/lib/bigquery/client'
import { fetchSpendData, fetchBookingData, fetchFunnelData } from '@/lib/bigquery/queries'
import { mergeSpendBookingsAndFunnel } from '@/lib/bigquery/mapper'
import { cacheMetrics, invalidateCache } from '@/lib/bigquery/cache'
import { isMetaEnabled } from '@/lib/meta/client'
import { fetchMetaInsights } from '@/lib/meta/queries'
import { isGoogleEnabled } from '@/lib/google-ads/client'
import { fetchGoogleInsights } from '@/lib/google-ads/queries'
import type { MetaInsightRow, GoogleInsightRow } from '@/types'

/**
 * GET /api/refresh/cron
 *
 * Scheduled refresh endpoint. Protected by CRON_SECRET header (no Supabase auth).
 * Hit this from cron-job.org, GitHub Actions, or any scheduler.
 *
 * Schedule: twice daily (8 AM ET, 2 PM ET)
 */
export async function GET(request: Request) {
  // Verify cron secret
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

  const startedAt = Date.now()

  try {
    // Default to current month
    const now = new Date()
    const end = now.toISOString().split('T')[0]!
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    console.log(`[Cron] Refreshing data: ${start} → ${end}`)

    await invalidateCache(start, end)

    const metaEnabled = isMetaEnabled()
    const googleEnabled = isGoogleEnabled()

    const [spendData, bookingData, funnelData, metaInsights, googleInsights] = await Promise.all([
      fetchSpendData(start, end),
      fetchBookingData(start, end),
      fetchFunnelData(start, end),
      metaEnabled
        ? fetchMetaInsights(start, end).catch((err: Error) => {
            console.error(`[Cron] Meta API failed: ${err.message}`)
            return [] as MetaInsightRow[]
          })
        : Promise.resolve([] as MetaInsightRow[]),
      googleEnabled
        ? fetchGoogleInsights(start, end).catch((err: Error) => {
            console.error(`[Cron] Google Ads API failed: ${err.message}`)
            return [] as GoogleInsightRow[]
          })
        : Promise.resolve([] as GoogleInsightRow[]),
    ])

    // Merge into daily per-channel rows (APIs override BigQuery per day, not aggregated)
    const metrics = mergeSpendBookingsAndFunnel(spendData, bookingData, funnelData, metaInsights, googleInsights)

    await cacheMetrics(metrics)

    const durationMs = Date.now() - startedAt
    const apis = [metaInsights.length > 0 && 'Meta', googleInsights.length > 0 && 'Google'].filter(Boolean).join(', ')
    console.log(`[Cron] Done: ${metrics.length} channels, ${durationMs}ms${apis ? `, APIs: ${apis}` : ''}`)

    return NextResponse.json({
      success: true,
      channels: metrics.length,
      metaApiUsed: metaInsights.length > 0,
      googleApiUsed: googleInsights.length > 0,
      durationMs,
    })
  } catch (error) {
    console.error('[Cron] Refresh failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
