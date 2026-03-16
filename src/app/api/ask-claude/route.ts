import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getAnthropicClient, ANTHROPIC_CONFIG } from '@/lib/anthropic/client'
import { buildSystemPrompt, generateFollowUpSuggestions } from '@/lib/anthropic/prompts'
import { generateInsights } from '@/lib/insights'
import { CPB_TARGET, BLENDED_TAKE_RATE, CPB_EXCLUDED_CHANNELS, OTA_CHANNELS } from '@/types'
import type { AskClaudeRequest, AskClaudeResponse, AskClaudeMessage, ApiResponse, ChannelMetrics, DashboardSummary, Channel } from '@/types'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

// Rate limiting: simple in-memory tracker (use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 20 // requests per window
const RATE_WINDOW = 60 * 1000 // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const userLimit = rateLimitMap.get(userId)

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }

  if (userLimit.count >= RATE_LIMIT) {
    return false
  }

  userLimit.count++
  return true
}

function formatHistoryForAnthropic(messages: AskClaudeMessage[]): MessageParam[] {
  return messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }))
}

import type { MonthlyMetrics, ChannelMonthlyMetrics } from '@/lib/anthropic/context'

// Fetch real data from Supabase for Claude's context, filtered by date range
async function getRealDashboardData(days: number = 9999): Promise<{
  summary: DashboardSummary
  channels: ChannelMetrics[]
  monthlyTrends: MonthlyMetrics[]
  channelMonthly: ChannelMonthlyMetrics[]
  dateRange: { start: string; end: string }
}> {
  // Use service client to bypass RLS
  const supabase = createServiceClient()

  // Fetch fixed costs (monthly amounts)
  const { data: fixedCosts } = await supabase
    .from('fixed_costs')
    .select('category, partner, monthly_amount')

  // Calculate monthly fixed costs total
  const monthlyFixedCosts = (fixedCosts || []).reduce(
    (sum, fc) => sum + (Number(fc.monthly_amount) || 0),
    0
  )

  // Calculate date range for filtering
  const queryEndDate = new Date()
  const queryStartDate = new Date()
  queryStartDate.setDate(queryStartDate.getDate() - days)
  const startDateStr = queryStartDate.toISOString().split('T')[0]
  const endDateStr = queryEndDate.toISOString().split('T')[0]

  // Fetch data with pagination, filtered by selected date range
  interface ChannelSnapshot {
    date: string
    channel: string
    spend: number | null
    bookings: number | null
    gmv: number | null
    account_creations: number | null
    checkout_started: number | null
    clicks: number | null
    impressions: number | null
    take_rate_revenue: number | null
    points_used: number | null
    coupon_off: number | null
    direct_bookings: number | null
    ota_bookings: number | null
    data_source: string
    attribution: string
  }

  let allSnapshots: ChannelSnapshot[] = []

  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data: snapshots } = await supabase
      .from('channel_snapshots')
      .select('*')
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .order('date', { ascending: true })
      .order('channel', { ascending: true })
      .range(offset, offset + pageSize - 1)

    allSnapshots = allSnapshots.concat(snapshots || [])
    if (!snapshots || snapshots.length < pageSize) break
    offset += pageSize
  }

  // Pro-rate fixed costs by actual days in the data range (matches dashboard route methodology)
  const sortedDates = allSnapshots.map(s => s.date).sort()
  const firstDataDate = sortedDates.length > 0 ? new Date(sortedDates[0]) : queryStartDate
  const lastDataDate = sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length - 1]) : queryEndDate
  const daysInRange = Math.ceil((lastDataDate.getTime() - firstDataDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const totalFixedCosts = Math.round((monthlyFixedCosts / 30) * daysInRange)

  // Aggregate totals - track ad spend separately
  let adSpend = 0
  let directGmv = 0
  let otaGmv = 0
  const totals = {
    adSpend: 0,
    fixedCosts: totalFixedCosts,
    spend: 0, // Will be adSpend + fixedCosts
    accountCreations: 0,
    checkoutPreviewed: 0,
    checkoutStarted: 0,
    bookings: 0,
    directBookings: 0,
    otaBookings: 0,
    gmv: 0,
    directGmv: 0,
    otaGmv: 0,
    pointsUsed: 0,
    couponOff: 0,
    totalMarketingSpend: 0,
    takeRateRevenue: 0,
  }

  const channelMap = new Map<Channel, {
    spend: number
    bookings: number
    accountCreations: number
    checkoutStarted: number
    gmv: number
    takeRateRevenue: number
    pointsUsed: number
    couponOff: number
    directBookings: number
    otaBookings: number
    clicks: number
    impressions: number
    lastDate: string
    dataSource: string
    attribution: string
  }>()

  // Monthly aggregation
  const monthlyMap = new Map<string, { spend: number; bookings: number; gmv: number; takeRateRevenue: number }>()
  const channelMonthlyMap = new Map<Channel, Map<string, { spend: number; bookings: number; gmv: number; takeRateRevenue: number }>>()

  // Get date range from data
  const dates = allSnapshots.map(s => s.date).sort()
  const startDate = dates.length > 0 ? new Date(dates[0]) : new Date()
  const endDate = dates.length > 0 ? new Date(dates[dates.length - 1]) : new Date()

  for (const snap of allSnapshots) {
    adSpend += snap.spend || 0
    totals.accountCreations += snap.account_creations || 0
    totals.checkoutStarted += snap.checkout_started || 0
    totals.bookings += snap.bookings || 0
    totals.gmv += snap.gmv || 0
    totals.takeRateRevenue += snap.take_rate_revenue || 0
    totals.pointsUsed += snap.points_used || 0
    totals.couponOff += snap.coupon_off || 0

    const channel = snap.channel as Channel

    // Track GMV by channel type (OTA vs Direct)
    if (OTA_CHANNELS.includes(channel)) {
      otaGmv += snap.gmv || 0
    } else {
      directGmv += snap.gmv || 0
    }

    // Track direct bookings separately (exclude OTA, organic, and other non-marketing channels)
    if (!CPB_EXCLUDED_CHANNELS.includes(channel)) {
      totals.directBookings += snap.bookings || 0
    }
    const existing = channelMap.get(channel) || {
      spend: 0, bookings: 0, accountCreations: 0, checkoutStarted: 0,
      gmv: 0, takeRateRevenue: 0, pointsUsed: 0, couponOff: 0,
      directBookings: 0, otaBookings: 0,
      clicks: 0, impressions: 0, lastDate: snap.date,
      dataSource: snap.data_source || 'bigquery',
      attribution: snap.attribution || 'first_partner',
    }

    existing.spend += snap.spend || 0
    existing.bookings += snap.bookings || 0
    existing.accountCreations += snap.account_creations || 0
    existing.checkoutStarted += snap.checkout_started || 0
    existing.gmv += snap.gmv || 0
    existing.takeRateRevenue += snap.take_rate_revenue || 0
    existing.pointsUsed += snap.points_used || 0
    existing.couponOff += snap.coupon_off || 0
    existing.directBookings += snap.direct_bookings || 0
    existing.otaBookings += snap.ota_bookings || 0
    existing.clicks += snap.clicks || 0
    existing.impressions += snap.impressions || 0
    if (snap.date > existing.lastDate) existing.lastDate = snap.date

    channelMap.set(channel, existing)

    // Monthly aggregation (format: "2025-01")
    const monthKey = snap.date.substring(0, 7)

    // Overall monthly
    const monthData = monthlyMap.get(monthKey) || { spend: 0, bookings: 0, gmv: 0, takeRateRevenue: 0 }
    monthData.spend += snap.spend || 0
    monthData.bookings += snap.bookings || 0
    monthData.gmv += snap.gmv || 0
    monthData.takeRateRevenue += snap.take_rate_revenue || 0
    monthlyMap.set(monthKey, monthData)

    // Per-channel monthly
    if (!channelMonthlyMap.has(channel)) {
      channelMonthlyMap.set(channel, new Map())
    }
    const channelMonths = channelMonthlyMap.get(channel)!
    const channelMonthData = channelMonths.get(monthKey) || { spend: 0, bookings: 0, gmv: 0, takeRateRevenue: 0 }
    channelMonthData.spend += snap.spend || 0
    channelMonthData.bookings += snap.bookings || 0
    channelMonthData.gmv += snap.gmv || 0
    channelMonthData.takeRateRevenue += snap.take_rate_revenue || 0
    channelMonths.set(monthKey, channelMonthData)
  }

  // Set final totals
  totals.adSpend = adSpend
  totals.directGmv = directGmv
  totals.otaGmv = otaGmv
  // Total marketing spend = ad spend + fixed costs + points + coupons (Dylan Wright, March 2026)
  totals.totalMarketingSpend = adSpend + totalFixedCosts + totals.pointsUsed + totals.couponOff
  totals.spend = totals.totalMarketingSpend

  // Build channels array
  const channels: ChannelMetrics[] = []
  channelMap.forEach((agg, channel) => {
    channels.push({
      channel,
      date: agg.lastDate,
      spend: agg.spend,
      bookings: agg.bookings,
      accountCreations: agg.accountCreations,
      checkoutPreviewed: null,
      checkoutStarted: agg.checkoutStarted,
      gmv: agg.gmv,
      pointsUsed: agg.pointsUsed || null,
      couponOff: agg.couponOff || null,
      takeRateRevenue: agg.takeRateRevenue || null,
      directBookings: agg.directBookings || null,
      otaBookings: agg.otaBookings || null,
      clicks: agg.clicks || null,
      impressions: agg.impressions || null,
      cpac: agg.accountCreations > 0 ? agg.spend / agg.accountCreations : null,
      cpcp: null,
      cpc: agg.checkoutStarted > 0 ? agg.spend / agg.checkoutStarted : null,
      cpb: agg.bookings > 0 ? agg.spend / agg.bookings : null,
      roas: agg.spend > 0 ? (agg.gmv * BLENDED_TAKE_RATE) / agg.spend : null,
      dataSource: agg.dataSource as 'bigquery' | 'meta_api' | 'fixed_cost' | 'manual',
      attribution: agg.attribution as 'first_partner' | 'view_click' | 'data_driven' | 'last_click',
      lastUpdated: new Date().toISOString(),
    })
  })

  channels.sort((a, b) => (b.spend || 0) - (a.spend || 0))

  // Build monthly trends array
  const monthlyTrends: MonthlyMetrics[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      spend: data.spend,
      bookings: data.bookings,
      gmv: data.gmv,
      cpb: data.bookings > 0 ? data.spend / data.bookings : null,
      roas: data.spend > 0 ? (data.gmv * BLENDED_TAKE_RATE) / data.spend : null,
    }))

  // Build channel monthly array (sorted by total spend)
  const channelMonthly: ChannelMonthlyMetrics[] = Array.from(channelMonthlyMap.entries())
    .map(([channel, monthsMap]) => ({
      channel,
      totalSpend: Array.from(monthsMap.values()).reduce((sum, m) => sum + m.spend, 0),
      months: Array.from(monthsMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          spend: data.spend,
          bookings: data.bookings,
          gmv: data.gmv,
          cpb: data.bookings > 0 ? data.spend / data.bookings : null,
          roas: data.spend > 0 ? (data.gmv * BLENDED_TAKE_RATE) / data.spend : null,
        })),
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .map(({ channel, months }) => ({ channel, months }))

  const now = new Date()
  const daysCovered = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

  const summary: DashboardSummary = {
    period: {
      month: `All Time (${startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`,
      daysInMonth: daysCovered,
      daysElapsed: daysCovered,
      asOfDate: endDate.toISOString().split('T')[0],
    },
    totals,
    efficiency: {
      cpac: totals.accountCreations > 0 ? totals.totalMarketingSpend / totals.accountCreations : 0,
      cpb: totals.bookings > 0 ? totals.totalMarketingSpend / totals.bookings : 0,
      directCpb: totals.directBookings > 0 ? totals.totalMarketingSpend / totals.directBookings : 0,
      fullyLoadedCpb: totals.bookings > 0 ? totals.totalMarketingSpend / totals.bookings : 0,
      roas: adSpend > 0 ? (totals.gmv * BLENDED_TAKE_RATE) / adSpend : 0,
    },
    targets: {
      cpbTarget: CPB_TARGET,
      bookingsTarget: 1000,
    },
    channels,
    dataFreshness: {
      lastRefresh: new Date().toISOString(),
      latestDataDate: channels.reduce((max, c) => c.date > max ? c.date : max, ''),
      oldestData: startDate.toISOString(),
      nextScheduledRefresh: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
    },
  }

  return {
    summary,
    channels,
    monthlyTrends,
    channelMonthly,
    dateRange: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    },
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()

  // Verify authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<AskClaudeResponse>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  // Check rate limit
  if (!checkRateLimit(user.id)) {
    return NextResponse.json<ApiResponse<AskClaudeResponse>>(
      {
        error: {
          code: 'RATE_LIMITED',
          message: "I'm getting a lot of questions right now. Please try again in a moment.",
        },
      },
      { status: 429 }
    )
  }

  try {
    const body: AskClaudeRequest = await request.json()

    if (!body.question?.trim()) {
      return NextResponse.json<ApiResponse<AskClaudeResponse>>(
        { error: { code: 'BAD_REQUEST', message: 'Question is required' } },
        { status: 400 }
      )
    }

    // Get real dashboard context from Supabase filtered by selected date range
    const days = body.days ?? 9999
    const { summary, channels, monthlyTrends, channelMonthly, dateRange } = await getRealDashboardData(days)
    const dateRangeLabel = days >= 9999 ? 'all time' : days === 1 ? 'today' : `the past ${days} days`
    const insights = generateInsights(channels, dateRangeLabel)

    // Build system prompt with context including monthly breakdowns
    const periodLabel = days >= 9999 ? 'All Time' : days === 1 ? 'Today' : `Last ${days} Days`
    const systemPrompt = buildSystemPrompt({
      summary,
      channels,
      insights,
      monthlyTrends,
      channelMonthly,
      dateRange,
      periodLabel,
    })

    // Format conversation history
    const conversationHistory = formatHistoryForAnthropic(
      body.conversationHistory || []
    )

    // Add current question
    const messages: MessageParam[] = [
      ...conversationHistory,
      { role: 'user', content: body.question },
    ]

    // Check if Anthropic API key is configured
    let anthropic
    try {
      anthropic = getAnthropicClient()
    } catch (error) {
      console.error('Anthropic client error:', error)
      return NextResponse.json<ApiResponse<AskClaudeResponse>>(
        {
          error: {
            code: 'CONFIG_ERROR',
            message: 'AI service is not configured. Contact your administrator.',
          },
        },
        { status: 503 }
      )
    }

    // Call Claude API
    const response = await anthropic.messages.create({
      model: ANTHROPIC_CONFIG.model,
      max_tokens: ANTHROPIC_CONFIG.maxTokens,
      temperature: ANTHROPIC_CONFIG.temperature,
      system: systemPrompt,
      messages,
    })

    // Extract text from response
    const textContent = response.content.find((block) => block.type === 'text')
    const answer = textContent?.type === 'text' ? textContent.text : 'I was unable to generate a response.'

    // Generate follow-up suggestions
    const suggestedFollowUps = generateFollowUpSuggestions(body.question, answer)

    return NextResponse.json<ApiResponse<AskClaudeResponse>>({
      data: {
        answer,
        suggestedFollowUps,
      },
    })
  } catch (error: unknown) {
    console.error('Ask Claude API error:', error)

    // Handle specific Anthropic errors
    if (error instanceof Error) {
      if (error.message.includes('rate_limit')) {
        return NextResponse.json<ApiResponse<AskClaudeResponse>>(
          {
            error: {
              code: 'RATE_LIMITED',
              message: "I'm getting a lot of questions right now. Please try again in a moment.",
            },
          },
          { status: 429 }
        )
      }

      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        return NextResponse.json<ApiResponse<AskClaudeResponse>>(
          {
            error: {
              code: 'TIMEOUT',
              message: 'That took too long. Try a simpler question.',
            },
          },
          { status: 504 }
        )
      }

      if (error.message.includes('invalid_api_key') || error.message.includes('authentication')) {
        return NextResponse.json<ApiResponse<AskClaudeResponse>>(
          {
            error: {
              code: 'CONFIG_ERROR',
              message: 'AI service is not configured. Contact your administrator.',
            },
          },
          { status: 503 }
        )
      }
    }

    return NextResponse.json<ApiResponse<AskClaudeResponse>>(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'I encountered an issue. Please try again.',
        },
      },
      { status: 500 }
    )
  }
}
