import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Routes that don't require authentication
const publicRoutes = [
  '/login',
  '/auth/callback',
  '/auth/error',
]

// Routes that should never be protected (webhooks, cron)
const alwaysPublicPrefixes = [
  '/api/webhooks/',
  '/api/cron/',
  '/api/refresh/cron',
  '/api/digest/cron',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if route is always public (webhooks, cron)
  if (alwaysPublicPrefixes.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  // Update Supabase session with error handling
  let user = null
  let supabaseResponse = NextResponse.next()

  try {
    const result = await updateSession(request)
    user = result.user
    supabaseResponse = result.supabaseResponse
  } catch (error) {
    console.error('Middleware session update error:', error)
    // Continue without user - will redirect to login if protected route
  }

  // Check if route is public
  const isPublicRoute = publicRoutes.includes(pathname)

  // If not authenticated and trying to access protected route
  if (!user && !isPublicRoute) {
    // For API routes, return 401 instead of redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }

    const redirectUrl = new URL('/login', request.url)
    // Store the original URL to redirect back after login
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If authenticated and trying to access login page, redirect to dashboard
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
