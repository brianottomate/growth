'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDateRange } from '@/providers/DateRangeProvider'
import type { TrendData } from '@/types'

interface UseTrendsOptions {
  metric?: string
}

interface UseTrendsResult {
  trends: TrendData | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useTrends(options: UseTrendsOptions = {}): UseTrendsResult {
  const { metric = 'spend' } = options
  const { getDateRange } = useDateRange()

  const [trends, setTrends] = useState<TrendData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTrends = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { start, end } = getDateRange()
      const params = new URLSearchParams({ metric, start, end })

      const response = await fetch(`/api/trends?${params}`)
      const result = await response.json()

      if (result.error) {
        setError(result.error.message)
        setTrends(null)
      } else {
        setTrends(result.data)
      }
    } catch {
      setError('Failed to fetch trend data')
      setTrends(null)
    } finally {
      setIsLoading(false)
    }
  }, [metric, getDateRange])

  useEffect(() => {
    fetchTrends()
  }, [fetchTrends])

  // Re-fetch when data is refreshed
  useEffect(() => {
    const handler = () => fetchTrends()
    window.addEventListener('data-refreshed', handler)
    return () => window.removeEventListener('data-refreshed', handler)
  }, [fetchTrends])

  return {
    trends,
    isLoading,
    error,
    refetch: fetchTrends,
  }
}
