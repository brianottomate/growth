'use client'

import { useState } from 'react'
import { DollarSign, Info } from 'lucide-react'
import { SettingsSection } from './SettingsSection'
import { cn } from '@/lib/utils'
import { FIXED_COST_LABELS } from '@/types'
import type { FixedCost, FixedCostCategory } from '@/types'

interface FixedCostsSettingsProps {
  costs: FixedCost[]
  totalMonthly: number
  isLoading: boolean
  onUpdate: (category: FixedCostCategory, partner: string | null, amount: number) => Promise<void>
}

// Default categories with partners
const FIXED_COST_DEFAULTS: Array<{
  category: FixedCostCategory
  partner: string
}> = [
  { category: 'tv_linear', partner: 'Comcast' },
  { category: 'tv_streaming', partner: '' },
  { category: 'lifecycle', partner: 'Customer.io' },
  { category: 'demand_sales', partner: 'BDRs' },
  { category: 'direct_mail', partner: 'PebblePost' },
  { category: 'affiliate', partner: 'Acceleration Partners' },
  { category: 'seo', partner: 'Digitaloft' },
  { category: 'events', partner: '' },
  { category: 'content', partner: '' },
  { category: 'other', partner: '' },
]

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

interface CostRowProps {
  category: FixedCostCategory
  defaultPartner: string
  cost: FixedCost | undefined
  onUpdate: (category: FixedCostCategory, partner: string | null, amount: number) => Promise<void>
  disabled: boolean
}

function CostRow({ category, defaultPartner, cost, onUpdate, disabled }: CostRowProps) {
  const [amount, setAmount] = useState<string>(
    cost?.monthlyAmount ? cost.monthlyAmount.toString() : ''
  )
  const [partner, setPartner] = useState<string>(
    cost?.partner ?? defaultPartner
  )
  const [isSaving, setIsSaving] = useState(false)

  const handleAmountBlur = async () => {
    const numAmount = parseFloat(amount) || 0
    const currentAmount = cost?.monthlyAmount ?? 0
    const currentPartner = cost?.partner ?? defaultPartner

    // Only save if changed
    if (numAmount !== currentAmount || partner !== currentPartner) {
      setIsSaving(true)
      await onUpdate(category, partner || null, numAmount)
      setIsSaving(false)
    }
  }

  const handlePartnerBlur = async () => {
    const numAmount = parseFloat(amount) || 0
    const currentAmount = cost?.monthlyAmount ?? 0
    const currentPartner = cost?.partner ?? defaultPartner

    // Only save if changed
    if (numAmount !== currentAmount || partner !== currentPartner) {
      setIsSaving(true)
      await onUpdate(category, partner || null, numAmount)
      setIsSaving(false)
    }
  }

  return (
    <div
      className={cn(
        'grid grid-cols-12 gap-3 items-center py-2 px-3 rounded-lg',
        'hover:bg-white/5 transition-colors',
        isSaving && 'opacity-50'
      )}
      data-testid={`fixed-cost-row-${category}`}
    >
      {/* Label */}
      <div className="col-span-4">
        <span className="text-sm font-medium text-text-primary">
          {FIXED_COST_LABELS[category]}
        </span>
      </div>

      {/* Partner */}
      <div className="col-span-4">
        <input
          type="text"
          value={partner}
          onChange={(e) => setPartner(e.target.value)}
          onBlur={handlePartnerBlur}
          placeholder="Partner name"
          disabled={disabled || isSaving}
          className={cn(
            'w-full bg-bg-secondary border border-border rounded px-2 py-1.5',
            'text-sm text-text-secondary placeholder:text-text-muted',
            'focus:outline-none focus:border-accent-blue',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          data-testid={`fixed-cost-partner-${category}`}
        />
      </div>

      {/* Amount */}
      <div className="col-span-4">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted">
            <DollarSign className="w-3.5 h-3.5" />
          </span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={handleAmountBlur}
            placeholder="0"
            min="0"
            step="100"
            disabled={disabled || isSaving}
            className={cn(
              'w-full bg-bg-secondary border border-border rounded pl-7 pr-2 py-1.5',
              'text-sm text-text-primary font-mono text-right',
              'focus:outline-none focus:border-accent-blue',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
            )}
            data-testid={`fixed-cost-amount-${category}`}
          />
        </div>
      </div>
    </div>
  )
}

export function FixedCostsSettings({
  costs,
  totalMonthly,
  isLoading,
  onUpdate,
}: FixedCostsSettingsProps) {
  const getCostForCategory = (category: FixedCostCategory): FixedCost | undefined => {
    return costs.find((c) => c.category === category)
  }

  return (
    <SettingsSection title="Fixed Marketing Costs">
      <div className="space-y-4">
        {/* Info banner */}
        <div className="flex items-start gap-3 bg-accent-blue/10 border border-accent-blue/20 rounded-lg p-3">
          <Info className="w-4 h-4 text-accent-blue flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary">
            Enter monthly fixed costs not captured in BigQuery (TV, Lifecycle, BDRs, etc.).
            These will be added to your total spend for accurate CPB calculations.
          </p>
        </div>

        {/* Header row */}
        <div className="grid grid-cols-12 gap-3 px-3 text-xs text-text-muted uppercase tracking-wide">
          <div className="col-span-4">Category</div>
          <div className="col-span-4">Partner</div>
          <div className="col-span-4 text-right">Monthly Amount</div>
        </div>

        {/* Cost rows */}
        <div className="space-y-1">
          {FIXED_COST_DEFAULTS.map(({ category, partner }) => (
            <CostRow
              key={category}
              category={category}
              defaultPartner={partner}
              cost={getCostForCategory(category)}
              onUpdate={onUpdate}
              disabled={isLoading}
            />
          ))}
        </div>

        {/* Total */}
        <div className="border-t border-border pt-4 mt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">
              Total Monthly Fixed Costs
            </span>
            <span className="text-lg font-mono font-bold text-accent-blue">
              {formatCurrency(totalMonthly)}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            This amount will be added to BigQuery ad spend in Fully Loaded CPB calculations.
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}
