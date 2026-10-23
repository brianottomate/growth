import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    DATABASE_URL: z.string().url(),
    DB_EXPERIMENT_BRANCH: z.string().startsWith("experiment/").optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    RESEND_API_KEY: z.string().optional(),
    QSTASH_TOKEN: z.string().optional(),
    QSTASH_URL: z.string().url().optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
    LIFECYCLE_ENABLED: z.enum(["true", "false"]).default("false"),
    AMPLITUDE_INGEST_ENABLED: z.enum(["true", "false"]).default("false"),
    LIFECYCLE_BASE_URL: z.string().url().optional(),
    LIFECYCLE_RUNTIME_ID: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().default("Wander <onboarding@resend.dev>"),
    RESEND_REPLY_TO_EMAIL: z.string().email().optional(),
    POSTMARK_ACCOUNT_TOKEN: z.string().optional(),
    POSTMARK_SERVER_TOKEN: z.string().optional(),
    POSTMARK_WEBHOOK_SECRET: z.string().optional(),
    SAAS_ENTRI_APPLICATION_ID: z.string().optional(),
    SAAS_ENTRI_APPLICATION_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    // Separate OAuth client from sign-in: connecting Drive must never alter
    // how someone logs in, and revoking Drive must not revoke their session.
    GOOGLE_DRIVE_CLIENT_ID: z.string().optional(),
    GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional(),
    ADMIN_TOKEN: z.string().min(32), // Require strong token (32+ chars)
    /**
     * Where the client-facing surfaces live. The intake form moved to
     * wander.com, so a link handed to a client must point there and not at
     * this app's own origin, which is the internal back-office.
     */
    WANDER_COM_BASE_URL: z.string().url().default("https://www.wander.com"),
    OPENAI_API_KEY: z.string().min(1), // Required for voice chat
    ANTHROPIC_API_KEY: z.string().optional(), // For Claude AI features
    FAL_AI_API_KEY: z.string().optional(), // fal.ai image/video generation
    REPLICATE_API_TOKEN: z.string().optional(), // Legacy Wander motion pipeline: Seedance, segmentation, upscaling
    GEMINI_API_KEY: z.string().optional(), // Direct Google Gemini image generation
    DATOCMS_CMA_TOKEN: z.string().optional(), // wander.com blog publishing (Content Management API)
    DATOCMS_PREVIEW_SECRET: z.string().optional(), // signs wander.com /article/preview links
    FIRECRAWL_API_KEY: z.string().min(1), // For web scraping
    OUTREACH_S2S_GUID: z.string().optional(), // For Outreach S2S auth
    OUTREACH_PRIVATE_KEY: z.string().optional(), // For Outreach S2S JWT signing
    OUTREACH_INSTALL_ID: z.string().optional(), // For Outreach app installation
    OUTREACH_OAUTH_CLIENT_ID: z.string().optional(), // For Outreach OAuth
    OUTREACH_OAUTH_CLIENT_SECRET: z.string().optional(), // For Outreach OAuth
    OUTREACH_WEBHOOK_SECRET: z.string().optional(), // For Outreach webhook verification
    // WanderOS pregen site builds (wandercom/wander#20939). All optional: until
    // these are set the client reports unconfigured and the webhook route 503s,
    // so the integration ships dormant.
    WANDER_API_URL: z.string().url().optional(),
    WANDER_API_KEY: z.string().optional(),
    // Shared secret WanderOS sends as `x-pregen-secret` on prospect webhooks.
    PREGEN_WEBHOOK_SECRET: z.string().optional(),
    // Apex of the pregen preview zone, e.g. "trywanderos.com". Previews are
    // served per-prospect at `<label>.<zone>/?t=<token>` by the standalone
    // renderer; unset means we cannot build a link and say so.
    PREGEN_PREVIEW_HOST_ZONE: z.string().optional(),
    OUTREACH_DISABLE_WEBHOOK_SIGNATURE_CHECK: z.coerce.boolean().default(false), // Dev-only escape hatch for webhook debugging
    // Customer.io
    CUSTOMER_IO_APP_KEY: z.string().min(1), // App API key (Bearer) for reading customer data
    CUSTOMER_IO_SITE_ID: z.string().min(1), // Site ID for Track API (Basic auth)
    CUSTOMER_IO_API_KEY: z.string().min(1), // Track API key for writing/updating data
    CUSTOMERIO_WEBHOOK_SECRET: z.string().min(1), // HMAC-SHA256 for CIO reporting webhooks
    CUSTOMERIO_WEBHOOK_BEARER_TOKEN: z.string().min(1), // Bearer token auth for CIO workflow HTTP Request actions
    // BigQuery
    EMAIL_AUDIENCE_DEV_SCHEMA: z
      .string()
      .regex(/^email_audience_dev_[a-z0-9_]+$/)
      .optional(),
    BIGQUERY_PROJECT_ID: z.string().min(1), // GCP project ID (required)
    BIGQUERY_DATASET_ID: z.string().optional(), // Default dataset
    GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(), // Service account JSON (as string)
    GCP_SA_JSON_B64: z.string().optional(), // Base64-encoded service account JSON
    SYNC_DEBUG: z.coerce.boolean().default(true), // Debug logging for sync/workflow traces
    // Meta Ads
    FB_SYSUSER_TOKEN: z.string().optional(), // Meta system user token (preferred)
    META_ACCESS_TOKEN: z.string().optional(), // Meta access token (fallback)
    META_AD_ACCOUNT_ID: z.string().optional(), // Meta ad account ID (e.g. act_885632...)
    META_ADS_ACCESS_TOKEN: z.string().optional(), // system user token with ads_management for ad writes; FB_SYSUSER_TOKEN otherwise
    // Meta lead ads → growth (app "Wander Growth Leads" 2121713918736592)
    META_LEADS_ACCESS_TOKEN: z.string().optional(), // system user token: leads_retrieval, pages_manage_metadata, pixel CAPI
    META_LEADS_APP_SECRET: z.string().optional(), // verifies X-Hub-Signature-256 on the leadgen webhook
    META_LEADGEN_VERIFY_TOKEN: z.string().optional(), // hub.verify_token for the webhook subscription handshake
    META_LEADGEN_ROUTE_FROM: z.iso.datetime({ offset: true }).optional(), // hand leads created at/after this instant to the inbound router; unset while Make still does it
    REVENUEHERO_LOOKUP_WEBHOOK_URL: z.url().optional(), // Make.com webhook: POST { email } → { salesRepEmail } from the RevenueHero booking store; unset = meeting-link forms round-robin
    // Google Ads direct API. Service account takes precedence over user OAuth.
    GOOGLE_ADS_SERVICE_ACCOUNT_JSON: z.string().optional(),
    GOOGLE_ADS_CLIENT_ID: z.string().optional(),
    GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
    GOOGLE_ADS_REFRESH_TOKEN: z.string().optional(),
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional(), // MCC
    GOOGLE_ADS_CUSTOMER_ID: z.string().optional(), // child account
    // Pinterest Ads — interim spend-tracker connector (dormant, $0 spend Jul 2026)
    PINTEREST_ACCESS_TOKEN: z.string().optional(),
    PINTEREST_AD_ACCOUNT_ID: z.string().optional(),
    // Instantly.ai (cold email outreach)
    INSTANTLY_API_KEY: z.string().optional(), // Instantly API v2 key (Bearer auth)
    INSTANTLY_WEBHOOK_SECRET: z.string().optional(), // Shared secret sent as a header on Instantly webhooks
    // Minerva (lead enrichment)
    MINERVA_API_URL: z.string().url().default("https://api.minerva.io"), // Minerva API base URL (v2 default)
    MINERVA_API_KEY: z.string().min(1).optional(), // Minerva API key (x-api-key)
    // X / Twitter API v2
    X_CONSUMER_KEY: z.string().optional(),
    X_CONSUMER_SECRET: z.string().optional(),
    X_BEARER_TOKEN: z.string().optional(),
    // Zernio (social channel centralization + ROI)
    ZERNIO_API_KEY: z.string().optional(),
    ZERNIO_WEBHOOK_SECRET: z.string().optional(),
    // Apify (actor runs for scraping/enrichment)
    APIFY_API_KEY: z.string().optional(),
    // Bright Data (dataset scrapes for competitor/peer social posts)
    BRIGHT_DATA_API_KEY: z.string().optional(),
    // HubSpot (sales CRM — shared private-app token, same app as wander.com;
    // gateway scopes get added to this app rather than a separate one)
    HUBSPOT_ACCESS_TOKEN_OPERATED: z.string().optional(),
    // Inbound bearer for /api/hubspot/v1/* callers (wander.com, monolith) —
    // authenticates callers to OUR gateway routes, unrelated to HubSpot auth
    GROWTH_GATEWAY_API_TOKEN: z.string().min(32).optional(),
    // HubSpot webhooks — the shared private app's client secret, used to
    // verify the v3 request signature on /api/webhooks/hubspot
    HUBSPOT_WEBHOOK_CLIENT_SECRET: z.string().optional(),
    // Lead enrichment — discovery providers (all optional; missing key skips that provider)
    PERPLEXITY_API_KEY: z.string().optional(), // Perplexity sonar web search
    TAVILY_API_KEY: z.string().optional(), // Tavily search/extract
    PARALLEL_API_KEY: z.string().optional(), // Parallel.ai task/search API
    EXA_API_KEY: z.string().optional(), // Exa neural search + contents
    // Cloudflare media library — R2 (images/files) + Stream (video)
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(), // e.g. 026c91fc5cd3dd05f22c65e8f237ca2c
    R2_ACCESS_KEY_ID: z.string().optional(), // R2 API token access key id
    R2_SECRET_ACCESS_KEY: z.string().optional(), // R2 API token secret
    R2_BUCKET: z.string().default("growth"), // dedicated growth media bucket
    R2_PREFIX: z.string().default(""), // optional key prefix (only when sharing a bucket)
    R2_PUBLIC_BASE_URL: z.string().url().optional(), // public domain/r2.dev URL mapped to the bucket
    CLOUDFLARE_STREAM_TOKEN: z.string().optional(), // API token with Stream:Edit
    CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().optional(), // Stream webhook signing secret
    RESEND_WEBHOOK_SECRET: z.string().optional(), // Resend inbound webhook signing secret (whsec_…)
    // Slack — reuses the shared wandercom Slack app bot token. Posts to channel
    // IDs via chat.postMessage (#radio-social-listening, etc.). Missing → posts
    // are skipped (no-op), never an error.
    SLACK_API_TOKEN: z.string().optional(), // Bot token (xoxb-…)
    SLACK_AMPLIFICATION_CHANNEL_ID: z.string().optional(),
    SLACK_AMPLIFICATION_COORDINATOR_USER_ID: z
      .string()
      .regex(/^[UW][A-Z0-9]{7,}$/)
      .optional(),
    // Impact.com Brand API (affiliate program ops — docs/affiliate-program-takeover.md).
    // Basic auth: AccountSID as username, AuthToken as password. Created in the
    // Impact dashboard under Settings → API Access. Missing → the client no-ops.
    IMPACT_ACCOUNT_SID: z.string().optional(),
    IMPACT_AUTH_TOKEN: z.string().optional(),
  },

  /**
   * Specify your shared environment variables schema here (accessible on both client and server).
   */
  shared: {
    NEXT_PUBLIC_VERCEL_ENV: z
      .enum(["development", "preview", "production"])
      .optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(), // For analytics
    // Cloudflare Stream customer subdomain — public (appears in page HTML), not a
    // secret. Builds playback/thumbnail URLs. Override only if the account changes.
    NEXT_PUBLIC_STREAM_SUBDOMAIN: z
      .string()
      .default("customer-qmayhafe7iottqnh"),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DB_EXPERIMENT_BRANCH: process.env.DB_EXPERIMENT_BRANCH,
    NODE_ENV: process.env.NODE_ENV,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    LIFECYCLE_ENABLED: process.env.LIFECYCLE_ENABLED,
    AMPLITUDE_INGEST_ENABLED: process.env.AMPLITUDE_INGEST_ENABLED,
    LIFECYCLE_BASE_URL: process.env.LIFECYCLE_BASE_URL,
    LIFECYCLE_RUNTIME_ID: process.env.LIFECYCLE_RUNTIME_ID,
    POSTMARK_ACCOUNT_TOKEN: process.env.POSTMARK_ACCOUNT_TOKEN,
    POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN,
    POSTMARK_WEBHOOK_SECRET: process.env.POSTMARK_WEBHOOK_SECRET,
    SAAS_ENTRI_APPLICATION_ID: process.env.SAAS_ENTRI_APPLICATION_ID,
    SAAS_ENTRI_APPLICATION_SECRET: process.env.SAAS_ENTRI_APPLICATION_SECRET,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_REPLY_TO_EMAIL: process.env.RESEND_REPLY_TO_EMAIL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_DRIVE_CLIENT_ID: process.env.GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    FAL_AI_API_KEY: process.env.FAL_AI_API_KEY,
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    DATOCMS_CMA_TOKEN: process.env.DATOCMS_CMA_TOKEN,
    DATOCMS_PREVIEW_SECRET: process.env.DATOCMS_PREVIEW_SECRET,
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    OUTREACH_S2S_GUID: process.env.OUTREACH_S2S_GUID,
    OUTREACH_PRIVATE_KEY: process.env.OUTREACH_PRIVATE_KEY,
    OUTREACH_INSTALL_ID: process.env.OUTREACH_INSTALL_ID,
    OUTREACH_OAUTH_CLIENT_ID: process.env.OUTREACH_OAUTH_CLIENT_ID,
    OUTREACH_OAUTH_CLIENT_SECRET: process.env.OUTREACH_OAUTH_CLIENT_SECRET,
    OUTREACH_WEBHOOK_SECRET: process.env.OUTREACH_WEBHOOK_SECRET,
    WANDER_API_URL: process.env.WANDER_API_URL,
    WANDER_API_KEY: process.env.WANDER_API_KEY,
    PREGEN_WEBHOOK_SECRET: process.env.PREGEN_WEBHOOK_SECRET,
    PREGEN_PREVIEW_HOST_ZONE: process.env.PREGEN_PREVIEW_HOST_ZONE,
    OUTREACH_DISABLE_WEBHOOK_SIGNATURE_CHECK:
      process.env.OUTREACH_DISABLE_WEBHOOK_SIGNATURE_CHECK,
    // Customer.io
    CUSTOMER_IO_APP_KEY: process.env.CUSTOMER_IO_APP_KEY,
    CUSTOMER_IO_SITE_ID: process.env.CUSTOMER_IO_SITE_ID,
    CUSTOMER_IO_API_KEY: process.env.CUSTOMER_IO_API_KEY,
    CUSTOMERIO_WEBHOOK_SECRET: process.env.CUSTOMERIO_WEBHOOK_SECRET,
    CUSTOMERIO_WEBHOOK_BEARER_TOKEN:
      process.env.CUSTOMERIO_WEBHOOK_BEARER_TOKEN,
    // BigQuery
    EMAIL_AUDIENCE_DEV_SCHEMA: process.env.EMAIL_AUDIENCE_DEV_SCHEMA,
    BIGQUERY_PROJECT_ID: process.env.BIGQUERY_PROJECT_ID,
    BIGQUERY_DATASET_ID: process.env.BIGQUERY_DATASET_ID,
    GOOGLE_APPLICATION_CREDENTIALS_JSON:
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    GCP_SA_JSON_B64: process.env.GCP_SA_JSON_B64,
    SYNC_DEBUG: process.env.SYNC_DEBUG,
    // Meta Ads
    FB_SYSUSER_TOKEN: process.env.FB_SYSUSER_TOKEN,
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
    META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID,
    META_ADS_ACCESS_TOKEN: process.env.META_ADS_ACCESS_TOKEN,
    META_LEADS_ACCESS_TOKEN: process.env.META_LEADS_ACCESS_TOKEN,
    META_LEADS_APP_SECRET: process.env.META_LEADS_APP_SECRET,
    META_LEADGEN_VERIFY_TOKEN: process.env.META_LEADGEN_VERIFY_TOKEN,
    META_LEADGEN_ROUTE_FROM: process.env.META_LEADGEN_ROUTE_FROM,
    REVENUEHERO_LOOKUP_WEBHOOK_URL: process.env.REVENUEHERO_LOOKUP_WEBHOOK_URL,
    // Google Ads (spend-tracker connector)
    GOOGLE_ADS_SERVICE_ACCOUNT_JSON:
      process.env.GOOGLE_ADS_SERVICE_ACCOUNT_JSON,
    GOOGLE_ADS_CLIENT_ID: process.env.GOOGLE_ADS_CLIENT_ID,
    GOOGLE_ADS_CLIENT_SECRET: process.env.GOOGLE_ADS_CLIENT_SECRET,
    GOOGLE_ADS_REFRESH_TOKEN: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    GOOGLE_ADS_CUSTOMER_ID: process.env.GOOGLE_ADS_CUSTOMER_ID,
    // Pinterest Ads (spend-tracker connector)
    PINTEREST_ACCESS_TOKEN: process.env.PINTEREST_ACCESS_TOKEN,
    PINTEREST_AD_ACCOUNT_ID: process.env.PINTEREST_AD_ACCOUNT_ID,
    // Instantly
    INSTANTLY_API_KEY: process.env.INSTANTLY_API_KEY,
    INSTANTLY_WEBHOOK_SECRET: process.env.INSTANTLY_WEBHOOK_SECRET,
    // Minerva
    MINERVA_API_URL: process.env.MINERVA_API_URL,
    MINERVA_API_KEY: process.env.MINERVA_API_KEY,
    // X / Twitter
    X_CONSUMER_KEY: process.env.X_CONSUMER_KEY,
    X_CONSUMER_SECRET: process.env.X_CONSUMER_SECRET,
    X_BEARER_TOKEN: process.env.X_BEARER_TOKEN,
    // Zernio
    ZERNIO_API_KEY: process.env.ZERNIO_API_KEY,
    ZERNIO_WEBHOOK_SECRET: process.env.ZERNIO_WEBHOOK_SECRET,
    // Apify
    APIFY_API_KEY: process.env.APIFY_API_KEY,
    // Bright Data
    BRIGHT_DATA_API_KEY: process.env.BRIGHT_DATA_API_KEY,
    // HubSpot
    HUBSPOT_ACCESS_TOKEN_OPERATED: process.env.HUBSPOT_ACCESS_TOKEN_OPERATED,
    GROWTH_GATEWAY_API_TOKEN: process.env.GROWTH_GATEWAY_API_TOKEN,
    HUBSPOT_WEBHOOK_CLIENT_SECRET: process.env.HUBSPOT_WEBHOOK_CLIENT_SECRET,
    // Lead enrichment — discovery providers
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    PARALLEL_API_KEY: process.env.PARALLEL_API_KEY,
    EXA_API_KEY: process.env.EXA_API_KEY,
    // Cloudflare media
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
    R2_PREFIX: process.env.R2_PREFIX,
    R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
    WANDER_COM_BASE_URL: process.env.WANDER_COM_BASE_URL,
    CLOUDFLARE_STREAM_TOKEN: process.env.CLOUDFLARE_STREAM_TOKEN,
    CLOUDFLARE_STREAM_WEBHOOK_SECRET:
      process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    SLACK_API_TOKEN: process.env.SLACK_API_TOKEN,
    SLACK_AMPLIFICATION_CHANNEL_ID: process.env.SLACK_AMPLIFICATION_CHANNEL_ID,
    SLACK_AMPLIFICATION_COORDINATOR_USER_ID:
      process.env.SLACK_AMPLIFICATION_COORDINATOR_USER_ID,
    IMPACT_ACCOUNT_SID: process.env.IMPACT_ACCOUNT_SID,
    IMPACT_AUTH_TOKEN: process.env.IMPACT_AUTH_TOKEN,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_STREAM_SUBDOMAIN: process.env.NEXT_PUBLIC_STREAM_SUBDOMAIN,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});

/**
 * Environment-aware value selector
 * Selects values based on current environment (production vs test)
 * Matches production vs preview/development mode
 */
export function envSelect<T>(values: { prod: T; test: T }): T {
  return env.NEXT_PUBLIC_VERCEL_ENV === "production"
    ? values.prod
    : values.test;
}
