'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface SidebarIconProps {
  href?: string
  icon: LucideIcon
  label: string
  isActive?: boolean
  onClick?: () => void
}

export function SidebarIcon({
  href,
  icon: Icon,
  label,
  isActive = false,
  onClick,
}: SidebarIconProps) {
  const baseClasses = cn(
    'relative group',
    'w-10 h-10 rounded-md',
    'flex items-center justify-center',
    'transition-colors duration-150',
    'focus:outline-none focus:ring-2 focus:ring-accent-blue/50',
    isActive
      ? 'bg-accent-blue/10 text-accent-blue'
      : 'text-text-muted hover:text-text-primary hover:bg-white/5'
  )

  const content = (
    <>
      <Icon className="w-5 h-5" />
      {/* Tooltip */}
      <span
        className={cn(
          'absolute left-full ml-3 px-2 py-1',
          'bg-bg-card border border-border rounded-md shadow-lg',
          'text-xs text-text-primary whitespace-nowrap',
          'opacity-0 group-hover:opacity-100',
          'pointer-events-none',
          'transition-opacity duration-150',
          'z-50'
        )}
      >
        {label}
      </span>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={baseClasses}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        data-testid={`sidebar-icon-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      onClick={onClick}
      className={baseClasses}
      aria-label={label}
      data-testid={`sidebar-icon-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {content}
    </button>
  )
}
