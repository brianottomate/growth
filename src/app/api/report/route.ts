import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface ChannelMetrics {
  channel: string
  spend: number
  bookings: number
  gmv: number
  accountCreations: number
  checkoutStarted: number
}

interface YearlyData {
  year: string
  channels: ChannelMetrics[]
  totals: {
    spend: number
    bookings: number
    gmv: number
    accountCreations: number
    checkoutStarted: number
  }
}

export async function GET() {
  const supabase = createServiceClient()

  // Fetch all data with pagination
  let allData: Array<{
    date: string
    channel: string
    spend: number
    bookings: number
    gmv: number
    account_creations: number
    checkout_started: number
  }> = []

  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('channel_snapshots')
      .select('date, channel, spend, bookings, gmv, account_creations, checkout_started')
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error('Error fetching report data:', error)
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
    }

    allData = allData.concat(data || [])
    if (!data || data.length < pageSize) break
    offset += pageSize
  }

  // Group by year and channel
  const byYearChannel: Record<string, Record<string, ChannelMetrics>> = {}

  for (const row of allData) {
    const year = row.date.substring(0, 4)

    if (!byYearChannel[year]) {
      byYearChannel[year] = {}
    }

    if (!byYearChannel[year][row.channel]) {
      byYearChannel[year][row.channel] = {
        channel: row.channel,
        spend: 0,
        bookings: 0,
        gmv: 0,
        accountCreations: 0,
        checkoutStarted: 0,
      }
    }

    const ch = byYearChannel[year][row.channel]
    ch.spend += row.spend || 0
    ch.bookings += row.bookings || 0
    ch.gmv += row.gmv || 0
    ch.accountCreations += row.account_creations || 0
    ch.checkoutStarted += row.checkout_started || 0
  }

  // Convert to array format and calculate totals
  const yearlyData: YearlyData[] = Object.entries(byYearChannel)
    .sort((a, b) => b[0].localeCompare(a[0])) // Most recent first
    .map(([year, channels]) => {
      const channelArray = Object.values(channels).sort((a, b) => b.spend - a.spend)
      const totals = channelArray.reduce(
        (acc, ch) => ({
          spend: acc.spend + ch.spend,
          bookings: acc.bookings + ch.bookings,
          gmv: acc.gmv + ch.gmv,
          accountCreations: acc.accountCreations + ch.accountCreations,
          checkoutStarted: acc.checkoutStarted + ch.checkoutStarted,
        }),
        { spend: 0, bookings: 0, gmv: 0, accountCreations: 0, checkoutStarted: 0 }
      )
      return { year, channels: channelArray, totals }
    })

  // Calculate all-time totals
  const allTimeChannels: Record<string, ChannelMetrics> = {}
  for (const row of allData) {
    if (!allTimeChannels[row.channel]) {
      allTimeChannels[row.channel] = {
        channel: row.channel,
        spend: 0,
        bookings: 0,
        gmv: 0,
        accountCreations: 0,
        checkoutStarted: 0,
      }
    }
    const ch = allTimeChannels[row.channel]
    ch.spend += row.spend || 0
    ch.bookings += row.bookings || 0
    ch.gmv += row.gmv || 0
    ch.accountCreations += row.account_creations || 0
    ch.checkoutStarted += row.checkout_started || 0
  }

  const allTimeArray = Object.values(allTimeChannels).sort((a, b) => b.spend - a.spend)
  const allTimeTotals = allTimeArray.reduce(
    (acc, ch) => ({
      spend: acc.spend + ch.spend,
      bookings: acc.bookings + ch.bookings,
      gmv: acc.gmv + ch.gmv,
      accountCreations: acc.accountCreations + ch.accountCreations,
      checkoutStarted: acc.checkoutStarted + ch.checkoutStarted,
    }),
    { spend: 0, bookings: 0, gmv: 0, accountCreations: 0, checkoutStarted: 0 }
  )

  // Get date range
  const dates = allData.map(r => r.date).sort()
  const dateRange = {
    start: dates[0],
    end: dates[dates.length - 1],
  }

  return NextResponse.json({
    dateRange,
    allTime: {
      channels: allTimeArray,
      totals: allTimeTotals,
    },
    yearly: yearlyData,
  })
}
