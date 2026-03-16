import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FixedCost, FixedCostCategory, ApiResponse } from '@/types'

interface FixedCostsResponse {
  costs: FixedCost[]
  totalMonthly: number
}

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<FixedCostsResponse>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  try {
    const { data: costs, error: fetchError } = await supabase
      .from('fixed_costs')
      .select('*')
      .order('category')

    if (fetchError) {
      console.error('Fixed costs fetch error:', fetchError)
      throw fetchError
    }

    const transformedCosts = (costs || []).map(transformCost)
    const totalMonthly = transformedCosts.reduce((sum, c) => sum + c.monthlyAmount, 0)

    return NextResponse.json<ApiResponse<FixedCostsResponse>>({
      data: {
        costs: transformedCosts,
        totalMonthly,
      },
    })
  } catch (error) {
    console.error('Fixed costs API error:', error)
    return NextResponse.json<ApiResponse<FixedCostsResponse>>(
      { error: { code: 'FETCH_ERROR', message: 'Failed to load fixed costs' } },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json<ApiResponse<FixedCost>>(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { category, partner, monthlyAmount } = body

    if (!category) {
      return NextResponse.json<ApiResponse<FixedCost>>(
        { error: { code: 'BAD_REQUEST', message: 'Category is required' } },
        { status: 400 }
      )
    }

    // Upsert (insert or update on conflict)
    const { data: cost, error: upsertError } = await supabase
      .from('fixed_costs')
      .upsert(
        {
          category,
          partner: partner || null,
          monthly_amount: monthlyAmount ?? 0,
          updated_by: user.id,
        },
        { onConflict: 'category' }
      )
      .select()
      .single()

    if (upsertError) {
      console.error('Fixed cost upsert error:', upsertError)
      throw upsertError
    }

    return NextResponse.json<ApiResponse<FixedCost>>({
      data: transformCost(cost),
    })
  } catch (error) {
    console.error('Fixed costs API error:', error)
    return NextResponse.json<ApiResponse<FixedCost>>(
      { error: { code: 'UPDATE_ERROR', message: 'Failed to save fixed cost' } },
      { status: 500 }
    )
  }
}

// Transform database row to FixedCost
function transformCost(row: Record<string, unknown>): FixedCost {
  return {
    id: row.id as string,
    category: row.category as FixedCostCategory,
    partner: row.partner as string | null,
    monthlyAmount: Number(row.monthly_amount) || 0,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string | null,
  }
}
