'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDateRange } from '@/providers/DateRangeProvider'
import type { ChannelMetrics } from '@/types'

interface UseChannelsResult {
  channels: ChannelMetrics[] | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useChannels(): UseChannelsResult {
  const [channels, setChannels] = useState<ChannelMetrics[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { getDateRange } = useDateRange()

  const fetchChannels = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { start, end } = getDateRange()
      const url = `/api/channels?start=${start}&end=${end}`

      const response = await fetch(url)
      const result = await response.json()

      if (result.error) {
        setError(result.error.message)
        setChannels(null)
      } else {
        setChannels(result.data)
      }
    } catch {
      setError('Failed to fetch channel data')
      setChannels(null)
    } finally {
      setIsLoading(false)
    }
  }, [getDateRange])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  // Re-fetch when data is refreshed
  useEffect(() => {
    const handler = () => fetchChannels()
    window.addEventListener('data-refreshed', handler)
    return () => window.removeEventListener('data-refreshed', handler)
  }, [fetchChannels])

  return {
    channels,
    isLoading,
    error,
    refetch: fetchChannels,
  }
}
