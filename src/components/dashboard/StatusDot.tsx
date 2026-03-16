import { cn } from '@/lib/utils'
import { CPB_TARGET } from '@/types'

type CPBStatus = 'good' | 'warning' | 'bad' | 'neutral'

interface StatusDotProps {
  cpb: number | null
  className?: string
}

function getCPBStatus(cpb: number | null): CPBStatus {
  if (cpb === null) return 'neutral'
  if (cpb < 400) return 'good'
  if (cpb <= CPB_TARGET) return 'warning'
  return 'bad'
}

const statusLabels: Record<CPBStatus, string> = {
  good: 'Below $400 - Excellent',
  warning: '$400-$500 - On target',
  bad: 'Above $500 - Over target',
  neutral: 'No data',
}

export function StatusDot({ cpb, className }: StatusDotProps) {
  const status = getCPBStatus(cpb)

  const statusColors: Record<CPBStatus, string> = {
    good: 'bg-status-green',
    warning: 'bg-status-yellow',
    bad: 'bg-status-red',
    neutral: 'bg-gray-500',
  }

  return (
    <div
      className={cn('w-2.5 h-2.5 rounded-full', statusColors[status], className)}
      title={statusLabels[status]}
      data-testid="status-dot"
      data-status={status}
    />
  )
}
