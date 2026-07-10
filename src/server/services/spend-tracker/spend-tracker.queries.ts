import "server-only";

import { executeQuery } from "@/server/clients/bigquery.client";

/**
 * Spend Tracker — the six BigQuery queries, ported VERBATIM from Brian's
 * wander-growth-tracker (`src/lib/bigquery/queries.ts`). Each carries a
 * locked methodology decision — see GROWTH_TRACKER_CONTEXT.md §12/§13.
 * Do not "improve" the SQL; a subtle change silently changes a reported number.
 */

// -----------------------------------------------------------------------------
// Row types (BigQuery may return DATE columns as { value: "YYYY-MM-DD" })
// -----------------------------------------------------------------------------

export type BQDate = string | { value: string };

export interface BigQuerySpendRow {
  date: BQDate;
  platform: string;
  spend: number;
  clicks: number;
  impressions: number;
}

export interface BigQueryBookingRow {
  date: BQDate;
  channel: string | null;
  bookings: number;
  gmv: number;
  take_rate_revenue: number | null;
  points_used: number | null;
  coupon_off: number | null;
  direct_bookings: number | null;
  ota_bookings: number | null;
}

export interface BigQueryConversionRow {
  date: BQDate;
  channel: string | null;
  event_type: string;
  count: number;
}

export interface BigQueryNorthStarRow {
  dt: BQDate;
  gross_take: number | null;
  net_take: number | null;
  direct_gmv: number | null;
  total_gmv: number | null;
  total_marketing_spend: number | null;
  direct_confirmed_booking_count: number | null;
  engaged_sessions: number | null;
}

export interface BigQueryTrueTotalsRow {
  total_confirmed_profit: number;
  wander_direct: number;
  manual_profit: number;
  ota_confirmed_profit: number;
}

export interface BigQueryDylanGmvRow {
  total_gmv: number | null;
  direct_gmv: number | null;
}

// -----------------------------------------------------------------------------
// 1. SPEND — pixel-aggregated daily ad-network spend per platform.
//    NOTE: no account_id column — aggregates ALL Wander ad accounts per
//    platform. Meta rows are skipped in the merge (single-account Meta API is
//    authoritative); Google/Pinterest/etc. use this as their spend source (v1).
// -----------------------------------------------------------------------------

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
`;

export async function fetchSpendData(
  startDate: string,
  endDate: string,
): Promise<BigQuerySpendRow[]> {
  return executeQuery<BigQuerySpendRow>(SPEND_QUERY, {
    start_date: startDate,
    end_date: endDate,
  });
}

// -----------------------------------------------------------------------------
// 2. BOOKINGS — per-channel breakdowns (Decision #2 / #12.3).
//    bookings_reconciled_v2 ⋈ funnel_events_attribution, last_touch ONLY
//    (Decision #12.7 — without the filter u_shaped rows explode ~5.5×).
//    Top-line totals come from TRUE_TOTALS, not from summing this.
// -----------------------------------------------------------------------------

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
`;

export async function fetchBookingData(
  startDate: string,
  endDate: string,
): Promise<BigQueryBookingRow[]> {
  return executeQuery<BigQueryBookingRow>(BOOKINGS_QUERY, {
    start_date: startDate,
    end_date: endDate,
  });
}

// -----------------------------------------------------------------------------
// 3. FUNNEL — signups + checkouts, last_touch ONLY (Decision #12.7).
// -----------------------------------------------------------------------------

const FUNNEL_QUERY = `
SELECT
  DATE(ts) as date,
  partner as channel,
  event_type,
  COUNT(*) as count
FROM \`wander-9fc9c.analytics.funnel_events_attribution\`
WHERE event_type IN ('user_signed_up', 'checkout_started')
  AND attribution_model = 'last_touch'
  AND DATE(ts) BETWEEN @start_date AND @end_date
GROUP BY date, partner, event_type
ORDER BY date, partner
`;

export async function fetchFunnelData(
  startDate: string,
  endDate: string,
): Promise<BigQueryConversionRow[]> {
  return executeQuery<BigQueryConversionRow>(FUNNEL_QUERY, {
    start_date: startDate,
    end_date: endDate,
  });
}

// -----------------------------------------------------------------------------
// 4. NORTH STAR — dbt model (Joao Victor). gross_take is authoritative;
//    net_take/total_marketing_spend are NOT used (dbt only sees paid-ad-network
//    spend — Decision #9b killed the 1.70× multiplier; we compute net take as
//    gross_take − our complete spend).
// -----------------------------------------------------------------------------

const NORTH_STAR_QUERY = `
SELECT
  dt,
  gross_take,
  net_take,
  direct_gmv,
  total_gmv,
  total_marketing_spend,
  direct_confirmed_booking_count,
  engaged_sessions
FROM \`wander-9fc9c.analytics.north_star_metrics\`
WHERE dt BETWEEN @start_date AND @end_date
ORDER BY dt
`;

export async function fetchNorthStarData(
  startDate: string,
  endDate: string,
): Promise<BigQueryNorthStarRow[]> {
  return executeQuery<BigQueryNorthStarRow>(NORTH_STAR_QUERY, {
    start_date: startDate,
    end_date: endDate,
  });
}

// -----------------------------------------------------------------------------
// 5. TRUE TOTALS — top-line KPI bookings (Decision #9g, revises #9f).
//    analytics.bookings (raw mart); ts_confirmed IS NOT NULL (Kyle's "we don't
//    net cancellations"); Sites excluded via NOT is_wander_saas.
// -----------------------------------------------------------------------------

const TRUE_TOTALS_QUERY = `
SELECT
  COUNTIF(is_profit AND ts_confirmed IS NOT NULL AND NOT COALESCE(is_wander_saas, FALSE)) AS total_confirmed_profit,
  COUNTIF(is_direct_booking AND is_profit AND ts_confirmed IS NOT NULL AND NOT COALESCE(is_wander_saas, FALSE)) AS wander_direct,
  COUNTIF(is_manual_booking AND is_profit AND ts_confirmed IS NOT NULL AND NOT COALESCE(is_wander_saas, FALSE)) AS manual_profit,
  COUNTIF(is_ota AND is_profit AND ts_confirmed IS NOT NULL AND NOT COALESCE(is_wander_saas, FALSE)) AS ota_confirmed_profit
FROM \`wander-9fc9c.analytics.bookings\`
WHERE DATE(ts_created) BETWEEN @start_date AND @end_date
`;

export async function fetchTrueTotals(
  startDate: string,
  endDate: string,
): Promise<BigQueryTrueTotalsRow | null> {
  const rows = await executeQuery<BigQueryTrueTotalsRow>(TRUE_TOTALS_QUERY, {
    start_date: startDate,
    end_date: endDate,
  });
  return rows[0] ?? null;
}

// -----------------------------------------------------------------------------
// 6. DYLAN GMV — top-line GMV (Decision #9h, Dylan Wright canonical 2026-05-28).
//    analytics.report_gmv; no status filter (includes cancelled — intentional);
//    "direct" = ota_source IS NULL; Sites revenue origins excluded.
// -----------------------------------------------------------------------------

const DYLAN_GMV_QUERY = `
SELECT
  SUM(gmv) AS total_gmv,
  SUM(IF(ota_source IS NULL, gmv, 0)) AS direct_gmv
FROM \`wander-9fc9c.analytics.report_gmv\`
WHERE revenue_origin NOT IN ('sites_early_deposit','wander_sites','sites_subscription')
  AND DATE(ts_created) BETWEEN @start_date AND @end_date
`;

export async function fetchDylanGmv(
  startDate: string,
  endDate: string,
): Promise<BigQueryDylanGmvRow | null> {
  const rows = await executeQuery<BigQueryDylanGmvRow>(DYLAN_GMV_QUERY, {
    start_date: startDate,
    end_date: endDate,
  });
  return rows[0] ?? null;
}
