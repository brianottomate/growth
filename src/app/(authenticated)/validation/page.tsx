'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Database, Code, GitBranch, CheckCircle2, AlertCircle } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils/format'

interface ValidationData {
  supabase: {
    totalRows: number
    dateRange: { start: string; end: string }
    channelTotals: Array<{
      channel: string
      spend: number
      bookings: number
      gmv: number
    }>
    totals: {
      spend: number
      bookings: number
      gmv: number
    }
  }
}

const BIGQUERY_SPEND_QUERY = `SELECT
  dt as date,
  platform,
  SUM(spend) as spend,
  SUM(clicks) as clicks,
  SUM(impressions) as impressions
FROM \`wander-9fc9c.analytics.marketing_adnetwork_daily_report\`
GROUP BY dt, platform
ORDER BY dt, platform`

const BIGQUERY_BOOKINGS_QUERY = `SELECT
  DATE(b.ts_created) as date,
  COALESCE(f.partner, 'other') as channel,
  COUNT(DISTINCT b.id_booking) as bookings,
  SUM(b.total_paid) as gmv,
  SUM(b.booking_revenue_recognized) as take_rate_revenue,
  SUM(b.points_used) as points_used,
  SUM(b.coupon_off) as coupon_off,
  COUNTIF(b.is_direct_booking = TRUE) as direct_bookings,
  COUNTIF(b.is_ota = TRUE) as ota_bookings
FROM \`wander-9fc9c.analytics.bookings_reconciled_v2\` b
LEFT JOIN \`wander-9fc9c.analytics.funnel_events_attribution\` f
  ON b.id_booking = f.id_booking
  AND f.event_type = 'purchased'
  AND f.attribution_model = 'last_touch'
WHERE b.is_profit = TRUE
  AND b.status = 'confirmed'
GROUP BY date, channel
ORDER BY date, channel`

const BIGQUERY_FUNNEL_QUERY = `SELECT
  DATE(ts) as date,
  partner as channel,
  event_type,
  COUNT(*) as count
FROM \`wander-9fc9c.analytics.funnel_events_attribution\`
WHERE event_type IN ('user_signed_up', 'checkout_started')
GROUP BY date, partner, event_type
ORDER BY date, partner`

const CHANNEL_MAPPING = [
  { source: 'Meta, Facebook, Instagram', target: 'meta', type: 'Paid (30d click / 1d view)' },
  { source: 'Google, Google Ads', target: 'google', type: 'Paid' },
  { source: 'Pinterest', target: 'pinterest', type: 'Paid' },
  { source: 'TikTok', target: 'tiktok', type: 'Paid' },
  { source: 'Microsoft, Bing', target: 'microsoft', type: 'Paid' },
  { source: 'Criteo', target: 'criteo', type: 'Paid' },
  { source: 'Mountain, TV', target: 'mountain', type: 'Paid' },
  { source: 'Influencer', target: 'influencer', type: 'Paid' },
  { source: 'Organic', target: 'organic', type: 'Organic' },
  { source: 'Direct Mail', target: 'direct_mail', type: 'Owned' },
  { source: 'Customer IO, Email Action, Newsletter, Iterable', target: 'lifecycle', type: 'Owned' },
  { source: 'Benefithub', target: 'affiliate', type: 'Partner' },
  { source: 'Airbnb', target: 'airbnb', type: 'OTA' },
  { source: 'Vrbo', target: 'vrbo', type: 'OTA' },
  { source: 'Booking', target: 'booking', type: 'OTA' },
  { source: 'Mybookingpal', target: 'amex', type: 'OTA' },
  { source: 'Manual, Alpha, Other, (null)', target: 'other', type: 'Other' },
]

// Expected totals from BigQuery export files loaded into Supabase
// Aggregated by dashboard channel (after channel mapping)
// Last updated: February 17, 2026
const BIGQUERY_TOTALS = {
  spend: [
    { channel: 'meta', value: 2968357.43 },
    { channel: 'google', value: 2838717.38 },
    { channel: 'influencer', value: 1071887.82 },
    { channel: 'mountain', value: 514315.16 },
    { channel: 'criteo', value: 400960.41 },
    { channel: 'pinterest', value: 324329.64 },
    { channel: 'tiktok', value: 57710.40 },
    { channel: 'microsoft', value: 42244.21 },
    { channel: 'other', value: 5620.48 },
  ],
  // Bookings from bookings_gmv (is_profit=TRUE, status=confirmed)
  // Joined with funnel_events_attribution for channel (last_touch)
  // Aggregated by dashboard channel after load script mapping
  bookings: [
    { channel: 'organic', value: 3385 },
    { channel: 'airbnb', value: 3013 },
    { channel: 'other', value: 2434 },
    { channel: 'lifecycle', value: 871 },
    { channel: 'vrbo', value: 674 },
    { channel: 'google', value: 422 },
    { channel: 'meta', value: 87 },
    { channel: 'direct_mail', value: 60 },
    { channel: 'criteo', value: 29 },
    { channel: 'booking', value: 26 },
    { channel: 'influencer', value: 13 },
    { channel: 'microsoft', value: 2 },
    { channel: 'pinterest', value: 1 },
  ],
  gmv: [
    { channel: 'organic', value: 17048571.62 },
    { channel: 'airbnb', value: 12328622.71 },
    { channel: 'other', value: 10600836.55 },
    { channel: 'lifecycle', value: 4070347.94 },
    { channel: 'vrbo', value: 3957267.88 },
    { channel: 'google', value: 2379723.99 },
    { channel: 'meta', value: 292864.49 },
    { channel: 'direct_mail', value: 206555.73 },
    { channel: 'criteo', value: 146236.08 },
    { channel: 'booking', value: 116039.60 },
    { channel: 'influencer', value: 55113.06 },
    { channel: 'microsoft', value: 5223.99 },
    { channel: 'pinterest', value: 1448.43 },
  ],
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Icon className="w-5 h-5 text-accent" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-bg-tertiary border border-border rounded-lg p-4 overflow-x-auto text-sm text-text-secondary font-mono">
      {code}
    </pre>
  )
}

function ValidationRow({ label, expected, actual, match }: { label: string; expected: string; actual: string; match: boolean }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2 px-3 text-text-primary">{label}</td>
      <td className="py-2 px-3 text-text-secondary text-right font-mono">{expected}</td>
      <td className="py-2 px-3 text-text-secondary text-right font-mono">{actual}</td>
      <td className="py-2 px-3 text-center">
        {match ? (
          <CheckCircle2 className="w-5 h-5 text-green-500 inline" />
        ) : (
          <AlertCircle className="w-5 h-5 text-red-500 inline" />
        )}
      </td>
    </tr>
  )
}

export default function ValidationPage() {
  const [data, setData] = useState<ValidationData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/validation')
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (err) {
        console.error('Error fetching validation data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const supabaseTotals = data?.supabase.totals || { spend: 0, bookings: 0, gmv: 0 }
  const bigquerySpendTotal = BIGQUERY_TOTALS.spend.reduce((sum, r) => sum + r.value, 0)
  const bigqueryBookingsTotal = BIGQUERY_TOTALS.bookings.reduce((sum, r) => sum + r.value, 0)
  const bigqueryGmvTotal = BIGQUERY_TOTALS.gmv.reduce((sum, r) => sum + r.value, 0)

  const spendMatch = !loading && Math.abs(bigquerySpendTotal - supabaseTotals.spend) < 1
  const bookingsMatch = !loading && bigqueryBookingsTotal === supabaseTotals.bookings
  const gmvMatch = !loading && Math.abs(bigqueryGmvTotal - supabaseTotals.gmv) < 1
  const allPassed = spendMatch && bookingsMatch && gmvMatch

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-8 h-8 text-green-500" />
          <h1 className="text-3xl font-bold text-text-primary">Data Validation</h1>
        </div>
        <p className="text-text-secondary">
          This page documents the data sources, queries, and validation checks used to ensure accuracy.
        </p>
      </div>

      {/* Summary */}
      {loading ? (
        <div className="bg-bg-secondary border border-border rounded-lg p-4 mb-8">
          <p className="text-sm text-text-secondary">Running validation checks...</p>
        </div>
      ) : allPassed ? (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="font-semibold text-green-500">All Validation Checks Passed</span>
          </div>
          <p className="text-sm text-text-secondary">
            Data has been verified against BigQuery source tables. Spend, bookings, and GMV totals match within acceptable precision.
          </p>
        </div>
      ) : (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="font-semibold text-red-500">Validation Issues Detected</span>
          </div>
          <p className="text-sm text-text-secondary">
            One or more totals do not match BigQuery source data. Review the checks below.
          </p>
        </div>
      )}

      {/* Data Sources */}
      <Section title="Data Sources" icon={Database}>
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="text-left py-2">Source</th>
                <th className="text-left py-2">BigQuery Table(s)</th>
                <th className="text-left py-2">Contains</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-2 text-text-primary font-medium">Spend Data</td>
                <td className="py-2 font-mono text-text-secondary text-sm">marketing_adnetwork_daily_report</td>
                <td className="py-2 text-text-secondary">Daily spend, clicks, impressions by platform</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 text-text-primary font-medium">Bookings/GMV</td>
                <td className="py-2 font-mono text-text-secondary text-sm">bookings_gmv LEFT JOIN funnel_events_attribution</td>
                <td className="py-2 text-text-secondary">Confirmed bookings with GMV, channel via last-touch attribution</td>
              </tr>
              <tr>
                <td className="py-2 text-text-primary font-medium">Funnel Events</td>
                <td className="py-2 font-mono text-text-secondary text-sm">funnel_events_attribution</td>
                <td className="py-2 text-text-secondary">Account creations, checkout_started events</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-text-muted mt-3">
            <strong>Key filters:</strong> is_profit = TRUE, status = &apos;confirmed&apos; (excludes inquiries and cancelled bookings)
          </p>
        </div>
      </Section>

      {/* SQL Queries */}
      <Section title="SQL Queries" icon={Code}>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-2">Spend Data Query</h3>
            <CodeBlock code={BIGQUERY_SPEND_QUERY} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-2">Bookings/GMV Query (with Attribution Join)</h3>
            <CodeBlock code={BIGQUERY_BOOKINGS_QUERY} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-2">Funnel Events Query</h3>
            <CodeBlock code={BIGQUERY_FUNNEL_QUERY} />
          </div>
        </div>
      </Section>

      {/* Channel Mapping */}
      <Section title="Channel Mapping" icon={GitBranch}>
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <p className="text-sm text-text-secondary mb-4">
            BigQuery source values are mapped to standardized channel names for consistent reporting.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="text-left py-2">BigQuery Value(s)</th>
                <th className="text-left py-2">Dashboard Channel</th>
                <th className="text-left py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {CHANNEL_MAPPING.map((m) => (
                <tr key={m.target} className="border-b border-border/50">
                  <td className="py-2 text-text-secondary font-mono text-sm">{m.source}</td>
                  <td className="py-2 text-text-primary font-medium">{m.target}</td>
                  <td className="py-2 text-text-secondary">{m.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Validation Checks */}
      <Section title="Validation Checks" icon={ShieldCheck}>
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="text-left py-2 px-3">Metric</th>
                <th className="text-right py-2 px-3">BigQuery</th>
                <th className="text-right py-2 px-3">Dashboard</th>
                <th className="text-center py-2 px-3">Match</th>
              </tr>
            </thead>
            <tbody>
              <ValidationRow
                label="Total Spend"
                expected={formatCurrency(bigquerySpendTotal)}
                actual={loading ? '...' : formatCurrency(supabaseTotals.spend)}
                match={spendMatch}
              />
              <ValidationRow
                label="Total Bookings"
                expected={formatNumber(bigqueryBookingsTotal)}
                actual={loading ? '...' : formatNumber(supabaseTotals.bookings)}
                match={bookingsMatch}
              />
              <ValidationRow
                label="Total GMV"
                expected={formatCurrency(bigqueryGmvTotal)}
                actual={loading ? '...' : formatCurrency(supabaseTotals.gmv)}
                match={gmvMatch}
              />
            </tbody>
          </table>
        </div>
      </Section>

      {/* BigQuery Raw Data */}
      <Section title="BigQuery Source Totals" icon={Database}>
        <p className="text-sm text-text-secondary mb-4">
          Totals from BigQuery export files, aggregated by dashboard channel after mapping.
          These are the expected values used in validation checks above.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <h3 className="font-medium text-text-primary mb-3">Spend by Channel</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left py-1">Channel</th>
                  <th className="text-right py-1">Spend</th>
                </tr>
              </thead>
              <tbody>
                {BIGQUERY_TOTALS.spend.map((r) => (
                  <tr key={r.channel} className="border-b border-border/50">
                    <td className="py-1 text-text-primary">{r.channel}</td>
                    <td className="py-1 text-text-secondary text-right font-mono">{formatCurrency(r.value)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 text-text-primary">Total</td>
                  <td className="py-2 text-text-primary text-right font-mono">{formatCurrency(bigquerySpendTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <h3 className="font-medium text-text-primary mb-3">Bookings by Channel</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left py-1">Channel</th>
                  <th className="text-right py-1">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {BIGQUERY_TOTALS.bookings.map((r) => (
                  <tr key={r.channel} className="border-b border-border/50">
                    <td className="py-1 text-text-primary">{r.channel}</td>
                    <td className="py-1 text-text-secondary text-right font-mono">{formatNumber(r.value)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 text-text-primary">Total</td>
                  <td className="py-2 text-text-primary text-right font-mono">{formatNumber(bigqueryBookingsTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <h3 className="font-medium text-text-primary mb-3">GMV by Channel</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left py-1">Channel</th>
                  <th className="text-right py-1">GMV</th>
                </tr>
              </thead>
              <tbody>
                {BIGQUERY_TOTALS.gmv.map((r) => (
                  <tr key={r.channel} className="border-b border-border/50">
                    <td className="py-1 text-text-primary">{r.channel}</td>
                    <td className="py-1 text-text-secondary text-right font-mono">{formatCurrency(r.value)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 text-text-primary">Total</td>
                  <td className="py-2 text-text-primary text-right font-mono">{formatCurrency(bigqueryGmvTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Methodology */}
      <Section title="Calculation Methodology" icon={Code}>
        <div className="bg-bg-secondary border border-border rounded-lg p-4 space-y-4 text-sm">
          <div>
            <h3 className="font-medium text-text-primary mb-1">Ad CPB (Cost Per Booking) - Primary Metric</h3>
            <p className="text-text-secondary">Ad CPB = Ad Spend / Direct Bookings</p>
            <p className="text-text-secondary mt-1">
              <strong>Excluded from denominator:</strong> OTA (Airbnb, Vrbo, Booking.com), Organic, and Other.
              These channels don&apos;t require marketing spend or are catch-all categories.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-text-primary mb-1">Total CPB (Reference Only)</h3>
            <p className="text-text-secondary">Total CPB = Ad Spend / All Bookings</p>
            <p className="text-text-secondary mt-1">
              Includes OTA and organic bookings, which artificially lowers the number. Use for reference only.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-text-primary mb-1">GMV Source</h3>
            <p className="text-text-secondary">
              GMV comes from <code className="bg-bg-tertiary px-1 rounded">bookings_gmv.gmv</code> for confirmed bookings only.
            </p>
            <p className="text-text-secondary mt-1">
              Filters: <code className="bg-bg-tertiary px-1 rounded">is_profit = TRUE</code>, <code className="bg-bg-tertiary px-1 rounded">status = &apos;confirmed&apos;</code>
            </p>
          </div>
          <div>
            <h3 className="font-medium text-text-primary mb-1">Attribution Model</h3>
            <p className="text-text-secondary">
              Last-touch attribution via JOIN on <code className="bg-bg-tertiary px-1 rounded">id_booking</code> with{' '}
              <code className="bg-bg-tertiary px-1 rounded">funnel_events_attribution</code> where{' '}
              <code className="bg-bg-tertiary px-1 rounded">attribution_model = &apos;last_touch&apos;</code>.
            </p>
          </div>
        </div>
      </Section>

      {/* Data Freshness */}
      <Section title="Data Freshness" icon={Database}>
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-text-secondary">Date Range:</span>
              <span className="text-text-primary ml-2 font-mono">
                {loading ? '...' : `${data?.supabase.dateRange.start} to ${data?.supabase.dateRange.end}`}
              </span>
            </div>
            <div>
              <span className="text-text-secondary">Total Records:</span>
              <span className="text-text-primary ml-2 font-mono">
                {loading ? '...' : formatNumber(data?.supabase.totalRows || 0)}
              </span>
            </div>
            <div>
              <span className="text-text-secondary">Last Sync:</span>
              <span className="text-text-primary ml-2 font-mono">February 17, 2026</span>
            </div>
            <div>
              <span className="text-text-secondary">Sync Method:</span>
              <span className="text-text-primary ml-2">Manual export from BigQuery (CSV + JSON Lines)</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <div className="text-center text-text-secondary text-sm py-8 border-t border-border">
        Questions about data accuracy? Ask Brian Sun.
      </div>
    </div>
  )
}
