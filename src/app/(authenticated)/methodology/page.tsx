'use client'

import { useEffect, useState } from 'react'
import {
  Calculator,
  DollarSign,
  Users,
  TrendingUp,
  Target,
  Layers,
  Info,
  ChevronRight,
} from 'lucide-react'
import { formatCurrency, formatNumber, formatMultiplier } from '@/lib/utils/format'
import { CPB_TARGET, BLENDED_TAKE_RATE, OTA_CHANNELS, FIXED_COST_LABELS } from '@/types'
import type { DashboardSummary, FixedCost } from '@/types'

interface LiveData {
  summary: DashboardSummary | null
  fixedCosts: { costs: FixedCost[]; totalMonthly: number } | null
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Icon className="w-5 h-5 text-accent-blue" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function FormulaCard({
  name,
  formula,
  description,
  example,
  liveValue,
  source,
}: {
  name: string
  formula: string
  description: string
  example?: { inputs: string; result: string }
  liveValue?: string
  source?: string
}) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-text-primary">{name}</h3>
        {liveValue && (
          <span className="text-lg font-mono font-bold text-accent-blue">
            {liveValue}
          </span>
        )}
      </div>

      {/* Formula */}
      <div className="bg-bg-tertiary border border-border/50 rounded px-3 py-2 mb-3">
        <code className="text-sm font-mono text-accent-blue">{formula}</code>
      </div>

      {/* Description */}
      <p className="text-sm text-text-secondary mb-3">{description}</p>

      {/* Example calculation */}
      {example && (
        <div className="text-xs text-text-muted bg-bg-tertiary/50 rounded px-3 py-2">
          <span className="text-text-secondary">Example:</span>{' '}
          <span className="font-mono">{example.inputs}</span>
          <ChevronRight className="w-3 h-3 inline mx-1" />
          <span className="font-mono font-semibold text-text-primary">{example.result}</span>
        </div>
      )}

      {/* Source */}
      {source && (
        <p className="text-xs text-text-muted mt-2 italic">Source: {source}</p>
      )}
    </div>
  )
}

function ThresholdRow({
  metric,
  threshold,
  condition,
  meaning,
  color,
}: {
  metric: string
  threshold: string
  condition: string
  meaning: string
  color: 'green' | 'yellow' | 'red'
}) {
  const colorClasses = {
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
  }

  return (
    <tr className="border-b border-border/50">
      <td className="py-3 px-3 text-text-primary font-medium">{metric}</td>
      <td className="py-3 px-3">
        <span
          className={`inline-flex items-center px-2 py-1 rounded text-xs font-mono border ${colorClasses[color]}`}
        >
          {condition} {threshold}
        </span>
      </td>
      <td className="py-3 px-3 text-text-secondary text-sm">{meaning}</td>
    </tr>
  )
}

export default function MethodologyPage() {
  const [data, setData] = useState<LiveData>({ summary: null, fixedCosts: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [dashboardRes, fixedCostsRes] = await Promise.all([
          fetch('/api/dashboard?days=30'),
          fetch('/api/settings/fixed-costs'),
        ])

        const [dashboardData, fixedCostsData] = await Promise.all([
          dashboardRes.json(),
          fixedCostsRes.json(),
        ])

        setData({
          summary: dashboardData.data || null,
          fixedCosts: fixedCostsData.data || null,
        })
      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const summary = data.summary
  const fixedCosts = data.fixedCosts

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Calculator className="w-8 h-8 text-accent-blue" />
          <h1 className="text-3xl font-bold text-text-primary">Calculation Methodology</h1>
        </div>
        <p className="text-text-secondary">
          Transparent documentation of how every metric in the Growth Tracker is calculated.
          Live values shown are from the last 30 days.
        </p>
      </div>

      {/* Quick Reference */}
      <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-lg p-4 mb-8">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-text-primary mb-1">Key Business Rules</p>
            <ul className="text-text-secondary space-y-1">
              <li>
                <strong>CPB Target:</strong> {formatCurrency(CPB_TARGET)} per booking
                (profitability threshold)
              </li>
              <li>
                <strong>OTA Channels:</strong> {OTA_CHANNELS.join(', ')} (excluded from Direct
                CPB)
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Efficiency Metrics */}
      <Section title="Efficiency Metrics" icon={TrendingUp}>
        <div className="grid gap-4">
          <FormulaCard
            name="DCPB (Direct Cost Per Booking)"
            formula="DCPB = Total Marketing Spend / Direct Bookings"
            description="Total marketing spend (ad spend + fixed costs + points + coupons) divided by direct bookings. Direct bookings = all bookings on Wander (non-OTA). Excludes Airbnb, Vrbo, Booking.com, Amex/MyBookingPal. This is the PRIMARY efficiency metric."
            example={{
              inputs: `${formatCurrency(summary?.totals.totalMarketingSpend || 225000)} / ${formatNumber(summary?.totals.directBookings || 250)} bookings`,
              result: formatCurrency(summary?.efficiency.directCpb || 500),
            }}
            liveValue={loading ? '...' : formatCurrency(summary?.efficiency.directCpb || 0)}
            source="Kyle/Drayton methodology (March 2026)"
          />

          <FormulaCard
            name="CPB (Cost Per Booking)"
            formula="CPB = Total Marketing Spend / Total Bookings"
            description="Total marketing spend divided by all bookings (direct + OTA). Gives the blended cost to acquire any booking across all channels."
            example={{
              inputs: `${formatCurrency(summary?.totals.totalMarketingSpend || 225000)} / ${formatNumber(summary?.totals.bookings || 570)} bookings`,
              result: formatCurrency(summary?.efficiency.cpb || 395),
            }}
            liveValue={loading ? '...' : formatCurrency(summary?.efficiency.cpb || 0)}
            source="Kyle/Drayton — total marketing spend / all bookings"
          />

          <FormulaCard
            name="ROAS (Return on Ad Spend)"
            formula={`ROAS = (GMV × ${BLENDED_TAKE_RATE * 100}% blended take rate) / Ad Spend`}
            description={`GMV multiplied by ${BLENDED_TAKE_RATE * 100}% blended take rate, divided by ad spend. Uses a blended take rate as a proxy for actual revenue until per-channel take rates are confirmed by Drayton.`}
            example={{
              inputs: `(${formatCurrency(summary?.totals.gmv || 5000000, { compact: true })} × ${BLENDED_TAKE_RATE * 100}%) / ${formatCurrency(summary?.totals.adSpend || 1250000, { compact: true })}`,
              result: formatMultiplier(summary?.efficiency.roas || 4),
            }}
            liveValue={loading ? '...' : formatMultiplier(summary?.efficiency.roas || 0)}
            source="Kyle/Drayton — 20% blended take rate (temporary)"
          />

        </div>
      </Section>

      {/* GMV */}
      <Section title="GMV" icon={DollarSign}>
        <div className="grid gap-4">
          <FormulaCard
            name="GMV (Gross Merchandise Value)"
            formula="GMV = Total booking value (what guests pay)"
            description="The total value of confirmed bookings only. Excludes inquiries and cancelled bookings. Does NOT subtract OTA fees, platform fees, taxes, or cleaning fees."
            liveValue={loading ? '...' : formatCurrency(summary?.totals.gmv || 0, { compact: true })}
            source="bookings_gmv table (is_profit=TRUE, status='confirmed') — Dylan flagged: verify this is the correct table"
          />
        </div>
        <p className="text-xs text-text-muted mt-3">
          <strong>Important:</strong> GMV is sourced from <code className="bg-bg-tertiary px-1 rounded">bookings_gmv</code> table,
          not <code className="bg-bg-tertiary px-1 rounded">funnel_events_attribution.gmv_attributed</code>.
        </p>

        <div className="mt-4 bg-bg-secondary border border-border rounded-lg p-4">
          <h3 className="font-semibold text-text-primary mb-3">GMV Split: Direct vs OTA</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-bg-tertiary/50 rounded p-3">
              <p className="font-medium text-text-primary mb-1">Direct GMV</p>
              <p className="text-text-secondary text-xs">
                GMV from marketing-attributed channels: Meta, Google, TikTok, Pinterest, Microsoft, Criteo, CTV, Influencer, etc.
              </p>
              <p className="text-accent-green font-medium mt-2">
                {loading ? '...' : formatCurrency(summary?.totals.directGmv || 0, { compact: true })}
              </p>
            </div>
            <div className="bg-bg-tertiary/50 rounded p-3">
              <p className="font-medium text-text-primary mb-1">OTA GMV</p>
              <p className="text-text-secondary text-xs">
                GMV from OTA channels: Airbnb, Vrbo, Booking.com, Amex/MyBookingPal. Not driven by ad spend.
              </p>
              <p className="text-accent-blue font-medium mt-2">
                {loading ? '...' : formatCurrency(summary?.totals.otaGmv || 0, { compact: true })}
              </p>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-3">
            <strong>Why split?</strong> ROAS uses Direct GMV only because OTA bookings come through third-party platforms,
            not your marketing efforts. This gives a more accurate picture of ad spend efficiency.
          </p>
        </div>
      </Section>

      {/* Spend Composition */}
      <Section title="Spend Composition" icon={Layers}>
        <div className="bg-bg-secondary border border-border rounded-lg p-4 mb-4">
          <h3 className="font-semibold text-text-primary mb-3">Total Marketing Spend</h3>
          <div className="bg-bg-tertiary border border-border/50 rounded px-3 py-2 mb-4">
            <code className="text-sm font-mono text-accent-blue">
              Total Spend = BigQuery Ad Spend + Fixed Costs (pro-rated)
            </code>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-bg-tertiary/50 rounded p-3">
              <p className="text-text-muted mb-1">BigQuery Ad Spend</p>
              <p className="text-lg font-mono font-bold text-text-primary">
                {loading
                  ? '...'
                  : formatCurrency(summary?.totals.adSpend || 0, { compact: true })}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Meta, Google, Pinterest, TikTok, Criteo, Microsoft, Mountain, Influencer
              </p>
            </div>
            <div className="bg-bg-tertiary/50 rounded p-3">
              <p className="text-text-muted mb-1">Fixed Costs (Monthly)</p>
              <p className="text-lg font-mono font-bold text-text-primary">
                {loading ? '...' : formatCurrency(fixedCosts?.totalMonthly || 0, { compact: true })}
              </p>
              <p className="text-xs text-text-muted mt-1">
                TV, Lifecycle, BDRs, Direct Mail, Affiliate, SEO
              </p>
            </div>
          </div>
        </div>

        {/* Fixed Costs Breakdown */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h3 className="font-semibold text-text-primary mb-3">Fixed Costs Breakdown</h3>
          <p className="text-sm text-text-secondary mb-4">
            These costs are not tracked in BigQuery and are manually configured in Settings.
            They are pro-rated based on the selected date range.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="text-left py-2">Category</th>
                <th className="text-left py-2">Partner</th>
                <th className="text-right py-2">Monthly Amount</th>
              </tr>
            </thead>
            <tbody>
              {fixedCosts?.costs.map((fc) => (
                <tr key={fc.category} className="border-b border-border/50">
                  <td className="py-2 text-text-primary">{FIXED_COST_LABELS[fc.category]}</td>
                  <td className="py-2 text-text-secondary">{fc.partner || '—'}</td>
                  <td className="py-2 text-right font-mono text-text-primary">
                    {formatCurrency(fc.monthlyAmount)}
                  </td>
                </tr>
              ))}
              {(!fixedCosts?.costs || fixedCosts.costs.length === 0) && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-text-muted">
                    No fixed costs configured
                  </td>
                </tr>
              )}
              <tr className="font-semibold">
                <td colSpan={2} className="py-2 text-text-primary">Total</td>
                <td className="py-2 text-right font-mono text-accent-blue">
                  {formatCurrency(fixedCosts?.totalMonthly || 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Booking Classification */}
      <Section title="Booking Classification" icon={Users}>
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-text-primary mb-2">Direct Bookings</h3>
              <p className="text-sm text-text-secondary mb-3">
                Any booking made on Wander (not via OTAs). Excludes Airbnb, Vrbo, Booking.com, and Amex/MyBookingPal.
                Used as the denominator for DCPB.
              </p>
              <div className="bg-bg-tertiary/50 rounded p-3">
                <p className="text-2xl font-mono font-bold text-text-primary">
                  {loading ? '...' : formatNumber(summary?.totals.directBookings || 0)}
                </p>
                <p className="text-xs text-text-muted">
                  ~{summary ? Math.round((summary.totals.directBookings / summary.totals.bookings) * 100) : 75}% of total
                </p>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-text-primary mb-2">Non-Direct Bookings</h3>
              <p className="text-sm text-text-secondary mb-3">
                Bookings from OTA platforms, organic traffic, and uncategorized sources.
                Excluded from Ad CPB because they are not driven by ad spend.
              </p>
              <div className="bg-bg-tertiary/50 rounded p-3">
                <p className="text-2xl font-mono font-bold text-text-primary">
                  {loading
                    ? '...'
                    : formatNumber(
                        (summary?.totals.bookings || 0) - (summary?.totals.directBookings || 0)
                      )}
                </p>
                <p className="text-xs text-text-muted">Airbnb, Vrbo, Booking.com, Amex, Organic, Other</p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-text-muted">
              <strong>Formula:</strong> Direct Bookings = Total Bookings − OTA (Airbnb + Vrbo +
              Booking.com + Amex/MyBookingPal) − Organic − Other
            </p>
          </div>
        </div>
      </Section>

      {/* Thresholds & Targets */}
      <Section title="Thresholds & Targets" icon={Target}>
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-tertiary/50">
                <th className="text-left py-3 px-3 text-text-muted font-medium">Metric</th>
                <th className="text-left py-3 px-3 text-text-muted font-medium">Threshold</th>
                <th className="text-left py-3 px-3 text-text-muted font-medium">Interpretation</th>
              </tr>
            </thead>
            <tbody>
              <ThresholdRow
                metric="DCPB"
                threshold="$400"
                condition="<"
                meaning="Excellent efficiency, scale opportunity"
                color="green"
              />
              <ThresholdRow
                metric="DCPB"
                threshold="$500"
                condition="≤"
                meaning="Profitable, on target"
                color="yellow"
              />
              <ThresholdRow
                metric="DCPB"
                threshold="$500"
                condition=">"
                meaning="Above target, needs optimization"
                color="red"
              />
              <ThresholdRow
                metric="ROAS"
                threshold="5:1"
                condition="≥"
                meaning="Performing well, scale opportunity"
                color="green"
              />
              <ThresholdRow
                metric="ROAS"
                threshold="2:1"
                condition="<"
                meaning="Concerning, evaluate or cut"
                color="red"
              />
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-sm text-text-secondary">
          <p>
            <strong>CPB Target ($500):</strong> At this cost per booking, Wander is profitable
            on marketing spend relative to average booking GMV.
          </p>
        </div>
      </Section>

      {/* Attribution */}
      <Section title="Attribution Model" icon={Layers}>
        <div className="bg-bg-secondary border border-border rounded-lg p-4 mb-4">
          <p className="text-sm text-text-secondary mb-4">
            Attribution varies by channel — each channel owner decides the model that best
            reflects their performance. The dashboard uses per-channel attribution rather than
            a single model for all channels.
          </p>

          <h3 className="font-semibold text-text-primary mb-3">Per-Channel Attribution</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="text-left py-2">Channel</th>
                <th className="text-left py-2">Attribution Model</th>
                <th className="text-left py-2">Source</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50 bg-accent-green/5">
                <td className="py-2 text-text-primary font-medium">Meta (Facebook/Instagram)</td>
                <td className="py-2 text-text-secondary">28-day click + 1-day view</td>
                <td className="py-2 text-text-secondary text-xs">Meta Ads API</td>
                <td className="py-2 text-accent-green text-xs font-medium">Live — API integrated</td>
              </tr>
              <tr className="border-b border-border/50 bg-accent-green/5">
                <td className="py-2 text-text-primary font-medium">Google</td>
                <td className="py-2 text-text-secondary">Data-driven (Google Ads API)</td>
                <td className="py-2 text-text-secondary text-xs">Google Ads API (Purchase action)</td>
                <td className="py-2 text-accent-green text-xs font-medium">Live — API integrated</td>
              </tr>
              <tr className="border-b border-border/50 bg-accent-blue/5">
                <td className="py-2 text-text-primary font-medium">TikTok, Pinterest, Microsoft, Criteo</td>
                <td className="py-2 text-text-secondary">Last-touch (BigQuery)</td>
                <td className="py-2 text-text-secondary text-xs">funnel_events_attribution</td>
                <td className="py-2 text-accent-blue text-xs font-medium">Active</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 text-text-primary font-medium">Mountain (CTV)</td>
                <td className="py-2 text-text-secondary">Last-touch (BigQuery)</td>
                <td className="py-2 text-text-secondary text-xs">funnel_events_attribution</td>
                <td className="py-2 text-accent-blue text-xs font-medium">Active</td>
              </tr>
              <tr>
                <td className="py-2 text-text-primary font-medium">OTAs (Airbnb, Vrbo, Booking, Amex)</td>
                <td className="py-2 text-text-secondary">Direct (no attribution needed)</td>
                <td className="py-2 text-text-secondary text-xs">bookings_reconciled_v2</td>
                <td className="py-2 text-accent-blue text-xs font-medium">Active</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-accent-green/10 border border-accent-green/20 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-accent-green flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-text-primary mb-1">Platform API Integrations — Live (March 2026)</p>
              <p className="text-text-secondary">
                <strong>Meta:</strong> Uses Meta Ads API with <strong>28-day click + 1-day view</strong> attribution
                (the maximum Meta offers). Overrides BigQuery last-touch for Meta spend, bookings, and GMV (purchase conversion value).
              </p>
              <p className="text-text-secondary mt-2">
                <strong>Google:</strong> Uses Google Ads API with <strong>data-driven attribution</strong>.
                Filtered to Purchase conversion action only. Overrides BigQuery last-touch for Google spend, bookings, and GMV.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h3 className="font-semibold text-text-primary mb-3">Available BigQuery Models</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="text-left py-2">Model</th>
                <th className="text-left py-2">Use Case</th>
                <th className="text-left py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50 bg-accent-blue/5">
                <td className="py-2 text-text-primary font-medium">Last-touch</td>
                <td className="py-2 text-text-secondary">Dashboard default (non-Meta)</td>
                <td className="py-2 text-accent-blue text-xs font-medium">Currently used</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 text-text-primary font-medium">U-shaped</td>
                <td className="py-2 text-text-secondary">Holistic reporting</td>
                <td className="py-2 text-text-muted text-xs">Recommended for full picture</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 text-text-primary font-medium">First-touch</td>
                <td className="py-2 text-text-secondary">Prospecting analysis</td>
                <td className="py-2 text-text-muted text-xs">
                  Has Customer.io issue (re-engagement credited)
                </td>
              </tr>
              <tr>
                <td className="py-2 text-text-primary font-medium">Data-driven</td>
                <td className="py-2 text-text-secondary">Alternative holistic view</td>
                <td className="py-2 text-text-muted text-xs">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Footer */}
      <div className="text-center text-text-muted text-sm py-8 border-t border-border">
        <p>
          Methodology per Kyle/Drayton (March 5, 2026). Meta + Google APIs live. 20% blended take rate pending per-channel confirmation from Drayton.
        </p>
        <p className="mt-1">Questions? Ask Brian Sun</p>
      </div>
    </div>
  )
}
