/**
 * Fetch Meta Ads insights by date range.
 * Ported from meta-tester's cpb-service.js / meta-ads.js pattern.
 *
 * Uses account-level insights with time_increment=1 for daily breakdown.
 * Requests all 3 attribution windows so we can sum 28d_click + 1d_view.
 */

import * as bizSdk from 'facebook-nodejs-business-sdk'
import { getMetaAdAccount } from './client'
import { withRateLimit, retryMetaAPICall } from './retry'
import { getBookingsFromActions, getPurchaseValueFromActions, STANDARD_ATTRIBUTION_WINDOWS } from './bookings'
import type { MetaInsightRow } from '@/types'

const AdsInsights = bizSdk.AdsInsights

interface MetaActionEntry {
  action_type: string
  value?: string
  '7d_click'?: string
  '1d_view'?: string
  '28d_click'?: string
  [key: string]: string | undefined
}

interface MetaInsightResponse {
  date_start: string
  date_stop: string
  spend: string
  clicks: string
  impressions: string
  actions?: MetaActionEntry[]
  action_values?: MetaActionEntry[]
}

/**
 * Fetch Meta account-level insights with daily breakdown.
 * Returns one MetaInsightRow per day in the date range.
 */
export async function fetchMetaInsights(
  startDate: string,
  endDate: string
): Promise<MetaInsightRow[]> {
  const account = getMetaAdAccount()

  const insights = await withRateLimit(async () => {
    return await retryMetaAPICall(
      async () => {
        const fields = [
          AdsInsights.Fields.spend,
          AdsInsights.Fields.clicks,
          AdsInsights.Fields.impressions,
          AdsInsights.Fields.actions,
          AdsInsights.Fields.action_values,
          AdsInsights.Fields.date_start,
          AdsInsights.Fields.date_stop,
        ]

        const params = {
          level: 'account',
          time_range: { since: startDate, until: endDate },
          time_increment: 1, // Daily breakdown
          action_attribution_windows: [...STANDARD_ATTRIBUTION_WINDOWS],
        }

        return await account.getInsights(fields, params)
      },
      { operation: `fetchMetaInsights(${startDate} → ${endDate})` }
    )
  })

  if (!insights || insights.length === 0) {
    console.log('[Meta API] No insights data for date range')
    return []
  }

  // Map each day's response to a MetaInsightRow
  const rows: MetaInsightRow[] = insights.map((row: MetaInsightResponse) => {
    const actions = row.actions || null
    const actionValues = row.action_values || null
    const bookings28dClick = getBookingsFromActions(actions, '28d_click')
    const bookings1dView = getBookingsFromActions(actions, '1d_view')
    const purchaseValue28dClick = getPurchaseValueFromActions(actionValues, '28d_click')
    const purchaseValue1dView = getPurchaseValueFromActions(actionValues, '1d_view')

    return {
      date: row.date_start,
      spend: parseFloat(row.spend) || 0,
      clicks: parseInt(row.clicks) || 0,
      impressions: parseInt(row.impressions) || 0,
      bookings28dClick,
      bookings1dView,
      totalBookings: bookings28dClick + bookings1dView,
      purchaseValue28dClick,
      purchaseValue1dView,
      totalPurchaseValue: purchaseValue28dClick + purchaseValue1dView,
    }
  })

  const totalBookings = rows.reduce((sum, r) => sum + r.totalBookings, 0)
  const totalSpend = rows.reduce((sum, r) => sum + r.spend, 0)
  const totalPurchaseValue = rows.reduce((sum, r) => sum + r.totalPurchaseValue, 0)
  console.log(`[Meta API] ${rows.length} days, ${totalBookings} bookings, $${totalPurchaseValue.toFixed(0)} purchase value, $${totalSpend.toFixed(0)} spend`)

  return rows
}

/**
 * Aggregate Meta insight rows into a single summary for a date range.
 * Used to produce one merged row for the mapper.
 */
export function aggregateMetaInsights(rows: MetaInsightRow[]): MetaInsightRow | null {
  if (rows.length === 0) return null

  // Use the last date in the range as the representative date
  const sortedDates = rows.map((r) => r.date).sort()
  const lastDate = sortedDates[sortedDates.length - 1]!

  return {
    date: lastDate,
    spend: rows.reduce((sum, r) => sum + r.spend, 0),
    clicks: rows.reduce((sum, r) => sum + r.clicks, 0),
    impressions: rows.reduce((sum, r) => sum + r.impressions, 0),
    bookings28dClick: rows.reduce((sum, r) => sum + r.bookings28dClick, 0),
    bookings1dView: rows.reduce((sum, r) => sum + r.bookings1dView, 0),
    totalBookings: rows.reduce((sum, r) => sum + r.totalBookings, 0),
    purchaseValue28dClick: rows.reduce((sum, r) => sum + r.purchaseValue28dClick, 0),
    purchaseValue1dView: rows.reduce((sum, r) => sum + r.purchaseValue1dView, 0),
    totalPurchaseValue: rows.reduce((sum, r) => sum + r.totalPurchaseValue, 0),
  }
}
