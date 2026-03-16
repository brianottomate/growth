import type { Channel } from '@/types'

/**
 * Hex colors for Recharts (derived from Tailwind classes in channel-config)
 */
export const CHANNEL_CHART_COLORS: Record<Channel, string> = {
  meta: '#2563eb',       // blue-600
  google: '#ef4444',     // red-500
  pinterest: '#e11d48',  // rose-600
  tiktok: '#1e293b',     // slate-800
  microsoft: '#0891b2',  // cyan-600
  criteo: '#f97316',     // orange-500
  mountain: '#059669',   // emerald-600
  influencer: '#a855f7', // purple-500
  lifecycle: '#14b8a6',  // teal-500
  demand_sales: '#d97706', // amber-600
  direct_mail: '#6366f1', // indigo-500
  affiliate: '#84cc16',  // lime-500
  seo: '#0ea5e9',        // sky-500
  organic: '#22c55e',    // green-500
  airbnb: '#f43f5e',     // rose-500
  vrbo: '#3b82f6',       // blue-500
  booking: '#1d4ed8',    // blue-700
  amex: '#006fcf',       // amex blue
  other: '#6b7280',      // gray-500
}

/**
 * Top channels to show in chart (others grouped into "Other")
 */
export const TOP_CHART_CHANNELS: Channel[] = [
  'meta',
  'google',
  'tiktok',
  'pinterest',
  'microsoft',
]

/**
 * Chart theme colors (dark theme)
 */
export const CHART_THEME = {
  grid: '#262626',
  axis: '#a3a3a3',
  tooltip: {
    background: '#171717',
    border: '#262626',
    text: '#fafafa',
    muted: '#a3a3a3',
  },
}

/**
 * Get chart color for a channel
 */
export function getChannelChartColor(channel: Channel): string {
  return CHANNEL_CHART_COLORS[channel]
}
