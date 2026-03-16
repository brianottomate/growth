'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { cn } from '@/lib/utils'
import { LogOut } from 'lucide-react'

interface SignOutButtonProps {
  className?: string
  showLabel?: boolean
  variant?: 'default' | 'ghost' | 'icon'
}

export function SignOutButton({
  className,
  showLabel = true,
  variant = 'default'
}: SignOutButtonProps) {
  const [loading, setLoading] = useState(false)
  const { signOut } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    setLoading(true)
    await signOut()
    router.push('/login')
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      data-testid="signout-button"
      title="Sign out"
      className={cn(
        'flex items-center gap-2 font-medium transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus:outline-none focus:ring-2 focus:ring-accent-blue/50',
        variant === 'default' && [
          'bg-transparent hover:bg-white/5 text-text-secondary hover:text-text-primary',
          'px-3 py-2 rounded-md text-sm',
        ],
        variant === 'ghost' && [
          'text-text-muted hover:text-text-primary',
          'p-2 rounded-md',
        ],
        variant === 'icon' && [
          'text-text-muted hover:text-text-primary hover:bg-white/5',
          'p-2 rounded-md',
        ],
        className
      )}
    >
      <LogOut className="w-4 h-4" />
      {showLabel && variant !== 'icon' && (
        <span>{loading ? 'Signing out...' : 'Sign out'}</span>
      )}
    </button>
  )
}
