'use client'

import { cn } from '@/lib/utils'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  description,
}: ToggleProps) {
  return (
    <label
      className={cn(
        'flex items-center justify-between gap-4 cursor-pointer',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="flex-1">
        {label && (
          <span className="text-sm font-medium text-text-primary">{label}</span>
        )}
        {description && (
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          checked ? 'bg-accent-blue' : 'bg-white/10'
        )}
        data-testid={label ? `toggle-${label.toLowerCase().replace(/\s+/g, '-')}` : 'toggle'}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </label>
  )
}
