import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all users who have logged in
  const serviceClient = createServiceClient()
  const { data: users, error } = await serviceClient
    .from('users')
    .select('email, name, last_login, created_at')
    .order('last_login', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  return NextResponse.json({ data: users })
}
