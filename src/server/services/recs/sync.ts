/**
 * Phase 5: Sync personalized recommendations to Customer.io profile attributes.
 *
 * Writes flat attributes to each user's CIO profile via the Track API.
 * These attributes power dynamic email templates (Liquid snippets).
 *
 * Attributes written per user (For You feed × 3 slots):
 *   rec_for_you_1_name, rec_for_you_1_image, rec_for_you_1_url,
 *   rec_for_you_1_city, rec_for_you_1_state, rec_for_you_1_price,
 *   rec_for_you_1_beds, rec_for_you_1_landscape, rec_for_you_1_description,
 *   rec_for_you_1_cta
 *   (repeated for _2 and _3)
 *   recs_updated_at  — date string of last sync
 *   recs_is_cold_start — boolean
 *
 * Ported from Python: clients/wander/recs/sync_to_cio.py
 */
import "server-only";
import { trackClient } from "@/server/clients/customerio.client";
import type { UserRecommendations, Recommendation } from "./types";
import { RECS_CONFIG, REC_FIELDS } from "./types";

// ── Config ────────────────────────────────────────────────────

const CONCURRENCY = 8; // Parallel requests (CIO Track API limit ~10/sec)
const FEEDS = RECS_CONFIG.feeds; // ["for_you"]
const SLOTS_PER_FEED = RECS_CONFIG.slotsPerFeed; // 3

// ── Attribute Builders ────────────────────────────────────────

function recToAttributes(
  rec: Recommendation,
  feedPrefix: string,
  slotNum: number,
  propertyDescriptions?: Record<string, string>,
  propertyCtas?: Record<string, string>,
): Record<string, string | number | boolean | null> {
  const prefix = `rec_${feedPrefix}_${slotNum}`;
  const propName = rec.property_name;

  let description = propertyDescriptions?.[propName] ?? "";
  if (description.length > 500) {
    const truncated = description.slice(0, 497);
    const lastSpace = truncated.lastIndexOf(" ");
    description = (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "...";
  }

  return {
    [`${prefix}_name`]: propName,
    [`${prefix}_image`]: rec.cover_image_url,
    [`${prefix}_url`]: rec.url,
    [`${prefix}_city`]: rec.city,
    [`${prefix}_state`]: rec.state,
    [`${prefix}_price`]: rec.base_price,
    [`${prefix}_beds`]: rec.bedrooms ?? null,
    [`${prefix}_landscape`]: rec.landscape,
    [`${prefix}_description`]: description,
    [`${prefix}_cta`]: propertyCtas?.[propName] ?? "Explore this home",
  };
}

function buildUserAttributes(
  userRecs: UserRecommendations,
  propertyDescriptions?: Record<string, string>,
  propertyCtas?: Record<string, string>,
): Record<string, string | number | boolean | null> {
  const attrs: Record<string, string | number | boolean | null> = {};

  for (const feed of FEEDS) {
    const recs = userRecs[feed] ?? [];
    for (let i = 0; i < Math.min(recs.length, SLOTS_PER_FEED); i++) {
      Object.assign(
        attrs,
        recToAttributes(recs[i]!, feed, i + 1, propertyDescriptions, propertyCtas),
      );
    }
    // Clear unused slots
    for (let i = recs.length; i < SLOTS_PER_FEED; i++) {
      for (const field of REC_FIELDS) {
        attrs[`rec_${feed}_${i + 1}_${field}`] = "";
      }
    }
  }

  attrs["recs_updated_at"] = new Date().toISOString().split("T")[0]!;
  attrs["recs_is_cold_start"] = userRecs.is_cold_start;
  return attrs;
}

// ── Concurrent Sync ───────────────────────────────────────────

async function syncUser(
  identifier: string,
  attrs: Record<string, string | number | boolean | null>,
): Promise<boolean> {
  try {
    await trackClient.identify(identifier, attrs);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("429")) {
      // Rate limited — wait and retry once
      await new Promise((r) => setTimeout(r, 1000));
      try {
        await trackClient.identify(identifier, attrs);
        return true;
      } catch {
        return false;
      }
    }
    console.error(`  Failed to sync ${identifier}: ${msg}`);
    return false;
  }
}

async function runConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

// ── Public API ────────────────────────────────────────────────

export interface SyncOptions {
  /** Set of user IDs to exclude (unsubscribed) */
  excludeIds?: Set<string>;
  /** Property descriptions for enrichment (property_name → description) */
  propertyDescriptions?: Record<string, string>;
  /** Property CTAs (property_name → CTA text) */
  propertyCtas?: Record<string, string>;
  /** Max users to sync (for testing) */
  limit?: number;
  /** If true, don't write to CIO — just return stats */
  dryRun?: boolean;
}

export interface SyncResult {
  synced: number;
  failed: number;
  skippedUnsub: number;
  skippedNoId: number;
  totalAttributes: number;
  elapsedMs: number;
}

export async function syncRecommendationsToCIO(
  allRecs: Map<string, UserRecommendations>,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const {
    excludeIds = new Set(),
    propertyDescriptions,
    propertyCtas,
    limit,
    dryRun = false,
  } = options;

  console.log(`\nPhase 5: Sync to Customer.io [${dryRun ? "DRY RUN" : "LIVE"}]`);

  // Build payloads
  const payloads: Array<{ identifier: string; attrs: Record<string, string | number | boolean | null> }> = [];
  let skippedUnsub = 0;
  let skippedNoId = 0;

  for (const [uid, recs] of allRecs) {
    if (limit && payloads.length >= limit) break;

    if (excludeIds.has(uid)) {
      skippedUnsub++;
      continue;
    }

    if (!uid) {
      skippedNoId++;
      continue;
    }

    const attrs = buildUserAttributes(recs, propertyDescriptions, propertyCtas);
    payloads.push({ identifier: uid, attrs });
  }

  const attrsPerUser = FEEDS.length * SLOTS_PER_FEED * REC_FIELDS.length + 2;
  console.log(
    `  ${payloads.length.toLocaleString()} users to sync ` +
    `(${skippedUnsub.toLocaleString()} unsub, ${skippedNoId} no ID)`,
  );
  console.log(`  ${attrsPerUser} attributes per user`);

  if (dryRun) {
    console.log("  DRY RUN — no data written");
    return {
      synced: 0,
      failed: 0,
      skippedUnsub,
      skippedNoId,
      totalAttributes: payloads.length * attrsPerUser,
      elapsedMs: 0,
    };
  }

  // Sync concurrently
  const start = Date.now();
  let synced = 0;
  let failed = 0;

  const results = await runConcurrent(
    payloads,
    async (p) => syncUser(p.identifier, p.attrs),
    CONCURRENCY,
  );

  for (const ok of results) {
    if (ok) synced++;
    else failed++;
  }

  const elapsedMs = Date.now() - start;
  const rate = synced / Math.max(elapsedMs / 1000, 1);

  console.log(`  Synced ${synced.toLocaleString()} users in ${(elapsedMs / 1000).toFixed(1)}s (${rate.toFixed(0)}/sec)`);
  if (failed > 0) {
    console.log(`  Failed: ${failed.toLocaleString()}`);
  }

  return {
    synced,
    failed,
    skippedUnsub,
    skippedNoId,
    totalAttributes: synced * attrsPerUser,
    elapsedMs,
  };
}
