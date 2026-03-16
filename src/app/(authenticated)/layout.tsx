import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { DateRangeProvider } from '@/providers/DateRangeProvider'
import { AskClaudeProvider } from '@/context/AskClaudeContext'
import { AskClaudePanel } from '@/components/ask-claude/AskClaudePanel'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { MainContent } from '@/components/layout/MainContent'
import type { User } from '@/types'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/login')
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  // Map to User type - always use authUser as fallback for email
  const user: User = {
    id: authUser.id,
    email: profile?.email || authUser.email || '',
    name: profile?.name || authUser.user_metadata?.full_name || null,
    avatarUrl: profile?.avatar_url || authUser.user_metadata?.avatar_url || null,
    lastLogin: profile?.last_login || null,
    createdAt: profile?.created_at || authUser.created_at,
  }

  return (
    <AuthProvider initialUser={user as User}>
      <ToastProvider>
        <DateRangeProvider defaultRange="30">
          <AskClaudeProvider>
            <div className="min-h-screen bg-bg-primary flex">
              {/* Desktop Sidebar */}
              <Sidebar className="hidden lg:flex" />

              {/* Mobile Navigation */}
              <MobileNav />

              {/* Main Content - scrollable */}
              <MainContent>
                <Header user={user} />
                <main className="flex-1 p-6 overflow-y-auto">
                  {children}
                </main>
              </MainContent>

              {/* Ask Claude Panel - fixed right sidebar */}
              <AskClaudePanel />
            </div>
          </AskClaudeProvider>
        </DateRangeProvider>
      </ToastProvider>
    </AuthProvider>
  )
}
