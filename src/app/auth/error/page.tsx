import Link from 'next/link'

interface AuthErrorPageProps {
  searchParams: Promise<{ reason?: string }>
}

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  invalid_domain: {
    title: 'Access Restricted',
    description: 'Wander Growth Tracker is only available to @wander.com employees. Please use your Wander email address.',
  },
  auth_failed: {
    title: 'Authentication Failed',
    description: 'We couldn\'t complete the sign-in process. The link may have expired. Please try again.',
  },
  no_code: {
    title: 'Invalid Request',
    description: 'The authentication request was invalid. Please try signing in again.',
  },
  profile_creation_failed: {
    title: 'Account Setup Failed',
    description: 'We couldn\'t set up your account. Please try again or contact support.',
  },
  default: {
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred. Please try again.',
  },
}

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const params = await searchParams
  const reason = params.reason || 'default'
  const error = ERROR_MESSAGES[reason] || ERROR_MESSAGES.default

  return (
    <main className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {/* Error Icon */}
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-status-red/10 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-status-red"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Error Card */}
        <div
          className="bg-bg-card border border-border rounded-lg p-8"
          data-testid="auth-error-card"
        >
          <h1
            className="text-2xl font-semibold text-text-primary mb-3"
            data-testid="auth-error-title"
          >
            {error.title}
          </h1>
          <p
            className="text-text-secondary mb-6"
            data-testid="auth-error-description"
          >
            {error.description}
          </p>

          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full bg-accent-blue hover:bg-accent-blue-light text-white font-medium px-4 py-2.5 rounded-md transition-colors duration-150"
            data-testid="try-again-button"
          >
            Try Again
          </Link>
        </div>

        {/* Help Text */}
        {reason === 'invalid_domain' && (
          <p className="mt-6 text-sm text-text-muted">
            If you believe you should have access, contact your Wander admin.
          </p>
        )}
      </div>
    </main>
  )
}
