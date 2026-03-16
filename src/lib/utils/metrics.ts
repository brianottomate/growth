// src/lib/utils/metrics.ts

import { BLENDED_TAKE_RATE } from '@/types'

export function safeDiv(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null
  return numerator / denominator
}

export interface RawMetrics {
  spend: number | null
  accountCreations: number | null
  checkoutPreviewed: number | null
  checkoutStarted: number | null
  bookings: number | null
  gmv: number | null
  takeRateRevenue: number | null
}

export interface CalculatedMetrics {
  cpac: number | null
  cpcp: number | null
  cpc: number | null
  cpb: number | null
  roas: number | null
}

export function calculateMetrics(raw: RawMetrics): CalculatedMetrics {
  // ROAS = (GMV × 20% blended take rate) / spend (Kyle/Drayton, March 2026)
  const estimatedRevenue = raw.gmv !== null ? raw.gmv * BLENDED_TAKE_RATE : null
  return {
    cpac: safeDiv(raw.spend, raw.accountCreations),
    cpcp: safeDiv(raw.spend, raw.checkoutPreviewed),
    cpc: safeDiv(raw.spend, raw.checkoutStarted),
    cpb: safeDiv(raw.spend, raw.bookings),
    roas: safeDiv(estimatedRevenue, raw.spend),
  }
}
