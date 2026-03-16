'use client'

import { Monitor, Sun, Moon } from 'lucide-react'
import { SettingsSection } from './SettingsSection'
import { useTheme } from '@/providers/ThemeProvider'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark' | 'system'

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function AppearanceSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  return (
    <SettingsSection title="Appearance">
      <div className="space-y-3">
        <p className="text-sm text-text-secondary mb-4">
          Choose your preferred theme
        </p>

        <div className="flex gap-3">
          {themeOptions.map((option) => {
            const isSelected = theme === option.value
            const Icon = option.icon

            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                  isSelected
                    ? 'border-accent-blue bg-accent-blue/10'
                    : 'border-border hover:border-text-muted'
                )}
                data-testid={`theme-option-${option.value}`}
              >
                <Icon
                  className={cn(
                    'w-6 h-6',
                    isSelected ? 'text-accent-blue' : 'text-text-secondary'
                  )}
                />
                <span
                  className={cn(
                    'text-sm font-medium',
                    isSelected ? 'text-accent-blue' : 'text-text-primary'
                  )}
                >
                  {option.label}
                </span>
              </button>
            )
          })}
        </div>

        {theme === 'system' && (
          <p className="text-xs text-text-muted mt-2">
            Currently using {resolvedTheme} mode based on your system preference
          </p>
        )}
      </div>
    </SettingsSection>
  )
}
