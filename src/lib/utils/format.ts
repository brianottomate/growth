// src/lib/utils/format.ts

export function formatCurrency(value: number | null, options: { compact?: boolean; decimals?: number } = {}): string {
  if (value === null) return '—'
  const { compact = false, decimals = 0 } = options
  if (compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

export function formatNumber(value: number | null, options: { decimals?: number } = {}): string {
  if (value === null) return '—'
  const { decimals = 0 } = options
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

export function formatPercent(value: number | null, options: { decimals?: number; showSign?: boolean } = {}): string {
  if (value === null) return '—'
  const { decimals = 1, showSign = false } = options
  const formatted = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
  if (showSign && value > 0) return '+' + formatted
  return formatted
}

export function formatMultiplier(value: number | null): string {
  if (value === null) return '—'
  return formatNumber(value, { decimals: value < 10 ? 1 : 0 }) + 'x'
}

export function formatDate(date: string | Date, options: { format?: 'full' | 'short' | 'time' | 'relative' } = {}): string {
  const { format = 'full' } = options
  const d = typeof date === 'string' ? new Date(date) : date
  switch (format) {
    case 'full': return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    case 'short': return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
    case 'time': return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    case 'relative': return getRelativeTime(d)
    default: return d.toISOString()
  }
}

// Internal helper - not exported
function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return diffMins + ' minute' + (diffMins === 1 ? '' : 's') + ' ago'
  if (diffHours < 24) return diffHours + ' hour' + (diffHours === 1 ? '' : 's') + ' ago'
  if (diffDays < 7) return diffDays + ' day' + (diffDays === 1 ? '' : 's') + ' ago'
  return formatDate(date, { format: 'full' })
}
