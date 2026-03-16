import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export { safeDiv, calculateMetrics } from './metrics'
export type { RawMetrics, CalculatedMetrics } from './metrics'
export { formatCurrency, formatNumber, formatPercent, formatMultiplier, formatDate } from './format'
