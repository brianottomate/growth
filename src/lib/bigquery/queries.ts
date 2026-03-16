import { getBigQueryClient, isBigQueryEnabled } from './client'

export interface BigQuerySpendRow {
  date: string
  platform: string
  spend: number
  clicks: number
  impressions: number
}

export interface BigQueryConversionRow {
  date: string
  channel: string
  event_type: 'user_signed_up' | 'checkout_started'
  count: number
}

export interface BigQueryBookingRow {
  date: string
  channel: string
  bookings: number
  gmv: number
  take_rate_revenue: number
  points_used: number
  coupon_off: number
  direct_bookings: number
  ota_bookings: number
}

const SPEND_QUERY = `
SELECT
  dt as date,
  platform,
  SUM(spend) as spend,
  SUM(clicks) as clicks,
  SUM(impressions) as impressions
FROM \`wander-9fc9c.analytics.marketing_adnetwork_daily_report\`
WHERE dt BETWEEN @start_date AND @end_date
GROUP BY dt, platform
ORDER BY dt, platform
`

// Dylan Wright review (March 2026): switched from bookings_gmv to bookings_reconciled_v2
// - booking_revenue_recognized = take rate revenue (for ROAS)
// - points_used + coupon_off = additional marketing spend
// - is_direct_booking / is_ota = native flags (no channel mapping needed)
//
// Attribution note (Brooke Hughes, March 2026):
// - This query uses last_touch for all channels via funnel_events_attribution
// - Meta should use 30d click / 1d view from Meta's API instead
// - TODO: Pull Meta bookings from Meta Ads API when integration is built
const BOOKINGS_QUERY = `
SELECT
  DATE(b.ts_created) as date,
  COALESCE(f.partner, 'other') as channel,
  COUNT(DISTINCT b.id_booking) as bookings,
  SUM(b.total_paid) as gmv,
  SUM(b.booking_revenue_recognized) as take_rate_revenue,
  SUM(b.points_used) as points_used,
  SUM(b.coupon_off) as coupon_off,
  COUNTIF(b.is_direct_booking = TRUE) as direct_bookings,
  COUNTIF(b.is_ota = TRUE) as ota_bookings
FROM \`wander-9fc9c.analytics.bookings_reconciled_v2\` b
LEFT JOIN \`wander-9fc9c.analytics.funnel_events_attribution\` f
  ON b.id_booking = f.id_booking
  AND f.event_type = 'purchased'
  AND f.attribution_model = 'last_touch'
WHERE b.is_profit = TRUE
  AND b.status = 'confirmed'
  AND DATE(b.ts_created) BETWEEN @start_date AND @end_date
GROUP BY date, channel
ORDER BY date, channel
`

const FUNNEL_QUERY = `
SELECT
  DATE(ts) as date,
  partner as channel,
  event_type,
  COUNT(*) as count
FROM \`wander-9fc9c.analytics.funnel_events_attribution\`
WHERE event_type IN ('user_signed_up', 'checkout_started')
  AND DATE(ts) BETWEEN @start_date AND @end_date
GROUP BY date, partner, event_type
ORDER BY date, partner
`

export async function fetchSpendData(
  startDate: string,
  endDate: string
): Promise<BigQuerySpendRow[]> {
  if (!isBigQueryEnabled()) {
    throw new Error('BigQuery is not enabled')
  }

  const client = getBigQueryClient()

  const options = {
    query: SPEND_QUERY,
    params: {
      start_date: startDate,
      end_date: endDate,
    },
  }

  const [rows] = await client.query(options)
  return rows as BigQuerySpendRow[]
}

export async function fetchBookingData(
  startDate: string,
  endDate: string
): Promise<BigQueryBookingRow[]> {
  if (!isBigQueryEnabled()) {
    throw new Error('BigQuery is not enabled')
  }

  const client = getBigQueryClient()

  const options = {
    query: BOOKINGS_QUERY,
    params: {
      start_date: startDate,
      end_date: endDate,
    },
  }

  const [rows] = await client.query(options)
  return rows as BigQueryBookingRow[]
}

export async function fetchFunnelData(
  startDate: string,
  endDate: string
): Promise<BigQueryConversionRow[]> {
  if (!isBigQueryEnabled()) {
    throw new Error('BigQuery is not enabled')
  }

  const client = getBigQueryClient()

  const options = {
    query: FUNNEL_QUERY,
    params: {
      start_date: startDate,
      end_date: endDate,
    },
  }

  const [rows] = await client.query(options)
  return rows as BigQueryConversionRow[]
}
