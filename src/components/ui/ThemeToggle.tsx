'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/providers/ThemeProvider'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
        resolvedTheme === 'dark'
          ? 'hover:bg-white/5 text-text-secondary hover:text-text-primary'
          : 'hover:bg-black/5 text-text-secondary hover:text-text-primary',
        className
      )}
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      data-testid="theme-toggle"
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </button>
  )
}
