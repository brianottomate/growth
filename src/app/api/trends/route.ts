import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { TrendData, TrendDataPoint, ApiResponse, Channel } from '@/types'

export async function GET(request: Request) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<TrendData>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  // Get params from query — supports start/end or days (backward compat)
  const { searchParams } = new URL(request.url)
  const metric = searchParams.get('metric') || 'spend'

  let startDate: Date
  let endDate: Date
  let days: number

  if (searchParams.get('start') && searchParams.get('end')) {
    startDate = new Date(searchParams.get('start')! + 'T00:00:00')
    endDate = new Date(searchParams.get('end')! + 'T23:59:59')
    days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  } else {
    days = parseInt(searchParams.get('days') || '30', 10)
    endDate = new Date()
    startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
  }

  try {

    // Use service client for data queries (bypasses RLS)
    const serviceClient = createServiceClient()

    // Fetch ALL data with pagination (Supabase default limit is 1000)
    let allSnapshots: Array<{
      date: string
      channel: string
      spend: number | null
      bookings: number | null
      gmv: number | null
    }> = []
    let offset = 0
    const pageSize = 1000

    while (true) {
      const { data: snapshots, error: dbError } = await serviceClient
        .from('channel_snapshots')
        .select('date, channel, spend, bookings, gmv')
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('channel', { ascending: true })
        .range(offset, offset + pageSize - 1)

      if (dbError) {
        console.error('Database error:', dbError)
        break
      }

      allSnapshots = allSnapshots.concat(snapshots || [])

      if (!snapshots || snapshots.length < pageSize) {
        break
      }
      offset += pageSize
    }

    const snapshots = allSnapshots

    // Aggregate by date
    const dateMap = new Map<string, { total: number; byChannel: Partial<Record<Channel, number>> }>()

    for (const snap of snapshots || []) {
      const dateKey = snap.date
      const value = metric === 'spend' ? (snap.spend || 0) :
                   metric === 'bookings' ? (snap.bookings || 0) :
                   metric === 'gmv' ? (snap.gmv || 0) : 0

      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { total: 0, byChannel: {} })
      }

      const entry = dateMap.get(dateKey)!
      entry.total += value
      entry.byChannel[snap.channel as Channel] = (entry.byChannel[snap.channel as Channel] || 0) + value
    }

    // Convert to series
    const series: TrendDataPoint[] = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        total: data.total,
        byChannel: data.byChannel,
      }))

    const data: TrendData = {
      metric,
      period: searchParams.get('start')
        ? `${searchParams.get('start')} to ${searchParams.get('end')}`
        : days >= 9999 ? 'All time' : days === 1 ? 'Today' : `Last ${days} days`,
      series,
    }

    return NextResponse.json<ApiResponse<TrendData>>({ data })
  } catch (error) {
    console.error('Trends API error:', error)
    return NextResponse.json<ApiResponse<TrendData>>(
      { error: { code: 'FETCH_ERROR', message: 'Failed to load trend data' } },
      { status: 500 }
    )
  }
}
