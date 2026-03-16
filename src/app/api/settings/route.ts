import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { UserSettings } from '@/types/settings'
import type { ApiResponse } from '@/types'

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<UserSettings>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  try {
    // Fetch existing settings
    const { data: settings, error: fetchError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Settings fetch error:', fetchError)
      throw fetchError
    }

    // If no settings exist, create defaults
    if (!settings) {
      const { data: newSettings, error: insertError } = await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          ...DEFAULT_SETTINGS,
        })
        .select()
        .single()

      if (insertError) {
        console.error('Settings insert error:', insertError)
        throw insertError
      }

      return NextResponse.json<ApiResponse<UserSettings>>({
        data: transformSettings(newSettings, user.id),
      })
    }

    return NextResponse.json<ApiResponse<UserSettings>>({
      data: transformSettings(settings, user.id),
    })
  } catch (error) {
    console.error('Settings API error:', error)
    return NextResponse.json<ApiResponse<UserSettings>>(
      { error: { code: 'FETCH_ERROR', message: 'Failed to load settings' } },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<UserSettings>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()

    // Map camelCase to snake_case for database
    const updates: Record<string, unknown> = {}
    if (body.emailInsightsDigest !== undefined) {
      updates.email_insights_digest = body.emailInsightsDigest
    }
    if (body.emailCpbAlert !== undefined) {
      updates.email_cpb_alert = body.emailCpbAlert
    }
    if (body.defaultDateRange !== undefined) {
      updates.default_date_range = body.defaultDateRange
    }
    if (body.autoRefreshInterval !== undefined) {
      updates.auto_refresh_interval = body.autoRefreshInterval
    }

    const { data: settings, error: updateError } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('Settings update error:', updateError)
      throw updateError
    }

    return NextResponse.json<ApiResponse<UserSettings>>({
      data: transformSettings(settings, user.id),
    })
  } catch (error) {
    console.error('Settings API error:', error)
    return NextResponse.json<ApiResponse<UserSettings>>(
      { error: { code: 'UPDATE_ERROR', message: 'Failed to save settings' } },
      { status: 500 }
    )
  }
}

// Transform database row to UserSettings
function transformSettings(row: Record<string, unknown>, userId: string): UserSettings {
  return {
    userId,
    emailInsightsDigest: row.email_insights_digest as boolean,
    emailCpbAlert: row.email_cpb_alert as boolean,
    defaultDateRange: row.default_date_range as UserSettings['defaultDateRange'],
    autoRefreshInterval: row.auto_refresh_interval as UserSettings['autoRefreshInterval'],
    updatedAt: row.updated_at as string,
  }
}
