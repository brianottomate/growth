import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Create a Supabase client for use in Server Components, Route Handlers, and Server Actions
 * This client respects RLS policies based on the user's session from cookies
 *
 * IMPORTANT: Next.js 15 requires cookies() to be awaited
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

/**
 * Create a Supabase client with service role for admin operations
 * This bypasses RLS - use only for cron jobs, webhooks, and admin operations
 * NEVER expose this client to the browser
 */
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// Alias for consistency with established patterns
export { createServiceClient as createAdminClient }
