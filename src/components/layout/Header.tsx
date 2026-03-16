'use client'

import { useMemo } from 'react'
import { RefreshCw, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RefreshStatus } from '@/components/dashboard/RefreshStatus'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useRefresh } from '@/hooks/use-refresh'
import { useDateRange } from '@/providers/DateRangeProvider'
import { DATE_RANGE_OPTIONS, type DateRangeOption } from '@/types/settings'
import type { User } from '@/types'

interface HeaderProps {
  user: User | null
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function toTitleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function getFirstName(user: User | null): string {
  if (!user) return ''
  if (user.name) {
    return toTitleCase(user.name.split(' ')[0])
  }
  return toTitleCase(user.email.split('@')[0])
}

export function Header({ user }: HeaderProps) {
  const greeting = getGreeting()
  const firstName = getFirstName(user)
  const { isRefreshing, refresh } = useRefresh()
  const { dateRange, setDateRange, customStart, customEnd, setCustomStart, setCustomEnd, getDateRange } = useDateRange()

  // Show the selected period's date range
  const selectedDateRange = useMemo(() => {
    const { start, end } = getDateRange()
    return { start, end }
  }, [getDateRange])

  return (
    <header
      className={cn(
        'h-auto min-h-[4rem] bg-bg-secondary border-b border-border',
        'flex items-center justify-between px-6 py-3',
        'sticky top-0 z-20'
      )}
      data-testid="header"
    >
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">
          {greeting}, {firstName}
        </h1>
        <p className="text-sm text-text-muted">
          Welcome to Growth Tracker
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Date Range Selector */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRangeOption)}
            className={cn(
              'pl-9 pr-3 py-2 rounded-md appearance-none',
              'bg-transparent hover:bg-white/5',
              'text-text-secondary hover:text-text-primary',
              'border border-border hover:border-border-light',
              'text-sm font-medium',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-accent-blue/50',
              'cursor-pointer'
            )}
            data-testid="date-range-selector"
          >
            {DATE_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Date Inputs — visible only when "Custom Range" is selected */}
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className={cn(
                'px-2 py-1.5 rounded-md',
                'bg-transparent hover:bg-white/5',
                'text-text-secondary text-sm',
                'border border-border hover:border-border-light',
                'focus:outline-none focus:ring-2 focus:ring-accent-blue/50',
              )}
            />
            <span className="text-text-muted text-sm">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className={cn(
                'px-2 py-1.5 rounded-md',
                'bg-transparent hover:bg-white/5',
                'text-text-secondary text-sm',
                'border border-border hover:border-border-light',
                'focus:outline-none focus:ring-2 focus:ring-accent-blue/50',
              )}
            />
          </div>
        )}

        {/* Data Range */}
        <RefreshStatus dateRange={selectedDateRange} />

        {/* Refresh Button */}
        <button
          onClick={refresh}
          disabled={isRefreshing}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md',
            'bg-transparent hover:bg-white/5',
            'text-text-secondary hover:text-text-primary',
            'border border-border hover:border-border-light',
            'text-sm font-medium',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-accent-blue/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          data-testid="refresh-button"
          aria-label={isRefreshing ? 'Refreshing data...' : 'Refresh data'}
        >
          <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>

        {/* Theme Toggle */}
        <ThemeToggle />
      </div>
    </header>
  )
}
