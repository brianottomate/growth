'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Menu, X, BarChart3, MessageCircle, Settings } from 'lucide-react'
import { UserMenu } from './UserMenu'
import { cn } from '@/lib/utils'

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const navItems = [
    { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ]

  return (
    <>
      {/* Mobile Header Bar - Only visible on mobile */}
      <div
        className={cn(
          'lg:hidden fixed top-0 left-0 right-0 h-14',
          'bg-bg-secondary border-b border-border',
          'flex items-center justify-between px-4',
          'z-40'
        )}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 text-text-muted hover:text-text-primary"
          aria-label="Open menu"
          data-testid="mobile-menu-button"
        >
          <Menu className="w-6 h-6" />
        </button>

        <div className="w-6 h-6 bg-accent-blue rounded flex items-center justify-center">
          <span className="text-white font-bold text-xs">W</span>
        </div>

        <UserMenu />
      </div>

      {/* Add padding for mobile header */}
      <div className="lg:hidden h-14" />

      {/* Backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'lg:hidden fixed top-0 left-0 h-full w-64',
          'bg-bg-secondary border-r border-border',
          'transform transition-transform duration-300 ease-out',
          'z-50',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="w-8 h-8 bg-accent-blue rounded flex items-center justify-center">
            <span className="text-white font-bold text-sm">W</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-text-muted hover:text-text-primary"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-2" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg',
                  'transition-colors duration-150',
                  isActive
                    ? 'bg-accent-blue/10 text-accent-blue font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}

          {/* Ask Claude */}
          <button
            onClick={() => {
              setIsOpen(false)
              // TODO: Open Ask Claude panel (Prompt 10)
              console.log('Ask Claude clicked')
            }}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-lg',
              'text-text-secondary hover:text-text-primary hover:bg-white/5',
              'transition-colors duration-150'
            )}
          >
            <MessageCircle className="w-5 h-5" />
            <span>Ask Claude</span>
          </button>
        </nav>
      </div>
    </>
  )
}
