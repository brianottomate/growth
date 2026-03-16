import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  validateWanderEmail,
  userProfileExists,
  createUserProfile,
  updateLastLogin,
} from '@/lib/auth'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Use env var for base URL - Railway proxy returns localhost as origin
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

  if (!code) {
    return NextResponse.redirect(
      new URL('/auth/error?reason=no_code', baseUrl)
    )
  }

  const supabase = await createClient()

  // Exchange code for session (OAuth/Magic Link callback — legacy path)
  const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !user || !user.email) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(
      new URL('/auth/error?reason=auth_failed', baseUrl)
    )
  }

  // CRITICAL: Validate @wander.com domain (defense in depth)
  // Defense in depth — also validated client-side before login
  if (!validateWanderEmail(user.email)) {
    // Sign out the user immediately - they shouldn't have a session
    await supabase.auth.signOut()

    console.warn(`Non-wander email attempted login: ${user.email}`)
    return NextResponse.redirect(
      new URL('/auth/error?reason=invalid_domain', baseUrl)
    )
  }

  // User has valid @wander.com email - create/update profile
  const serviceClient = createServiceClient()
  const exists = await userProfileExists(serviceClient, user.id)

  if (!exists) {
    // Create new user profile on first login
    const profile = await createUserProfile(serviceClient, {
      id: user.id,
      email: user.email,
      name: user.email.split('@')[0], // Use email prefix as display name
      avatarUrl: null,
    })

    if (!profile) {
      console.error('Failed to create user profile for:', user.id)
      return NextResponse.redirect(
        new URL('/auth/error?reason=profile_creation_failed', baseUrl)
      )
    }
  } else {
    // Update last login for existing user
    await updateLastLogin(serviceClient, user.id)
  }

  // Redirect to the intended destination
  const redirectUrl = new URL(next, baseUrl)
  return NextResponse.redirect(redirectUrl)
}
