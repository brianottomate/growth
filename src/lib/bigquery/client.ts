import { BigQuery } from '@google-cloud/bigquery'

// Lazy initialization
let bigQueryClient: BigQuery | null = null

export interface BigQueryConfig {
  projectId: string
  enabled: boolean
  cacheTTL: number
}

export function getBigQueryConfig(): BigQueryConfig {
  return {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'wander-production',
    enabled: process.env.USE_BIGQUERY === 'true',
    cacheTTL: parseInt(process.env.BIGQUERY_CACHE_TTL || '3600', 10),
  }
}

export function getBigQueryClient(): BigQuery {
  const config = getBigQueryConfig()

  if (!config.enabled) {
    throw new Error('BigQuery is not enabled')
  }

  if (!bigQueryClient) {
    // Check for inline credentials first
    const inlineCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS

    if (inlineCredentials) {
      try {
        const credentials = JSON.parse(inlineCredentials)
        bigQueryClient = new BigQuery({
          projectId: config.projectId,
          credentials,
          location: 'US',
        })
      } catch {
        throw new Error('Invalid GOOGLE_CLOUD_CREDENTIALS JSON')
      }
    } else {
      // Fall back to GOOGLE_APPLICATION_CREDENTIALS file
      bigQueryClient = new BigQuery({
        projectId: config.projectId,
      })
    }
  }

  return bigQueryClient
}

export function isBigQueryEnabled(): boolean {
  return getBigQueryConfig().enabled
}
