/**
 * Google Ads API queries.
 * Mirrors the Meta API queries pattern (src/lib/meta/queries.ts).
 *
 * Uses GAQL (Google Ads Query Language) for account-level insights
 * with daily breakdown. Attribution is data-driven (Google's default).
 */

import { getGoogleCustomer } from './client'
import pRetry, { AbortError } from 'p-retry'
import type { GoogleInsightRow } from '@/types'

// Google Ads API error codes that are retryable
const RETRYABLE_ERROR_CODES = [
  'INTERNAL_ERROR',
  'TRANSIENT_ERROR',
  'RESOURCE_EXHAUSTED',
  'DEADLINE_EXCEEDED',
]

function isRetryableError(error: Error & { code?: string }): boolean {
  if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) return true
  if (error.message?.includes('ECONNRESET') || error.message?.includes('ETIMEDOUT')) return true
  return false
}

/**
 * Retry wrapper for Google Ads API calls.
 * Simpler than Meta's — Google has generous rate limits (15K+ ops/day).
 */
async function retryGoogleCall<T>(
  fn: () => Promise<T>,
  operation: string
): Promise<T> {
  return pRetry(
    async (attemptNumber) => {
      try {
        return await fn()
      } catch (error) {
        const err = error as Error & { code?: string }
        console.log(`[Google Ads Retry ${attemptNumber}/4] ${operation}: ${err.message}`)

        if (!isRetryableError(err)) {
          throw new AbortError(err.message)
        }
        throw error
      }
    },
    {
      retries: 3,
      minTimeout: 2000,
      maxTimeout: 16000,
      onFailedAttempt: (error) => {
        if (error.attemptNumber === 4) {
          console.error(`[Google Ads] ${operation} failed after 4 attempts`)
        }
      },
    }
  )
}

// The Purchase conversion action is a secondary goal in Google Ads,
// so we must use metrics.all_conversions and filter by action name.
const PURCHASE_ACTION_NAME = 'Wander - GTM - Purchase - Web Production - Client-side - Account Level - 10.9.25'

/**
 * Fetch Google Ads account-level insights with daily breakdown.
 * Spend/clicks/impressions come from account-level query.
 * Bookings (conversions) come from Purchase action only via all_conversions.
 */
export async function fetchGoogleInsights(
  startDate: string,
  endDate: string
): Promise<GoogleInsightRow[]> {
  const customer = getGoogleCustomer()

  // Query 1: Spend, clicks, impressions (account level)
  const spendResults = await retryGoogleCall(async () => {
    return await customer.query(`
      SELECT
        segments.date,
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions
      FROM customer
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `)
  }, `fetchGoogleInsights:spend(${startDate} → ${endDate})`)

  // Query 2: Purchase conversions only (secondary action, use all_conversions)
  const purchaseResults = await retryGoogleCall(async () => {
    return await customer.query(`
      SELECT
        segments.date,
        segments.conversion_action_name,
        metrics.all_conversions,
        metrics.all_conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
        AND segments.conversion_action_name = '${PURCHASE_ACTION_NAME}'
    `)
  }, `fetchGoogleInsights:purchases(${startDate} → ${endDate})`)

  if (!spendResults || spendResults.length === 0) {
    console.log('[Google Ads] No insights data for date range')
    return []
  }

  // Build a map of date → purchase conversions
  const purchasesByDate = new Map<string, { conversions: number; value: number }>()
  for (const row of purchaseResults ?? []) {
    const date = row.segments?.date
    if (date) {
      purchasesByDate.set(date, {
        conversions: Math.round(row.metrics?.all_conversions ?? 0),
        value: row.metrics?.all_conversions_value ?? 0,
      })
    }
  }

  const rows: GoogleInsightRow[] = spendResults.map((row) => {
    const date = row.segments?.date ?? startDate
    const purchases = purchasesByDate.get(date)
    return {
      date,
      spend: (row.metrics?.cost_micros ?? 0) / 1_000_000,
      clicks: row.metrics?.clicks ?? 0,
      impressions: row.metrics?.impressions ?? 0,
      conversions: purchases?.conversions ?? 0,
      conversionsValue: purchases?.value ?? 0,
    }
  })

  const totalConversions = rows.reduce((sum, r) => sum + r.conversions, 0)
  const totalSpend = rows.reduce((sum, r) => sum + r.spend, 0)
  console.log(`[Google Ads] ${rows.length} days, ${totalConversions} purchases, $${totalSpend.toFixed(0)} spend`)

  return rows
}

/**
 * Aggregate Google insight rows into a single summary for a date range.
 * Used to produce one merged row for the mapper.
 */
export function aggregateGoogleInsights(rows: GoogleInsightRow[]): GoogleInsightRow | null {
  if (rows.length === 0) return null

  const sortedDates = rows.map((r) => r.date).sort()
  const lastDate = sortedDates[sortedDates.length - 1]!

  return {
    date: lastDate,
    spend: rows.reduce((sum, r) => sum + r.spend, 0),
    clicks: rows.reduce((sum, r) => sum + r.clicks, 0),
    impressions: rows.reduce((sum, r) => sum + r.impressions, 0),
    conversions: rows.reduce((sum, r) => sum + r.conversions, 0),
    conversionsValue: rows.reduce((sum, r) => sum + r.conversionsValue, 0),
  }
}
