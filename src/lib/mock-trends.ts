import type { TrendData, TrendDataPoint, Channel } from '@/types'

/**
 * Generate mock trend data for the last N days
 */
export function generateMockTrendData(days: number = 30): TrendData {
  const series: TrendDataPoint[] = []
  const today = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)

    // Generate realistic daily spend with some variance
    const baseSpend = 40000 // ~$40K/day base
    const dayOfWeek = date.getDay()
    const weekendMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1.0
    const randomVariance = 0.8 + Math.random() * 0.4 // 80-120%

    const dailyTotal = Math.round(baseSpend * weekendMultiplier * randomVariance)

    // Distribute across channels based on typical ratios
    const byChannel: Partial<Record<Channel, number>> = {
      meta: Math.round(dailyTotal * 0.36),
      google: Math.round(dailyTotal * 0.30),
      tiktok: Math.round(dailyTotal * 0.10),
      pinterest: Math.round(dailyTotal * 0.06),
      microsoft: Math.round(dailyTotal * 0.04),
      criteo: Math.round(dailyTotal * 0.03),
      mountain: Math.round(dailyTotal * 0.05),
      influencer: Math.round(dailyTotal * 0.03),
      lifecycle: Math.round(dailyTotal * 0.02),
      other: Math.round(dailyTotal * 0.01),
    }

    series.push({
      date: date.toISOString().split('T')[0],
      total: dailyTotal,
      byChannel,
    })
  }

  return {
    metric: 'spend',
    period: `${days} days`,
    series,
  }
}

/**
 * Format date string for chart display
 */
export function formatChartDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
