'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useToast } from './use-toast'
import type { SyncLog } from '@/types'

interface UseRefreshResult {
  isRefreshing: boolean
  lastSync: SyncLog | null
  lastUpdated: string | null
  dateRange: { start: string; end: string } | null
  refresh: () => Promise<void>
}

export function useRefresh(): UseRefreshResult {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastSync, setLastSync] = useState<SyncLog | null>(null)
  const [latestDataDate, setLatestDataDate] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null)
  const toast = useToast()

  // Use ref to access isRefreshing in callback without causing re-renders
  const isRefreshingRef = useRef(isRefreshing)
  useEffect(() => {
    isRefreshingRef.current = isRefreshing
  }, [isRefreshing])

  // Fetch initial status
  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/refresh/status')
        const result = await response.json()

        if (result.data?.lastSync) {
          setLastSync(result.data.lastSync)
        }
        if (result.data?.latestDataDate) {
          setLatestDataDate(result.data.latestDataDate)
        }
        if (result.data?.dateRange) {
          setDateRange(result.data.dateRange)
        }
      } catch {
        // Silent fail on initial load
      }
    }

    fetchStatus()
  }, [])

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) return

    setIsRefreshing(true)

    try {
      const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await response.json()

      if (result.error) {
        toast.error(result.error.message || 'Failed to refresh data')
      } else if (result.data) {
        setLastSync(result.data.syncLog)
        toast.success(result.data.message || 'Data refreshed successfully')
        // Dispatch event so dashboard hooks refetch without a full reload
        window.dispatchEvent(new Event('data-refreshed'))
      }
    } catch {
      toast.error('Failed to refresh data. Please try again.')
    } finally {
      setIsRefreshing(false)
    }
  }, [toast])

  const lastUpdated = lastSync?.completedAt ?? lastSync?.startedAt ?? latestDataDate ?? null

  return {
    isRefreshing,
    lastSync,
    lastUpdated,
    dateRange,
    refresh,
  }
}
