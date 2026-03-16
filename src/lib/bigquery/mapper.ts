import type { Channel, ChannelMetrics, MetaInsightRow, GoogleInsightRow } from '@/types'
import { BLENDED_TAKE_RATE, DATA_SOURCE_HIERARCHY } from '@/types'
import type { BigQuerySpendRow, BigQueryConversionRow, BigQueryBookingRow } from './queries'

// Map BigQuery platform names to our Channel type
export const PLATFORM_TO_CHANNEL: Record<string, Channel> = {
  // Meta
  facebook: 'meta',
  instagram: 'meta',
  facebook_ads: 'meta',
  meta: 'meta',

  // Google
  google: 'google',
  google_ads: 'google',
  google_search: 'google',
  youtube: 'google',

  // Other paid
  tiktok: 'tiktok',
  pinterest: 'pinterest',
  bing: 'microsoft',
  microsoft: 'microsoft',
  criteo: 'criteo',

  // Non-paid
  mountain: 'mountain',
  influencer: 'influencer',
  email: 'lifecycle',
  lifecycle: 'lifecycle',
  'customer io': 'lifecycle',
  customerio: 'lifecycle',
  'email action': 'lifecycle',
  newsletter: 'lifecycle',
  iterable: 'lifecycle',
  demand_sales: 'demand_sales',
  direct_mail: 'direct_mail',
  'direct mail': 'direct_mail',
  affiliate: 'affiliate',
  benefithub: 'affiliate',
  seo: 'seo',
  organic: 'organic',
  airbnb: 'airbnb',
  vrbo: 'vrbo',
  booking: 'booking',
  mybookingpal: 'amex',
}

export function mapPlatformToChannel(platform: string): Channel {
  const normalized = platform.toLowerCase().trim()
  return PLATFORM_TO_CHANNEL[normalized] || 'other'
}

export function mapPartnerToChannel(partner: string | null): Channel {
  if (!partner) return 'other'
  const normalized = partner.toLowerCase().trim()
  return PLATFORM_TO_CHANNEL[normalized] || 'other'
}

interface DailyMetrics {
  channel: Channel
  date: string
  spend: number
  clicks: number
  impressions: number
  accountCreations: number
  checkoutStarted: number
  bookings: number
  gmv: number
  takeRateRevenue: number
  pointsUsed: number
  couponOff: number
  directBookings: number
  otaBookings: number
}

/**
 * Normalize date values from BigQuery.
 * BigQuery may return Date objects, BigQueryDate objects ({ value: string }), or strings.
 */
function normalizeDate(date: unknown): string {
  if (typeof date === 'string') {
    return date.includes('T') ? date.split('T')[0]! : date
  }
  if (date instanceof Date) {
    return date.toISOString().split('T')[0]!
  }
  // BigQueryDate objects have a .value property
  if (date && typeof date === 'object' && 'value' in date) {
    return String((date as { value: string }).value)
  }
  return String(date)
}

/**
 * Merge BigQuery + API data into daily per-channel rows.
 *
 * Stores one ChannelMetrics row per (channel, date) — preserving daily granularity.
 * Meta/Google API overrides are applied per day, so days without API data
 * fall back to BigQuery automatically.
 *
 * This replaces the old aggregated approach where all data was collapsed into
 * one row per channel, which caused spend lag when APIs had fewer days than BigQuery.
 */
export function mergeSpendBookingsAndFunnel(
  spendRows: BigQuerySpendRow[],
  bookingRows: BigQueryBookingRow[],
  funnelRows: BigQueryConversionRow[],
  metaInsights: MetaInsightRow[] = [],
  googleInsights: GoogleInsightRow[] = []
): ChannelMetrics[] {
  // Map<"channel|date", DailyMetrics>
  const byKey = new Map<string, DailyMetrics>()

  const getOrCreate = (channel: Channel, date: string): DailyMetrics => {
    const key = `${channel}|${date}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        channel, date,
        spend: 0, clicks: 0, impressions: 0,
        accountCreations: 0, checkoutStarted: 0,
        bookings: 0, gmv: 0,
        takeRateRevenue: 0, pointsUsed: 0, couponOff: 0,
        directBookings: 0, otaBookings: 0,
      })
    }
    return byKey.get(key)!
  }

  // 1. BigQuery spend (daily, per platform)
  for (const row of spendRows) {
    const channel = mapPlatformToChannel(row.platform)
    const date = normalizeDate(row.date)
    const agg = getOrCreate(channel, date)
    agg.spend += row.spend
    agg.clicks += row.clicks
    agg.impressions += row.impressions
  }

  // 2. BigQuery bookings (daily, per channel)
  for (const row of bookingRows) {
    const channel = mapPartnerToChannel(row.channel)
    const date = normalizeDate(row.date)
    const agg = getOrCreate(channel, date)
    agg.bookings += row.bookings
    agg.gmv += row.gmv
    agg.takeRateRevenue += row.take_rate_revenue || 0
    agg.pointsUsed += row.points_used || 0
    agg.couponOff += row.coupon_off || 0
    agg.directBookings += row.direct_bookings || 0
    agg.otaBookings += row.ota_bookings || 0
  }

  // 3. BigQuery funnel events (daily, per channel)
  for (const row of funnelRows) {
    const channel = mapPartnerToChannel(row.channel)
    const date = normalizeDate(row.date)
    const agg = getOrCreate(channel, date)
    if (row.event_type === 'user_signed_up') {
      agg.accountCreations += row.count
    } else if (row.event_type === 'checkout_started') {
      agg.checkoutStarted += row.count
    }
  }

  // 4. Meta API overrides — per day (28d_click + 1d_view, Brooke Hughes March 2026)
  // Only overrides days where Meta API returned data. Days without API data
  // keep BigQuery values, so no spend goes missing due to API lag.
  const metaOverrideDates = new Set<string>()
  for (const meta of metaInsights) {
    const date = normalizeDate(meta.date)
    metaOverrideDates.add(date)
    const agg = getOrCreate('meta', date)
    agg.spend = meta.spend
    agg.clicks = meta.clicks
    agg.impressions = meta.impressions
    agg.bookings = meta.totalBookings
    if (meta.totalPurchaseValue > 0) {
      agg.gmv = meta.totalPurchaseValue
    }
  }

  // 5. Google API overrides — per day (data-driven attribution)
  const googleOverrideDates = new Set<string>()
  for (const google of googleInsights) {
    const date = normalizeDate(google.date)
    googleOverrideDates.add(date)
    const agg = getOrCreate('google', date)
    agg.spend = google.spend
    agg.clicks = google.clicks
    agg.impressions = google.impressions
    agg.bookings = google.conversions
    if (google.conversionsValue > 0) {
      agg.gmv = google.conversionsValue
    }
  }

  // Log override summary
  if (metaOverrideDates.size > 0) {
    const metaTotalSpend = metaInsights.reduce((s, r) => s + r.spend, 0)
    const metaTotalBookings = metaInsights.reduce((s, r) => s + r.totalBookings, 0)
    console.log(`[Mapper] Meta API: ${metaOverrideDates.size} days overridden, $${metaTotalSpend.toFixed(0)} spend, ${metaTotalBookings} bookings (28d_click + 1d_view)`)
  }
  if (googleOverrideDates.size > 0) {
    const googleTotalSpend = googleInsights.reduce((s, r) => s + r.spend, 0)
    const googleTotalConversions = googleInsights.reduce((s, r) => s + r.conversions, 0)
    console.log(`[Mapper] Google API: ${googleOverrideDates.size} days overridden, $${googleTotalSpend.toFixed(0)} spend, ${googleTotalConversions} conversions`)
  }

  // 6. Convert to ChannelMetrics[]
  const result: ChannelMetrics[] = []

  for (const [, entry] of byKey) {
    const isMetaOverridden = entry.channel === 'meta' && metaOverrideDates.has(entry.date)
    const isGoogleOverridden = entry.channel === 'google' && googleOverrideDates.has(entry.date)

    // Determine data source and attribution method
    const hierarchy = DATA_SOURCE_HIERARCHY[entry.channel]
    let dataSource: ChannelMetrics['dataSource'] = 'bigquery'
    let attribution: ChannelMetrics['attribution'] = 'last_click'
    if (isMetaOverridden && hierarchy?.dataSource === 'meta_api') {
      dataSource = hierarchy.dataSource
      attribution = hierarchy.attribution
    } else if (isGoogleOverridden && hierarchy?.dataSource === 'google_api') {
      dataSource = hierarchy.dataSource
      attribution = hierarchy.attribution
    } else if (hierarchy) {
      attribution = hierarchy.attribution
    }

    result.push({
      channel: entry.channel,
      date: entry.date,
      spend: entry.spend,
      clicks: entry.clicks,
      impressions: entry.impressions,
      accountCreations: entry.accountCreations,
      checkoutPreviewed: null,
      checkoutStarted: entry.checkoutStarted,
      bookings: entry.bookings,
      gmv: entry.gmv,
      pointsUsed: entry.pointsUsed,
      couponOff: entry.couponOff,
      takeRateRevenue: entry.takeRateRevenue,
      directBookings: entry.directBookings,
      otaBookings: entry.otaBookings,
      cpac: entry.accountCreations > 0 ? entry.spend / entry.accountCreations : null,
      cpcp: null,
      cpc: entry.checkoutStarted > 0 ? entry.spend / entry.checkoutStarted : null,
      cpb: entry.bookings > 0 ? entry.spend / entry.bookings : null,
      // ROAS = (GMV × 20% blended take rate) / spend (Kyle/Drayton, March 2026)
      roas: entry.spend > 0 ? (entry.gmv * BLENDED_TAKE_RATE) / entry.spend : null,
      dataSource,
      attribution,
      lastUpdated: new Date().toISOString(),
    })
  }

  // Sort by date then by spend descending
  return result.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date)
    if (dateCompare !== 0) return dateCompare
    return (b.spend ?? 0) - (a.spend ?? 0)
  })
}
