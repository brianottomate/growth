import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isBigQueryEnabled } from '@/lib/bigquery/client'
import { fetchSpendData, fetchBookingData, fetchFunnelData } from '@/lib/bigquery/queries'
import { mergeSpendBookingsAndFunnel } from '@/lib/bigquery/mapper'
import { cacheMetrics, invalidateCache } from '@/lib/bigquery/cache'
import { isMetaEnabled } from '@/lib/meta/client'
import { fetchMetaInsights } from '@/lib/meta/queries'
import { isGoogleEnabled } from '@/lib/google-ads/client'
import { fetchGoogleInsights } from '@/lib/google-ads/queries'
import type { SyncLog, ApiResponse, MetaInsightRow, GoogleInsightRow } from '@/types'

interface RefreshResponse {
  success: boolean
  syncLog: SyncLog
  message: string
}

export async function POST(request: Request) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<RefreshResponse>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  if (!isBigQueryEnabled()) {
    return NextResponse.json<ApiResponse<RefreshResponse>>(
      { error: { code: 'BIGQUERY_DISABLED', message: 'BigQuery is not enabled' } },
      { status: 400 }
    )
  }

  // Parse date range from request body (or default to current month)
  let start: string
  let end: string
  try {
    const body = await request.json().catch(() => ({}))
    const now = new Date()
    end = (body as Record<string, string>).end || now.toISOString().split('T')[0]!
    start = (body as Record<string, string>).start || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  } catch {
    const now = new Date()
    end = now.toISOString().split('T')[0]!
    start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  }

  const startedAt = new Date()
  let syncLogId: string | null = null

  try {
    // Create sync log entry
    const { data: syncLogData, error: insertError } = await supabase
      .from('sync_logs')
      .insert({
        started_at: startedAt.toISOString(),
        status: 'running',
        trigger: 'manual',
        results: {},
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create sync log:', insertError)
    }
    syncLogId = syncLogData?.id ?? null

    // Invalidate existing cache for this date range
    await invalidateCache(start, end)

    // Fetch BigQuery + Meta API data in parallel
    console.log(`Refreshing data: ${start} → ${end}`)
    const metaEnabled = isMetaEnabled()
    const googleEnabled = isGoogleEnabled()
    console.log(`  Meta API: ${metaEnabled ? 'enabled' : 'disabled (env vars missing)'}`)
    console.log(`  Google Ads API: ${googleEnabled ? 'enabled' : 'disabled (env vars missing)'}`)

    const [spendData, bookingData, funnelData, metaInsights, googleInsights] = await Promise.all([
      fetchSpendData(start, end),
      fetchBookingData(start, end),
      fetchFunnelData(start, end),
      metaEnabled
        ? fetchMetaInsights(start, end).catch((err: Error) => {
            console.error(`  Meta API fetch failed (falling back to BigQuery): ${err.message}`)
            return [] as MetaInsightRow[]
          })
        : Promise.resolve([] as MetaInsightRow[]),
      googleEnabled
        ? fetchGoogleInsights(start, end).catch((err: Error) => {
            console.error(`  Google Ads API fetch failed (falling back to BigQuery): ${err.message}`)
            return [] as GoogleInsightRow[]
          })
        : Promise.resolve([] as GoogleInsightRow[]),
    ])

    const rowsProcessed = spendData.length + bookingData.length + funnelData.length
    console.log(`  Spend: ${spendData.length} rows, Bookings: ${bookingData.length} rows, Funnel: ${funnelData.length} rows`)
    if (metaInsights.length > 0) {
      console.log(`  Meta API: ${metaInsights.length} daily rows`)
    }
    if (googleInsights.length > 0) {
      console.log(`  Google Ads API: ${googleInsights.length} daily rows`)
    }

    // Merge into daily per-channel rows (APIs override BigQuery per day, not aggregated)
    const metrics = mergeSpendBookingsAndFunnel(spendData, bookingData, funnelData, metaInsights, googleInsights)
    console.log(`  Merged into ${metrics.length} channel-date rows`)

    // Cache to Supabase
    await cacheMetrics(metrics)

    const completedAt = new Date()
    const durationMs = completedAt.getTime() - startedAt.getTime()

    // Update sync log
    if (syncLogId) {
      await supabase
        .from('sync_logs')
        .update({
          completed_at: completedAt.toISOString(),
          status: 'success',
          duration_ms: durationMs,
          results: {
            queriesAttempted: 3 + (metaEnabled ? 1 : 0) + (googleEnabled ? 1 : 0),
            queriesSucceeded: 3 + (metaInsights.length > 0 ? 1 : 0) + (googleInsights.length > 0 ? 1 : 0),
            queriesFailed: (metaEnabled && metaInsights.length === 0 ? 1 : 0) + (googleEnabled && googleInsights.length === 0 ? 1 : 0),
            rowsProcessed,
            metricsGenerated: metrics.length,
            dateRange: { start, end },
            metaApiUsed: metaInsights.length > 0,
            googleApiUsed: googleInsights.length > 0,
          },
        })
        .eq('id', syncLogId)
    }

    const metaApiUsed = metaInsights.length > 0
    const googleApiUsed = googleInsights.length > 0
    const apiCount = (metaApiUsed ? 1 : 0) + (googleApiUsed ? 1 : 0)
    const apiAttempted = (metaEnabled ? 1 : 0) + (googleEnabled ? 1 : 0)
    const syncLog: SyncLog = {
      id: syncLogId ?? `refresh-${Date.now()}`,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      status: 'success',
      trigger: 'manual',
      results: {
        queriesAttempted: 3 + apiAttempted,
        queriesSucceeded: 3 + apiCount,
        queriesFailed: apiAttempted - apiCount,
        rowsProcessed,
      },
      duration: durationMs,
      error: null,
    }

    return NextResponse.json<ApiResponse<RefreshResponse>>({
      data: {
        success: true,
        syncLog,
        message: `Refreshed ${metrics.length} channel-date rows from BigQuery${metaApiUsed ? ` + Meta API (${metaInsights.length} days)` : ''}${googleApiUsed ? ` + Google Ads API (${googleInsights.length} days)` : ''} (${(durationMs / 1000).toFixed(1)}s)`,
      },
    })
  } catch (error) {
    console.error('Refresh error:', error)

    const completedAt = new Date()
    const durationMs = completedAt.getTime() - startedAt.getTime()

    // Log failure
    if (syncLogId) {
      try {
        await supabase
          .from('sync_logs')
          .update({
            completed_at: completedAt.toISOString(),
            status: 'failed',
            duration_ms: durationMs,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', syncLogId)
      } catch {
        // Don't fail on log update
      }
    }

    return NextResponse.json<ApiResponse<RefreshResponse>>(
      {
        error: {
          code: 'REFRESH_FAILED',
          message: `BigQuery refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      },
      { status: 500 }
    )
  }
}
