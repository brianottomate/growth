/**
 * Quick test: fetch Google Ads data for last 7 days.
 * Run with: npx tsx scripts/test-google-ads.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { GoogleAdsApi } from 'google-ads-api'

async function main() {
  const api = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  })

  const customer = api.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  })

  // Last 7 days
  const end = new Date().toISOString().split('T')[0]!
  const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!

  console.log(`Querying Google Ads: ${start} → ${end}\n`)

  const results = await customer.query(`
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)

  if (results.length === 0) {
    console.log('No data returned.')
    return
  }

  console.log(`Got ${results.length} days of data:\n`)

  let totalSpend = 0
  let totalConversions = 0

  for (const row of results) {
    const date = row.segments?.date
    const spend = (row.metrics?.cost_micros ?? 0) / 1_000_000
    const clicks = row.metrics?.clicks ?? 0
    const impressions = row.metrics?.impressions ?? 0
    const conversions = row.metrics?.conversions ?? 0

    totalSpend += spend
    totalConversions += conversions

    console.log(`  ${date}: $${spend.toFixed(0)} spend, ${clicks} clicks, ${impressions.toLocaleString()} impr, ${Math.round(conversions)} conv`)
  }

  console.log(`\nTotals: $${totalSpend.toFixed(0)} spend, ${Math.round(totalConversions)} conversions`)
}

main().catch(console.error)
