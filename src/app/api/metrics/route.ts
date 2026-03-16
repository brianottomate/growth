import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isBigQueryEnabled } from '@/lib/bigquery/client'
import { fetchSpendData, fetchBookingData, fetchFunnelData } from '@/lib/bigquery/queries'
import { mergeSpendBookingsAndFunnel } from '@/lib/bigquery/mapper'
import { getCachedMetrics, cacheMetrics } from '@/lib/bigquery/cache'
import { getMockChannelMetrics } from '@/lib/mock-data'
import type { ChannelMetrics, ApiResponse } from '@/types'

function getDateRange(searchParams: URLSearchParams): { start: string; end: string } {
  const end = searchParams.get('end') || new Date().toISOString().split('T')[0]

  const defaultStart = new Date()
  defaultStart.setDate(defaultStart.getDate() - 30)
  const start = searchParams.get('start') || defaultStart.toISOString().split('T')[0]

  return { start, end }
}

export async function GET(request: Request) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<ChannelMetrics[]>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const { start, end } = getDateRange(searchParams)

  try {
    // Check if BigQuery is enabled
    if (!isBigQueryEnabled()) {
      console.log('BigQuery disabled, using mock data')
      const mockData = getMockChannelMetrics()
      return NextResponse.json<ApiResponse<ChannelMetrics[]>>({ data: mockData })
    }

    // Try to get cached data first
    const cachedData = await getCachedMetrics(start, end)
    if (cachedData && cachedData.length > 0) {
      console.log('Returning cached metrics')
      return NextResponse.json<ApiResponse<ChannelMetrics[]>>({ data: cachedData })
    }

    // Fetch fresh data from BigQuery (3 queries: spend, bookings, funnel)
    console.log('Fetching fresh data from BigQuery')
    const [spendData, bookingData, funnelData] = await Promise.all([
      fetchSpendData(start, end),
      fetchBookingData(start, end),
      fetchFunnelData(start, end),
    ])

    const metrics = mergeSpendBookingsAndFunnel(spendData, bookingData, funnelData)

    // Cache the results
    await cacheMetrics(metrics)

    return NextResponse.json<ApiResponse<ChannelMetrics[]>>({ data: metrics })
  } catch (error) {
    console.error('Metrics API error:', error)

    // Fall back to mock data on any error
    const mockData = getMockChannelMetrics()
    return NextResponse.json<ApiResponse<ChannelMetrics[]>>({
      data: mockData,
    })
  }
}
