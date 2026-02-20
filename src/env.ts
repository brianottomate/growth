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
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    RESEND_API_KEY: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    ADMIN_TOKEN: z.string().min(32), // Require strong token (32+ chars)
    OPENAI_API_KEY: z.string().min(1), // Required for voice chat
    ANTHROPIC_API_KEY: z.string().optional(), // For Claude AI features
    FIRECRAWL_API_KEY: z.string().optional(), // For web scraping
    OUTREACH_S2S_GUID: z.string().optional(), // For Outreach S2S auth
    OUTREACH_PRIVATE_KEY: z.string().optional(), // For Outreach S2S JWT signing
    OUTREACH_INSTALL_ID: z.string().optional(), // For Outreach app installation
    OUTREACH_OAUTH_CLIENT_ID: z.string().optional(), // For Outreach OAuth
    OUTREACH_OAUTH_CLIENT_SECRET: z.string().optional(), // For Outreach OAuth
    OUTREACH_WEBHOOK_SECRET: z.string().optional(), // For Outreach webhook verification
    // Customer.io
    CUSTOMER_IO_APP_KEY: z.string().min(1), // App API key (Bearer) for reading customer data
    CUSTOMER_IO_SITE_ID: z.string().min(1), // Site ID for Track API (Basic auth)
    CUSTOMER_IO_API_KEY: z.string().min(1), // Track API key for writing/updating data
    CUSTOMERIO_WEBHOOK_SECRET: z.string().min(1), // HMAC-SHA256 for CIO reporting webhooks
    CUSTOMERIO_WEBHOOK_BEARER_TOKEN: z.string().min(1), // Bearer token auth for CIO workflow HTTP Request actions
    // BigQuery
    BIGQUERY_PROJECT_ID: z.string().min(1), // GCP project ID (required)
    BIGQUERY_DATASET_ID: z.string().optional(), // Default dataset
    GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(), // Service account JSON (as string)
    GCP_SA_JSON_B64: z.string().optional(), // Base64-encoded service account JSON
    SYNC_DEBUG: z.coerce.boolean().default(true), // Debug logging for sync/workflow traces
    // Minerva (lead enrichment)
    MINERVA_API_URL: z.string().url().default("https://api.minerva.io"), // Minerva API base URL (v2 default)
    MINERVA_API_KEY: z.string().min(1).optional(), // Minerva API key (x-api-key)
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
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    OUTREACH_S2S_GUID: process.env.OUTREACH_S2S_GUID,
    OUTREACH_PRIVATE_KEY: process.env.OUTREACH_PRIVATE_KEY,
    OUTREACH_INSTALL_ID: process.env.OUTREACH_INSTALL_ID,
    OUTREACH_OAUTH_CLIENT_ID: process.env.OUTREACH_OAUTH_CLIENT_ID,
    OUTREACH_OAUTH_CLIENT_SECRET: process.env.OUTREACH_OAUTH_CLIENT_SECRET,
    OUTREACH_WEBHOOK_SECRET: process.env.OUTREACH_WEBHOOK_SECRET,
    // Customer.io
    CUSTOMER_IO_APP_KEY: process.env.CUSTOMER_IO_APP_KEY,
    CUSTOMER_IO_SITE_ID: process.env.CUSTOMER_IO_SITE_ID,
    CUSTOMER_IO_API_KEY: process.env.CUSTOMER_IO_API_KEY,
    CUSTOMERIO_WEBHOOK_SECRET: process.env.CUSTOMERIO_WEBHOOK_SECRET,
    CUSTOMERIO_WEBHOOK_BEARER_TOKEN:
      process.env.CUSTOMERIO_WEBHOOK_BEARER_TOKEN,
    // BigQuery
    BIGQUERY_PROJECT_ID: process.env.BIGQUERY_PROJECT_ID,
    BIGQUERY_DATASET_ID: process.env.BIGQUERY_DATASET_ID,
    GOOGLE_APPLICATION_CREDENTIALS_JSON:
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    GCP_SA_JSON_B64: process.env.GCP_SA_JSON_B64,
    SYNC_DEBUG: process.env.SYNC_DEBUG,
    // Minerva
    MINERVA_API_URL: process.env.MINERVA_API_URL,
    MINERVA_API_KEY: process.env.MINERVA_API_KEY,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
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
