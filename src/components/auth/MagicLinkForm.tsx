'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { validateWanderEmail } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Mail } from 'lucide-react'

interface MagicLinkFormProps {
  redirectTo?: string
  className?: string
}

export function MagicLinkForm({
  redirectTo = '/dashboard',
  className
}: MagicLinkFormProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedEmail = email.trim().toLowerCase()

    // Validate @wander.com domain before sending
    if (!validateWanderEmail(trimmedEmail)) {
      setError('Please use your @wander.com email address')
      return
    }

    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    })

    if (signInError) {
      console.error('Magic link error:', signInError)
      setError('Failed to send magic link. Please try again.')
      setLoading(false)
      return
    }

    // Redirect to login with success message
    router.push('/login?sent=true')
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)} data-testid="magic-link-form">
      {/* Email Input */}
      <div>
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Mail className="h-5 w-5 text-text-muted" aria-hidden="true" />
          </div>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@wander.com"
            data-testid="email-input"
            className={cn(
              'block w-full pl-10 pr-3 py-3 rounded-md',
              'bg-bg-secondary border border-border',
              'text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent',
              'transition-colors duration-150'
            )}
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-sm text-status-red" role="alert" data-testid="form-error">
          {error}
        </p>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading || !email.trim()}
        data-testid="magic-link-button"
        className={cn(
          'w-full flex items-center justify-center gap-2',
          'bg-accent-blue hover:bg-accent-blue-light text-white font-medium',
          'px-4 py-3 rounded-md',
          'transition-colors duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 focus:ring-offset-bg-card'
        )}
      >
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            <Mail className="w-5 h-5" />
            <span>Send Magic Link</span>
          </>
        )}
      </button>
    </form>
  )
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
