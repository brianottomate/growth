'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { DateRangeOption } from '@/types/settings'

// Extended to include 'all' for all-time data
export type ExtendedDateRangeOption = DateRangeOption | 'all'

interface DateRangeContextType {
  dateRange: ExtendedDateRangeOption
  setDateRange: (range: ExtendedDateRangeOption) => void
  getDays: () => number | null // null means all time (backward compat)
  getDateRange: () => { start: string; end: string }
  customStart: string
  customEnd: string
  setCustomStart: (date: string) => void
  setCustomEnd: (date: string) => void
}

const DateRangeContext = createContext<DateRangeContextType | null>(null)

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

interface DateRangeProviderProps {
  children: ReactNode
  defaultRange?: ExtendedDateRangeOption
}

export function DateRangeProvider({ children, defaultRange = '30' }: DateRangeProviderProps) {
  const [dateRange, setDateRange] = useState<ExtendedDateRangeOption>(defaultRange)

  // Default custom range to current month
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const [customStart, setCustomStart] = useState(monthStart)
  const [customEnd, setCustomEnd] = useState(formatDate(now))

  const getDays = useCallback(() => {
    if (dateRange === 'all') return null
    if (dateRange === 'mtd' || dateRange === 'custom') return null
    return parseInt(dateRange, 10)
  }, [dateRange])

  const getDateRange = useCallback((): { start: string; end: string } => {
    const today = new Date()
    const end = formatDate(today)

    if (dateRange === 'mtd') {
      const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
      return { start, end }
    }

    if (dateRange === 'custom') {
      return { start: customStart, end: customEnd }
    }

    if (dateRange === 'all') {
      // Use a very early date for "all time"
      return { start: '2020-01-01', end }
    }

    // Numeric presets
    const days = parseInt(dateRange, 10)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    return { start: formatDate(startDate), end }
  }, [dateRange, customStart, customEnd])

  return (
    <DateRangeContext.Provider value={{
      dateRange,
      setDateRange,
      getDays,
      getDateRange,
      customStart,
      customEnd,
      setCustomStart,
      setCustomEnd,
    }}>
      {children}
    </DateRangeContext.Provider>
  )
}

export function useDateRange() {
  const context = useContext(DateRangeContext)
  if (!context) {
    throw new Error('useDateRange must be used within a DateRangeProvider')
  }
  return context
}
