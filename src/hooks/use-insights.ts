'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDateRange } from '@/providers/DateRangeProvider'
import type { Insight } from '@/types'

interface UseInsightsResult {
  insights: Insight[] | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useInsights(): UseInsightsResult {
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { getDateRange } = useDateRange()

  const fetchInsights = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { start, end } = getDateRange()
      const url = `/api/insights?start=${start}&end=${end}`

      const response = await fetch(url)
      const result = await response.json()

      if (result.error) {
        setError(result.error.message)
        setInsights(null)
      } else {
        setInsights(result.data)
      }
    } catch {
      setError('Failed to fetch insights')
      setInsights(null)
    } finally {
      setIsLoading(false)
    }
  }, [getDateRange])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  // Re-fetch when data is refreshed
  useEffect(() => {
    const handler = () => fetchInsights()
    window.addEventListener('data-refreshed', handler)
    return () => window.removeEventListener('data-refreshed', handler)
  }, [fetchInsights])

  return {
    insights,
    isLoading,
    error,
    refetch: fetchInsights,
  }
}
