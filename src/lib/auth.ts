import type { User } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ALLOWED_DOMAIN } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>

/**
 * Validate that an email is from the @wander.com domain
 * This is the primary security check - called before password login/signup
 */
export function validateWanderEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return domain === ALLOWED_DOMAIN
}

/**
 * Get the current authenticated user from Supabase Auth
 * Returns null if not authenticated
 */
export async function getAuthUser(supabase: AnySupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

/**
 * Get the current user's profile from the users table
 * Returns null if not found
 */
export async function getUserProfile(
  supabase: AnySupabaseClient
): Promise<User | null> {
  const authUser = await getAuthUser(supabase)

  if (!authUser) {
    return null
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (error || !data) {
    return null
  }

  // Map database columns to User type
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    avatarUrl: data.avatar_url,
    lastLogin: data.last_login,
    createdAt: data.created_at,
  }
}

/**
 * Create a new user profile after first sign-in (auto-signup)
 * CRITICAL: Sets id = authUser.id to match auth.uid() for RLS
 */
export async function createUserProfile(
  supabase: AnySupabaseClient,
  authUser: {
    id: string
    email: string
    name?: string | null
    avatarUrl?: string | null
  }
): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      id: authUser.id,  // CRITICAL: Must equal auth.uid()
      email: authUser.email,
      name: authUser.name || null,
      avatar_url: authUser.avatarUrl || null,
      last_login: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating user profile:', error)
    return null
  }

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    avatarUrl: data.avatar_url,
    lastLogin: data.last_login,
    createdAt: data.created_at,
  }
}

/**
 * Update user's last_login timestamp
 */
export async function updateLastLogin(
  supabase: AnySupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', userId)
}

/**
 * Check if user profile exists
 */
export async function userProfileExists(
  supabase: AnySupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single()

  return !error && !!data
}
