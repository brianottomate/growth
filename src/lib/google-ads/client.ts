/**
 * Google Ads API client initialization.
 * Mirrors the Meta API client pattern (src/lib/meta/client.ts).
 *
 * Required env vars:
 *   GOOGLE_ADS_CLIENT_ID        — OAuth 2.0 Client ID
 *   GOOGLE_ADS_CLIENT_SECRET    — OAuth 2.0 Client Secret
 *   GOOGLE_ADS_DEVELOPER_TOKEN  — Google Ads API developer token
 *   GOOGLE_ADS_REFRESH_TOKEN    — OAuth 2.0 refresh token
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID — MCC (Manager Account) ID
 *   GOOGLE_ADS_CUSTOMER_ID      — Child account ID (where campaigns run)
 */

import { GoogleAdsApi } from 'google-ads-api'

let client: GoogleAdsApi | null = null

/**
 * Check if Google Ads API credentials are configured.
 */
export function isGoogleEnabled(): boolean {
  return !!(
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  )
}

/**
 * Get or create the GoogleAdsApi singleton.
 */
function getClient(): GoogleAdsApi {
  if (!client) {
    client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    })
    console.log('[Google Ads] API client initialized')
  }
  return client
}

/**
 * Get an authenticated Customer instance for the configured account.
 */
export function getGoogleCustomer() {
  const api = getClient()

  return api.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  })
}

/**
 * List all accessible customer accounts under the MCC.
 * Use this to discover child account IDs when GOOGLE_ADS_CUSTOMER_ID is unknown.
 */
export async function listAccessibleAccounts(): Promise<Array<{ id: string; name: string }>> {
  const api = getClient()

  // listAccessibleCustomers is on the GoogleAdsApi class, not Customer
  const response = await api.listAccessibleCustomers(process.env.GOOGLE_ADS_REFRESH_TOKEN!)
  const resourceNames = response.resource_names ?? []

  // Query each accessible account for its descriptive name
  const results: Array<{ id: string; name: string }> = []

  for (const resourceName of resourceNames) {
    // resourceName format: "customers/1234567890"
    const customerId = resourceName.replace('customers/', '')

    try {
      const tempCustomer = api.Customer({
        customer_id: customerId,
        login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!,
        refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      })

      const [row] = await tempCustomer.query(`
        SELECT customer.id, customer.descriptive_name
        FROM customer
        LIMIT 1
      `)

      results.push({
        id: customerId,
        name: row?.customer?.descriptive_name ?? 'Unknown',
      })
    } catch {
      // Some accounts may not be queryable (e.g., manager accounts)
      results.push({ id: customerId, name: '(not queryable)' })
    }
  }

  console.log('[Google Ads] Accessible accounts:')
  for (const acct of results) {
    console.log(`  ${acct.id} — ${acct.name}`)
  }

  return results
}
