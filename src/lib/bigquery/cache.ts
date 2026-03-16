import { createServiceClient } from '@/lib/supabase/server'
import type { ChannelMetrics } from '@/types'
import { getBigQueryConfig } from './client'

export async function getCachedMetrics(
  startDate: string,
  endDate: string
): Promise<ChannelMetrics[] | null> {
  const supabase = createServiceClient()
  const config = getBigQueryConfig()

  const { data, error } = await supabase
    .from('channel_snapshots')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .in('data_source', ['bigquery', 'meta_api', 'google_api'])

  if (error || !data || data.length === 0) {
    return null
  }

  // Check if cache is still valid
  const oldestRecord = data[0]
  const cachedAt = new Date(oldestRecord.last_updated || oldestRecord.created_at)
  const now = new Date()
  const ageSeconds = (now.getTime() - cachedAt.getTime()) / 1000

  if (ageSeconds > config.cacheTTL) {
    return null // Cache expired
  }

  // Transform database rows to ChannelMetrics
  return data.map((row) => ({
    channel: row.channel,
    date: row.date,
    spend: row.spend,
    clicks: row.clicks,
    impressions: row.impressions,
    accountCreations: row.account_creations,
    checkoutPreviewed: row.checkout_previewed,
    checkoutStarted: row.checkout_started,
    bookings: row.bookings,
    gmv: row.gmv,
    pointsUsed: row.points_used,
    couponOff: row.coupon_off,
    takeRateRevenue: row.take_rate_revenue,
    directBookings: row.direct_bookings,
    otaBookings: row.ota_bookings,
    cpac: row.cpac,
    cpcp: row.cpcp,
    cpc: row.cpc,
    cpb: row.cpb,
    roas: row.roas,
    dataSource: row.data_source,
    attribution: row.attribution,
    lastUpdated: row.last_updated,
  }))
}

export async function cacheMetrics(metrics: ChannelMetrics[]): Promise<void> {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // Transform all metrics into DB rows
  const rows = metrics.map((metric) => ({
    channel: metric.channel,
    date: metric.date,
    spend: metric.spend,
    clicks: metric.clicks,
    impressions: metric.impressions,
    account_creations: metric.accountCreations,
    checkout_previewed: metric.checkoutPreviewed,
    checkout_started: metric.checkoutStarted,
    bookings: metric.bookings,
    gmv: metric.gmv,
    points_used: metric.pointsUsed,
    coupon_off: metric.couponOff,
    take_rate_revenue: metric.takeRateRevenue,
    direct_bookings: metric.directBookings,
    ota_bookings: metric.otaBookings,
    cpac: metric.cpac,
    cpcp: metric.cpcp,
    cpc: metric.cpc,
    cpb: metric.cpb,
    roas: metric.roas,
    data_source: metric.dataSource,
    attribution: metric.attribution,
    last_updated: now,
  }))

  // Batch upsert in chunks of 500 (Supabase limit)
  const BATCH_SIZE = 500
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('channel_snapshots')
      .upsert(batch, { onConflict: 'channel,date' })

    if (error) {
      console.error(`[Cache] Batch upsert failed (rows ${i}-${i + batch.length}):`, error.message)
    }
  }
}

export async function invalidateCache(
  startDate: string,
  endDate: string
): Promise<void> {
  const supabase = createServiceClient()

  await supabase
    .from('channel_snapshots')
    .delete()
    .gte('date', startDate)
    .lte('date', endDate)
}
