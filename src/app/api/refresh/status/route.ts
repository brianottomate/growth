import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { SyncLog, ApiResponse } from '@/types'

interface StatusResponse {
  lastSync: SyncLog | null
  latestDataDate?: string | null
  dateRange?: { start: string; end: string } | null
}

export async function GET() {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<StatusResponse>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  try {
    // Get most recent successful sync
    const { data: syncData, error: fetchError } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error)
      console.error('Failed to fetch sync log:', fetchError)
    }

    const lastSync: SyncLog | null = syncData
      ? {
          id: syncData.id,
          startedAt: syncData.started_at,
          completedAt: syncData.completed_at,
          status: syncData.status,
          trigger: syncData.trigger,
          results: syncData.results ?? {
            queriesAttempted: 0,
            queriesSucceeded: 0,
            queriesFailed: 0,
            rowsProcessed: 0,
          },
          duration: syncData.duration_ms ?? 0,
          error: syncData.error,
        }
      : null

    // Get the date range of data
    const serviceClient = createServiceClient()

    // Get earliest and latest dates
    const [{ data: earliestData }, { data: latestData }] = await Promise.all([
      serviceClient
        .from('channel_snapshots')
        .select('date')
        .order('date', { ascending: true })
        .limit(1)
        .single(),
      serviceClient
        .from('channel_snapshots')
        .select('date')
        .order('date', { ascending: false })
        .limit(1)
        .single(),
    ])

    const dateRange = earliestData && latestData
      ? { start: earliestData.date, end: latestData.date }
      : null

    // If no sync log, use latest data date as fallback
    const latestDataDate = !lastSync && latestData ? latestData.date : null

    return NextResponse.json<ApiResponse<StatusResponse>>({
      data: { lastSync, latestDataDate, dateRange },
    })
  } catch (error) {
    console.error('Status error:', error)

    return NextResponse.json<ApiResponse<StatusResponse>>(
      {
        error: {
          code: 'FETCH_ERROR',
          message: 'Failed to fetch refresh status',
        },
      },
      { status: 500 }
    )
  }
}
