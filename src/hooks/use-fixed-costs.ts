'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from './use-toast'
import type { FixedCost, FixedCostCategory } from '@/types'

interface UseFixedCostsResult {
  costs: FixedCost[]
  totalMonthly: number
  isLoading: boolean
  error: string | null
  updateCost: (category: FixedCostCategory, partner: string | null, monthlyAmount: number) => Promise<void>
  refreshCosts: () => Promise<void>
}

export function useFixedCosts(): UseFixedCostsResult {
  const [costs, setCosts] = useState<FixedCost[]>([])
  const [totalMonthly, setTotalMonthly] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const fetchCosts = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/settings/fixed-costs')
      const result = await response.json()

      if (result.error) {
        setError(result.error.message)
      } else {
        setCosts(result.data.costs)
        setTotalMonthly(result.data.totalMonthly)
        setError(null)
      }
    } catch {
      setError('Failed to load fixed costs')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch costs on mount
  useEffect(() => {
    fetchCosts()
  }, [fetchCosts])

  const updateCost = useCallback(
    async (category: FixedCostCategory, partner: string | null, monthlyAmount: number) => {
      // Optimistic update
      const previousCosts = costs
      const previousTotal = totalMonthly

      const existingIndex = costs.findIndex((c) => c.category === category)
      const updatedCosts = [...costs]

      if (existingIndex >= 0) {
        updatedCosts[existingIndex] = {
          ...updatedCosts[existingIndex],
          partner,
          monthlyAmount,
          updatedAt: new Date().toISOString(),
        }
      } else {
        updatedCosts.push({
          id: `temp-${category}`,
          category,
          partner,
          monthlyAmount,
          updatedAt: new Date().toISOString(),
          updatedBy: null,
        })
      }

      setCosts(updatedCosts)
      setTotalMonthly(updatedCosts.reduce((sum, c) => sum + c.monthlyAmount, 0))

      try {
        const response = await fetch('/api/settings/fixed-costs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, partner, monthlyAmount }),
        })

        const result = await response.json()

        if (result.error) {
          // Rollback on error
          setCosts(previousCosts)
          setTotalMonthly(previousTotal)
          toast.error(result.error.message)
        } else {
          // Refresh to get the actual data
          await fetchCosts()
          toast.success('Fixed cost saved')
        }
      } catch {
        // Rollback on error
        setCosts(previousCosts)
        setTotalMonthly(previousTotal)
        toast.error('Failed to save fixed cost')
      }
    },
    [costs, totalMonthly, fetchCosts, toast]
  )

  return {
    costs,
    totalMonthly,
    isLoading,
    error,
    updateCost,
    refreshCosts: fetchCosts,
  }
}
