'use client'

import { cn } from '@/lib/utils'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  label?: string
  disabled?: boolean
  className?: string
}

export function Select({
  value,
  onChange,
  options,
  label,
  disabled = false,
  className,
}: SelectProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {label && (
        <span className="text-sm font-medium text-text-primary">{label}</span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'bg-bg-secondary border border-border rounded-lg px-4 py-2',
          'text-sm text-text-primary',
          'focus:outline-none focus:border-accent-blue',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'min-w-[180px]'
        )}
        data-testid={label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : 'select'}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
