'use client'

interface RefreshStatusProps {
  dateRange: { start: string; end: string } | null
  className?: string
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function RefreshStatus({ dateRange, className }: RefreshStatusProps) {
  if (!dateRange) {
    return (
      <span className={className} data-testid="refresh-status">
        <span className="text-xs text-text-muted">Loading data...</span>
      </span>
    )
  }

  return (
    <span className={className} data-testid="refresh-status">
      <span className="text-xs text-text-muted">
        Data: {formatDateShort(dateRange.start)} – {formatDateShort(dateRange.end)}
      </span>
    </span>
  )
}
