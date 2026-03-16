'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from './use-toast'
import type { UserSettings } from '@/types/settings'

interface UseSettingsResult {
  settings: UserSettings | null
  isLoading: boolean
  error: string | null
  updateSettings: (updates: Partial<UserSettings>) => Promise<void>
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  // Fetch settings on mount
  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch('/api/settings')
        const result = await response.json()

        if (result.error) {
          setError(result.error.message)
        } else {
          setSettings(result.data)
        }
      } catch {
        setError('Failed to load settings')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const updateSettings = useCallback(
    async (updates: Partial<UserSettings>) => {
      if (!settings) return

      // Optimistic update
      const previousSettings = settings
      setSettings({ ...settings, ...updates })

      try {
        const response = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })

        const result = await response.json()

        if (result.error) {
          // Rollback on error
          setSettings(previousSettings)
          toast.error(result.error.message)
        } else {
          setSettings(result.data)
          toast.success('Settings saved')
        }
      } catch {
        // Rollback on error
        setSettings(previousSettings)
        toast.error('Failed to save settings')
      }
    },
    [settings, toast]
  )

  return {
    settings,
    isLoading,
    error,
    updateSettings,
  }
}
