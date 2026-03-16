'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { BarChart3, Settings, ShieldCheck, Calculator } from 'lucide-react'
import { SidebarIcon } from './SidebarIcon'
import { UserMenu } from './UserMenu'
import { AskClaudeTrigger } from '@/components/ask-claude/AskClaudeTrigger'
import { useTheme } from '@/providers/ThemeProvider'
import { cn } from '@/lib/utils'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full w-16',
        'bg-bg-secondary border-r border-border',
        'flex flex-col items-center py-4',
        'z-30',
        className
      )}
      data-testid="sidebar"
    >
      {/* Logo */}
      <div className="mb-6">
        <Image
          src={resolvedTheme === 'dark' ? '/wander-logo-dark.png' : '/wander-logo-light.png'}
          alt="Wander"
          width={24}
          height={24}
          className="rounded"
          priority
        />
      </div>

      {/* Navigation */}
      <nav className="flex flex-col items-center gap-2" aria-label="Main navigation">
        <SidebarIcon
          href="/dashboard"
          icon={BarChart3}
          label="Dashboard"
          isActive={pathname === '/dashboard'}
        />
        <SidebarIcon
          href="/validation"
          icon={ShieldCheck}
          label="Validation"
          isActive={pathname === '/validation'}
        />
        <SidebarIcon
          href="/methodology"
          icon={Calculator}
          label="Methodology"
          isActive={pathname === '/methodology'}
        />
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom Section */}
      <div className="flex flex-col items-center gap-2">
        {/* Ask Claude Trigger */}
        <AskClaudeTrigger />

        {/* Settings - Future */}
        <SidebarIcon
          href="/settings"
          icon={Settings}
          label="Settings"
          isActive={pathname.startsWith('/settings')}
        />

        {/* User Menu */}
        <UserMenu />
      </div>
    </aside>
  )
}
