import * as bizSdk from 'facebook-nodejs-business-sdk'

const AdAccount = bizSdk.AdAccount

let initialized = false

/**
 * Initialize the Meta Ads API with access token from env vars.
 * Safe to call multiple times — only initializes once.
 */
export function initializeMetaAPI(): void {
  if (initialized) return

  const accessToken = process.env.META_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error('META_ACCESS_TOKEN is required')
  }

  bizSdk.FacebookAdsApi.init(accessToken)
  initialized = true
  console.log('[Meta API] Initialized')
}

/**
 * Check if Meta API credentials are configured.
 */
export function isMetaEnabled(): boolean {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID)
}

/**
 * Get an AdAccount instance for the configured account.
 * Automatically initializes the API if needed.
 */
export function getMetaAdAccount(): InstanceType<typeof AdAccount> {
  initializeMetaAPI()

  const adAccountId = process.env.META_AD_ACCOUNT_ID
  if (!adAccountId) {
    throw new Error('META_AD_ACCOUNT_ID is required')
  }

  return new AdAccount(adAccountId)
}
