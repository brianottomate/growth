'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { validateWanderEmail } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Mail, Lock } from 'lucide-react'

interface PasswordLoginFormProps {
  redirectTo?: string
  className?: string
}

export function PasswordLoginForm({
  redirectTo = '/dashboard',
  className
}: PasswordLoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedEmail = email.trim().toLowerCase()

    // Validate @wander.com domain
    if (!validateWanderEmail(trimmedEmail)) {
      setError('Please use your @wander.com email address')
      return
    }

    if (!password) {
      setError('Please enter the password')
      return
    }

    setLoading(true)

    // Try to sign in first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: password,
    })

    if (signInError) {
      // If user doesn't exist, try to sign up
      if (signInError.message.includes('Invalid login credentials')) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: password,
          options: {
            emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
          },
        })

        if (signUpError) {
          console.error('Sign up error:', signUpError)
          setError('Failed to create account. Please try again.')
          setLoading(false)
          return
        }

        // Sign up successful - now sign in
        const { error: finalSignInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: password,
        })

        if (finalSignInError) {
          console.error('Sign in after signup error:', finalSignInError)
          setError('Account created. Please try signing in again.')
          setLoading(false)
          return
        }
      } else {
        console.error('Sign in error:', signInError)
        setError('Invalid email or password')
        setLoading(false)
        return
      }
    }

    // Success - redirect to dashboard
    router.push(redirectTo)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)} data-testid="password-login-form">
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

      {/* Password Input */}
      <div>
        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Lock className="h-5 w-5 text-text-muted" aria-hidden="true" />
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            data-testid="password-input"
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
        disabled={loading || !email.trim() || !password}
        data-testid="login-button"
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
          <span>Sign In</span>
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
