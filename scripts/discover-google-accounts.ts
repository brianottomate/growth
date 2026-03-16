/**
 * One-time script to discover Google Ads child accounts under the MCC.
 * Run with: npx tsx scripts/discover-google-accounts.ts
 *
 * Requires env vars: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
 *   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID
 */

import { config } from 'dotenv'
config({ path: '.env.local' })
import { GoogleAdsApi } from 'google-ads-api'

async function main() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID

  if (!clientId || !clientSecret || !developerToken || !refreshToken || !loginCustomerId) {
    console.error('Missing required env vars. Set them in .env or export them.')
    process.exit(1)
  }

  console.log('Initializing Google Ads API...')
  const api = new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
  })

  console.log('Listing accessible accounts...\n')
  const response = await api.listAccessibleCustomers(refreshToken)
  const resourceNames: string[] = response.resource_names ?? (response as unknown as string[]) ?? []

  console.log(`Found ${resourceNames.length} accessible account(s):`)
  console.log('Raw response:', JSON.stringify(response, null, 2), '\n')

  for (const resourceName of resourceNames) {
    const customerId = String(resourceName).replace('customers/', '')

    try {
      const customer = api.Customer({
        customer_id: customerId,
        login_customer_id: loginCustomerId,
        refresh_token: refreshToken,
      })

      const [row] = await customer.query(`
        SELECT
          customer.id,
          customer.descriptive_name,
          customer.manager,
          customer.currency_code,
          customer.time_zone
        FROM customer
        LIMIT 1
      `)

      const isManager = row?.customer?.manager ? ' (MANAGER)' : ''
      console.log(`  ${customerId} — ${row?.customer?.descriptive_name ?? 'Unknown'}${isManager}`)
      console.log(`    Currency: ${row?.customer?.currency_code}, Timezone: ${row?.customer?.time_zone}`)
    } catch (err) {
      console.log(`  ${customerId} — (not queryable: ${(err as Error).message.slice(0, 80)})`)
    }
  }

  console.log('\n---')
  console.log('Set the child account ID (NOT the manager) as GOOGLE_ADS_CUSTOMER_ID')
  console.log('Example: railway variables set GOOGLE_ADS_CUSTOMER_ID="<id>"')
}

main().catch(console.error)
