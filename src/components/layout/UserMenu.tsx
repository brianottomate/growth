'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { LogOut, User as UserIcon } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthProvider'
import { cn } from '@/lib/utils'

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { user, signOut } = useAuth()
  const router = useRouter()

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    setIsOpen(false)
    await signOut()
    router.push('/login')
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-10 h-10 rounded-full',
          'flex items-center justify-center',
          'bg-bg-card border border-border',
          'hover:border-border-light',
          'transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-accent-blue/50'
        )}
        aria-label="User menu"
        aria-expanded={isOpen}
        data-testid="user-menu-button"
      >
        {user?.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={user.name || 'User avatar'}
            width={32}
            height={32}
            className="rounded-full object-cover"
          />
        ) : (
          <UserIcon className="w-5 h-5 text-text-muted" />
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute bottom-0 left-full ml-2',
            'w-48 py-1',
            'bg-bg-card border border-border rounded-lg shadow-lg',
            'z-50'
          )}
          data-testid="user-menu-dropdown"
        >
          {/* User Info */}
          <div className="px-3 py-2 border-b border-border">
            <p className="text-sm font-medium text-text-primary truncate">
              {user?.name || 'User'}
            </p>
            <p className="text-xs text-text-muted truncate">
              {user?.email}
            </p>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2',
              'text-sm text-text-secondary hover:text-text-primary',
              'hover:bg-white/5',
              'transition-colors duration-150'
            )}
            data-testid="signout-menu-item"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  )
}
