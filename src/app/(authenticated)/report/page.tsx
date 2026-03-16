'use client'

import { useEffect, useState } from 'react'
import { FileText, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatNumber } from '@/lib/utils/format'
import { CHANNEL_DISPLAY_CONFIG } from '@/lib/channel-config'
import type { Channel } from '@/types'

// Color map for channels (hex values for inline styles)
const CHANNEL_COLORS: Record<string, string> = {
  meta: '#2563eb',
  google: '#ef4444',
  pinterest: '#e11d48',
  tiktok: '#1e293b',
  microsoft: '#0891b2',
  criteo: '#f97316',
  mountain: '#059669',
  influencer: '#a855f7',
  lifecycle: '#14b8a6',
  demand_sales: '#d97706',
  direct_mail: '#6366f1',
  affiliate: '#65a30d',
  seo: '#0ea5e9',
  organic: '#16a34a',
  airbnb: '#f43f5e',
  vrbo: '#3b82f6',
  booking: '#1d4ed8',
  other: '#6b7280',
}

function getChannelName(channel: string): string {
  if (channel in CHANNEL_DISPLAY_CONFIG) {
    return CHANNEL_DISPLAY_CONFIG[channel as Channel].name
  }
  return channel.charAt(0).toUpperCase() + channel.slice(1).replace(/_/g, ' ')
}

function getChannelColor(channel: string): string {
  return CHANNEL_COLORS[channel] || '#6b7280'
}

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

interface ReportData {
  dateRange: { start: string; end: string }
  allTime: {
    channels: ChannelMetrics[]
    totals: {
      spend: number
      bookings: number
      gmv: number
      accountCreations: number
      checkoutStarted: number
    }
  }
  yearly: YearlyData[]
}

function KPICard({ label, value, icon: Icon, subtext }: { label: string; value: string; icon: React.ElementType; subtext?: string }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className="text-2xl font-semibold text-text-primary">{value}</div>
      {subtext && <div className="text-sm text-text-secondary mt-1">{subtext}</div>}
    </div>
  )
}

function InsightCard({ title, children, type = 'neutral' }: { title: string; children: React.ReactNode; type?: 'positive' | 'negative' | 'neutral' }) {
  return (
    <div className={cn(
      "border rounded-lg p-4",
      type === 'positive' && "bg-green-500/10 border-green-500/30",
      type === 'negative' && "bg-red-500/10 border-red-500/30",
      type === 'neutral' && "bg-bg-secondary border-border"
    )}>
      <div className="flex items-center gap-2 mb-2">
        {type === 'positive' && <TrendingUp className="w-4 h-4 text-green-500" />}
        {type === 'negative' && <TrendingDown className="w-4 h-4 text-red-500" />}
        {type === 'neutral' && <Target className="w-4 h-4 text-text-secondary" />}
        <span className="font-medium text-text-primary">{title}</span>
      </div>
      <div className="text-sm text-text-secondary">{children}</div>
    </div>
  )
}

function ChannelTable({ channels, showRank = false }: { channels: ChannelMetrics[]; showRank?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-text-secondary">
            {showRank && <th className="text-left py-2 px-2">#</th>}
            <th className="text-left py-2 px-2">Channel</th>
            <th className="text-right py-2 px-2">Spend</th>
            <th className="text-right py-2 px-2">Bookings</th>
            <th className="text-right py-2 px-2">GMV</th>
            <th className="text-right py-2 px-2">CPB</th>
            <th className="text-right py-2 px-2">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((ch, i) => {
            const cpb = ch.bookings > 0 ? ch.spend / ch.bookings : null
            const roas = ch.spend > 0 ? ch.gmv / ch.spend : null
            return (
              <tr key={ch.channel} className="border-b border-border/50 hover:bg-bg-tertiary/50">
                {showRank && <td className="py-2 px-2 text-text-secondary">{i + 1}</td>}
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getChannelColor(ch.channel) }} />
                    <span className="text-text-primary">{getChannelName(ch.channel)}</span>
                  </div>
                </td>
                <td className="text-right py-2 px-2 text-text-primary">{formatCurrency(ch.spend)}</td>
                <td className="text-right py-2 px-2 text-text-primary">{formatNumber(ch.bookings)}</td>
                <td className="text-right py-2 px-2 text-text-primary">{formatCurrency(ch.gmv)}</td>
                <td className="text-right py-2 px-2 text-text-primary">{cpb ? formatCurrency(cpb) : '—'}</td>
                <td className="text-right py-2 px-2 text-text-primary">{roas ? `${roas.toFixed(1)}x` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function generateInsights(data: ReportData): { allTime: React.ReactNode[]; yearly: Record<string, React.ReactNode[]> } {
  const insights: { allTime: React.ReactNode[]; yearly: Record<string, React.ReactNode[]> } = {
    allTime: [],
    yearly: {},
  }

  // All-time insights
  const { channels, totals } = data.allTime
  const paidChannels = channels.filter(c => c.spend > 0)
  const unpaidChannels = channels.filter(c => c.spend === 0 && c.bookings > 0)

  // Best performing paid channel by CPB
  const bestCPB = paidChannels.filter(c => c.bookings > 0).sort((a, b) => (a.spend / a.bookings) - (b.spend / b.bookings))[0]
  if (bestCPB) {
    insights.allTime.push(
      <InsightCard key="best-cpb" title="Most Efficient Paid Channel" type="positive">
        <strong>{getChannelName(bestCPB.channel)}</strong> has the lowest CPB at <strong>{formatCurrency(bestCPB.spend / bestCPB.bookings)}</strong>,
        driving {formatNumber(bestCPB.bookings)} bookings from {formatCurrency(bestCPB.spend)} in spend.
      </InsightCard>
    )
  }

  // Worst performing paid channel by CPB
  const worstCPB = paidChannels.filter(c => c.bookings > 0).sort((a, b) => (b.spend / b.bookings) - (a.spend / a.bookings))[0]
  if (worstCPB && worstCPB.channel !== bestCPB?.channel) {
    const cpb = worstCPB.spend / worstCPB.bookings
    if (cpb > 5000) {
      insights.allTime.push(
        <InsightCard key="worst-cpb" title="Highest CPB Channel" type="negative">
          <strong>{getChannelName(worstCPB.channel)}</strong> has a CPB of <strong>{formatCurrency(cpb)}</strong>.
          Consider optimizing targeting or reallocating budget.
        </InsightCard>
      )
    }
  }

  // Unpaid channels value
  const unpaidGMV = unpaidChannels.reduce((sum, c) => sum + c.gmv, 0)
  const unpaidBookings = unpaidChannels.reduce((sum, c) => sum + c.bookings, 0)
  if (unpaidGMV > 0) {
    insights.allTime.push(
      <InsightCard key="unpaid" title="Unpaid Channels Are Huge" type="positive">
        Organic, lifecycle, and other unpaid channels drove <strong>{formatCurrency(unpaidGMV)}</strong> in GMV
        ({formatNumber(unpaidBookings)} bookings) with $0 spend — that&apos;s <strong>{((unpaidGMV / totals.gmv) * 100).toFixed(0)}%</strong> of total GMV.
      </InsightCard>
    )
  }

  // Overall ROAS
  const overallROAS = totals.spend > 0 ? totals.gmv / totals.spend : 0
  insights.allTime.push(
    <InsightCard key="roas" title="Overall ROAS" type={overallROAS > 10 ? 'positive' : 'neutral'}>
      For every $1 spent on paid marketing, Wander generated <strong>{formatCurrency(overallROAS)}</strong> in GMV —
      a <strong>{overallROAS.toFixed(1)}x</strong> return on ad spend.
    </InsightCard>
  )

  // Google vs Meta comparison
  const google = channels.find(c => c.channel === 'google')
  const meta = channels.find(c => c.channel === 'meta')
  if (google && meta && google.bookings > 0 && meta.bookings > 0) {
    const googleCPB = google.spend / google.bookings
    const metaCPB = meta.spend / meta.bookings
    const diff = ((metaCPB - googleCPB) / googleCPB * 100).toFixed(0)
    insights.allTime.push(
      <InsightCard key="google-meta" title="Google vs Meta" type="neutral">
        Google CPB: <strong>{formatCurrency(googleCPB)}</strong> | Meta CPB: <strong>{formatCurrency(metaCPB)}</strong>
        <br />
        Meta costs <strong>{diff}% more</strong> per booking than Google.
      </InsightCard>
    )
  }

  // Yearly insights
  for (const yearData of data.yearly) {
    const yearInsights: React.ReactNode[] = []
    const yearChannels = yearData.channels
    const yearTotals = yearData.totals

    const yearPaid = yearChannels.filter(c => c.spend > 0 && c.bookings > 0)
    const yearBest = yearPaid.sort((a, b) => (a.spend / a.bookings) - (b.spend / b.bookings))[0]

    if (yearBest) {
      yearInsights.push(
        <InsightCard key={`${yearData.year}-best`} title="Top Performer" type="positive">
          <strong>{getChannelName(yearBest.channel)}</strong> led with <strong>{formatCurrency(yearBest.spend / yearBest.bookings)}</strong> CPB,
          generating {formatNumber(yearBest.bookings)} bookings.
        </InsightCard>
      )
    }

    // Year ROAS
    if (yearTotals.spend > 0) {
      const yearROAS = yearTotals.gmv / yearTotals.spend
      yearInsights.push(
        <InsightCard key={`${yearData.year}-roas`} title="ROAS" type={yearROAS > 10 ? 'positive' : 'neutral'}>
          {formatCurrency(yearTotals.spend)} spend → {formatCurrency(yearTotals.gmv)} GMV = <strong>{yearROAS.toFixed(1)}x</strong> return
        </InsightCard>
      )
    }

    // Booking volume
    yearInsights.push(
      <InsightCard key={`${yearData.year}-volume`} title="Booking Volume" type="neutral">
        {formatNumber(yearTotals.bookings)} total bookings across all channels
      </InsightCard>
    )

    insights.yearly[yearData.year] = yearInsights
  }

  return insights
}

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReport() {
      try {
        const res = await fetch('/api/report')
        if (!res.ok) throw new Error('Failed to fetch report')
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-text-secondary">Loading report...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error loading report: {error}</div>
      </div>
    )
  }

  const insights = generateInsights(data)
  const { totals } = data.allTime
  const overallCPB = totals.bookings > 0 ? totals.spend / totals.bookings : 0
  const overallROAS = totals.spend > 0 ? totals.gmv / totals.spend : 0

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-8 h-8 text-accent" />
          <h1 className="text-3xl font-bold text-text-primary">Marketing Performance Report</h1>
        </div>
        <p className="text-text-secondary">
          Data from {data.dateRange.start} to {data.dateRange.end}
        </p>
      </div>

      {/* All-Time Section */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-text-primary mb-6 flex items-center gap-2">
          <span className="w-3 h-3 bg-accent rounded-full" />
          All-Time Performance
        </h2>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KPICard
            label="Total Spend"
            value={formatCurrency(totals.spend)}
            icon={DollarSign}
          />
          <KPICard
            label="Total Bookings"
            value={formatNumber(totals.bookings)}
            icon={ShoppingCart}
          />
          <KPICard
            label="Total GMV"
            value={formatCurrency(totals.gmv)}
            icon={TrendingUp}
          />
          <KPICard
            label="Overall CPB"
            value={formatCurrency(overallCPB)}
            icon={Target}
            subtext={`${overallROAS.toFixed(1)}x ROAS`}
          />
        </div>

        {/* Insights */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {insights.allTime}
        </div>

        {/* Channel Table */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h3 className="font-medium text-text-primary mb-4">Channel Breakdown</h3>
          <ChannelTable channels={data.allTime.channels} showRank />
        </div>
      </section>

      {/* Yearly Sections */}
      {data.yearly.map((yearData) => {
        const yearCPB = yearData.totals.bookings > 0 ? yearData.totals.spend / yearData.totals.bookings : 0
        const yearROAS = yearData.totals.spend > 0 ? yearData.totals.gmv / yearData.totals.spend : 0

        return (
          <section key={yearData.year} className="mb-12">
            <h2 className="text-2xl font-semibold text-text-primary mb-6 flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full" />
              {yearData.year}
            </h2>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KPICard
                label="Spend"
                value={formatCurrency(yearData.totals.spend)}
                icon={DollarSign}
              />
              <KPICard
                label="Bookings"
                value={formatNumber(yearData.totals.bookings)}
                icon={ShoppingCart}
              />
              <KPICard
                label="GMV"
                value={formatCurrency(yearData.totals.gmv)}
                icon={TrendingUp}
              />
              <KPICard
                label="CPB"
                value={yearCPB > 0 ? formatCurrency(yearCPB) : '—'}
                icon={Target}
                subtext={yearROAS > 0 ? `${yearROAS.toFixed(1)}x ROAS` : undefined}
              />
            </div>

            {/* Insights */}
            {insights.yearly[yearData.year] && (
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                {insights.yearly[yearData.year]}
              </div>
            )}

            {/* Channel Table */}
            <div className="bg-bg-secondary border border-border rounded-lg p-4">
              <h3 className="font-medium text-text-primary mb-4">Channel Breakdown</h3>
              <ChannelTable channels={yearData.channels} />
            </div>
          </section>
        )
      })}

      {/* Footer */}
      <div className="text-center text-text-secondary text-sm py-8 border-t border-border">
        Generated by Wander Growth Tracker • {new Date().toLocaleDateString()}
      </div>
    </div>
  )
}
