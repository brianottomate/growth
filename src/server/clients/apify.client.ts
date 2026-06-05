import "server-only";

import { ApifyClient } from "apify-client";
import { env } from "@/env";

// =====================================================
// CLIENT INITIALIZATION
// =====================================================

/**
 * Apify API client for invoking actors (scrapers / enrichment).
 *
 * Authenticated with the Wander **organization** API token (APIFY_API_KEY) so
 * runs, usage, and storage belong to the org rather than an individual user.
 *
 * Use `isApifyConfigured` to guard optional features; the client itself is only
 * constructed when a token is present.
 *
 * @see https://docs.apify.com/api/client/js
 */
export const isApifyConfigured = !!env.APIFY_API_KEY;

export const apify = isApifyConfigured
  ? new ApifyClient({ token: env.APIFY_API_KEY })
  : null;

/** Throw a clear error if Apify is used without a configured token. */
function requireApify(): ApifyClient {
  if (!apify) {
    throw new Error(
      "Apify is not configured — set APIFY_API_KEY (org API token) in the environment.",
    );
  }
  return apify;
}

// =====================================================
// ACTOR OPERATIONS
// =====================================================

/**
 * Run an actor to completion and return its dataset items.
 *
 * Blocks until the run finishes (Fluid Compute handles the long wait). For
 * fire-and-forget runs use `apify.actor(id).start(...)` directly.
 *
 * @example
 * ```ts
 * const posts = await runActor<{ url: string }>("apify/instagram-scraper", {
 *   directUrls: ["https://instagram.com/wander"],
 *   resultsLimit: 30,
 * });
 * ```
 */
export async function runActor<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  options?: { timeout?: number; memory?: number },
): Promise<T[]> {
  const client = requireApify();
  const run = await client.actor(actorId).call(input, {
    timeout: options?.timeout,
    memory: options?.memory,
  });
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items as T[];
}
