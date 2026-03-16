import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { PasswordLoginForm } from '@/components/auth/PasswordLoginForm'

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams

  // Check if already authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect(params.next || '/dashboard')
  }

  return (
    <main className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4">
            <Image
              src="/wander-logo-login.png"
              alt="Wander"
              width={32}
              height={32}
              className="mx-auto"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            Growth Tracker
          </h1>
          <p className="text-text-secondary text-sm">
            Wander Marketing Performance Dashboard
          </p>
        </div>

        {/* Sign In Card */}
        <div
          className="bg-bg-card border border-border rounded-lg p-8"
          data-testid="login-card"
        >
          <h2 className="text-lg font-medium text-text-primary text-center mb-6">
            Sign in to continue
          </h2>

          {/* Error Message */}
          {params.error && (
            <div
              className="mb-6 p-4 bg-status-red/10 border border-status-red/20 rounded-md text-status-red text-sm"
              role="alert"
              data-testid="auth-error"
            >
              {params.error === 'auth_failed'
                ? 'Authentication failed. Please try again.'
                : params.error === 'invalid_domain'
                ? 'Please use your @wander.com email address.'
                : 'An error occurred. Please try again.'}
            </div>
          )}

          {/* Password Login Form */}
          <PasswordLoginForm redirectTo={params.next || '/dashboard'} />

          {/* Domain Notice */}
          <p className="mt-6 text-center text-xs text-text-muted">
            Access restricted to @wander.com employees
          </p>
        </div>
      </div>
    </main>
  )
}
