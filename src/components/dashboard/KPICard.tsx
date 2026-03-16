import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type KPIStatus = 'default' | 'good' | 'warning' | 'bad'
export type ChangeDirection = 'up' | 'down' | 'flat'

interface KPICardProps {
  label: string
  value: string
  sublabel?: string
  change?: {
    value: number
    direction: ChangeDirection
    label?: string
  }
  status?: KPIStatus
  size?: 'default' | 'large'
  className?: string
}

export function KPICard({
  label,
  value,
  sublabel,
  change,
  status = 'default',
  size = 'default',
  className,
}: KPICardProps) {
  const statusColors: Record<KPIStatus, string> = {
    default: 'text-text-primary',
    good: 'text-status-green',
    warning: 'text-status-yellow',
    bad: 'text-status-red',
  }

  const changeColors: Record<ChangeDirection, string> = {
    up: 'bg-green-500/10 text-green-400',
    down: 'bg-red-500/10 text-red-400',
    flat: 'bg-white/5 text-text-secondary',
  }

  const ChangeIcon = {
    up: TrendingUp,
    down: TrendingDown,
    flat: Minus,
  }[change?.direction || 'flat']

  return (
    <div
      className={cn(
        'bg-bg-card border border-border rounded-lg',
        size === 'large' ? 'p-6' : 'p-5',
        className
      )}
      data-testid={`kpi-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {/* Label */}
      <p className="text-sm text-text-muted uppercase tracking-wide mb-2">
        {label}
      </p>

      {/* Value */}
      <p
        className={cn(
          'font-mono font-bold',
          size === 'large' ? 'text-3xl' : 'text-2xl',
          statusColors[status]
        )}
      >
        {value}
      </p>

      {/* Sublabel */}
      {sublabel && (
        <p className="text-xs text-text-muted mt-1">{sublabel}</p>
      )}

      {/* Change Indicator */}
      {change && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded',
              changeColors[change.direction]
            )}
          >
            <ChangeIcon className="w-3 h-3" />
            <span>
              {change.direction === 'up' ? '+' : change.direction === 'down' ? '' : ''}
              {change.value.toFixed(1)}%
            </span>
          </span>
          {change.label && (
            <span className="text-xs text-text-muted">{change.label}</span>
          )}
        </div>
      )}
    </div>
  )
}
