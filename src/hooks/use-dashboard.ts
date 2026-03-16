'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDateRange } from '@/providers/DateRangeProvider'
import type { DashboardSummary } from '@/types'

interface UseDashboardResult {
  data: DashboardSummary | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useDashboard(): UseDashboardResult {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { getDateRange } = useDateRange()

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { start, end } = getDateRange()
      const url = `/api/dashboard?start=${start}&end=${end}`

      const response = await fetch(url)
      const result = await response.json()

      if (result.error) {
        setError(result.error.message)
        setData(null)
      } else {
        setData(result.data)
      }
    } catch {
      setError('Failed to fetch dashboard data')
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [getDateRange])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // Re-fetch when data is refreshed
  useEffect(() => {
    const handler = () => fetchDashboard()
    window.addEventListener('data-refreshed', handler)
    return () => window.removeEventListener('data-refreshed', handler)
  }, [fetchDashboard])

  return {
    data,
    isLoading,
    error,
    refetch: fetchDashboard,
  }
}
