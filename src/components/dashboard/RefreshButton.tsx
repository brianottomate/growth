'use client'

import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RefreshButtonProps {
  isRefreshing: boolean
  onRefresh: () => void
  className?: string
}

export function RefreshButton({
  isRefreshing,
  onRefresh,
  className,
}: RefreshButtonProps) {
  return (
    <button
      onClick={onRefresh}
      disabled={isRefreshing}
      className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center',
        'bg-white/5 hover:bg-white/10 transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      aria-label={isRefreshing ? 'Refreshing data...' : 'Refresh data'}
      data-testid="refresh-button"
    >
      <RefreshCw
        className={cn('w-4 h-4 text-text-secondary', isRefreshing && 'animate-spin')}
      />
    </button>
  )
}
