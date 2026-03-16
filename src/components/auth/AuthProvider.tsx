'use client'

import { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User as AuthUser } from '@supabase/supabase-js'
import type { User } from '@/types'

interface AuthContextType {
  authUser: AuthUser | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  authUser: null,
  user: null,
  loading: true,
  signOut: async () => {},
})

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
  initialUser?: User | null
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [user, setUser] = useState<User | null>(initialUser)
  const [loading, setLoading] = useState(!initialUser)

  // Track if we've attempted to fetch user profile (prevents infinite loop)
  const userFetchAttemptedRef = useRef(!!initialUser)

  // Memoize Supabase client to prevent recreation on each render
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    // Get initial auth state
    const getInitialSession = async () => {
      const { data: { user: authUserData } } = await supabase.auth.getUser()
      setAuthUser(authUserData)

      if (authUserData && !userFetchAttemptedRef.current) {
        userFetchAttemptedRef.current = true
        // Fetch user profile if we have auth but haven't fetched yet
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUserData.id)
          .single()

        if (data && !error) {
          setUser({
            id: data.id,
            email: data.email,
            name: data.name,
            avatarUrl: data.avatar_url,
            lastLogin: data.last_login,
            createdAt: data.created_at,
          })
        }
      }

      setLoading(false)
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setAuthUser(session?.user ?? null)

        if (event === 'SIGNED_OUT') {
          setUser(null)
          userFetchAttemptedRef.current = false
        } else if (event === 'SIGNED_IN' && session?.user && !userFetchAttemptedRef.current) {
          userFetchAttemptedRef.current = true
          // Fetch user profile on sign in
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single()

          if (data && !error) {
            setUser({
              id: data.id,
              email: data.email,
              name: data.name,
              avatarUrl: data.avatar_url,
              lastLogin: data.last_login,
              createdAt: data.created_at,
            })
          }
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  const signOut = async () => {
    setLoading(true)
    await fetch('/api/auth/signout', { method: 'POST' })
    setAuthUser(null)
    setUser(null)
    setLoading(false)
    // Redirect handled by the calling component
  }

  const value = useMemo(
    () => ({ authUser, user, loading, signOut }),
    [authUser, user, loading]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
