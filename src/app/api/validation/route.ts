import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServiceClient()

  // Fetch all data with pagination
  let allData: Array<{
    date: string
    channel: string
    spend: number
    bookings: number
    gmv: number
  }> = []

  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('channel_snapshots')
      .select('date, channel, spend, bookings, gmv')
      .order('date', { ascending: true })
      .order('channel', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error('Error fetching validation data:', error)
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
    }

    allData = allData.concat(data || [])
    if (!data || data.length < pageSize) break
    offset += pageSize
  }

  // Aggregate by channel
  const byChannel: Record<string, { spend: number; bookings: number; gmv: number }> = {}
  let totalSpend = 0
  let totalBookings = 0
  let totalGmv = 0

  for (const row of allData) {
    if (!byChannel[row.channel]) {
      byChannel[row.channel] = { spend: 0, bookings: 0, gmv: 0 }
    }
    byChannel[row.channel].spend += row.spend || 0
    byChannel[row.channel].bookings += row.bookings || 0
    byChannel[row.channel].gmv += row.gmv || 0
    totalSpend += row.spend || 0
    totalBookings += row.bookings || 0
    totalGmv += row.gmv || 0
  }

  const channelTotals = Object.entries(byChannel)
    .map(([channel, data]) => ({ channel, ...data }))
    .sort((a, b) => b.spend - a.spend)

  // Get date range
  const dates = allData.map(r => r.date).sort()

  return NextResponse.json({
    supabase: {
      totalRows: allData.length,
      dateRange: {
        start: dates[0] || '',
        end: dates[dates.length - 1] || '',
      },
      channelTotals,
      totals: {
        spend: totalSpend,
        bookings: totalBookings,
        gmv: totalGmv,
      },
    },
  })
}
