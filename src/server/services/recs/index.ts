/**
 * Personalized Recommendations Pipeline — Orchestrator
 *
 * Ties together all 5 phases:
 *   Phase 1: Generate property embeddings (Voyage AI)
 *   Phase 2: Aggregate user behavior signals into profiles
 *   Phase 3: Compute user preference embeddings (weighted avg)
 *   Phase 4: Score and rank properties per user → top recommendations
 *   Phase 5: Sync recommendations to Customer.io profile attributes
 *
 * The pipeline powers personalized email recommendations for ~238K users.
 * Runs as a scheduled job (daily or on-demand via API route).
 *
 * Ported from Python: clients/wander/recs/
 */
import "server-only";

// Re-exports
export type {
  BQProperty,
  BQUserSignal,
  BQUserSearch,
  PropertyEmbedding,
  PropertySignals,
  UserProfile,
  Recommendation,
  UserRecommendations,
  CIORecAttributes,
} from "./types";
export {
  SIGNAL_WEIGHTS,
  SCORING_WEIGHTS,
  RECS_CONFIG,
  REC_FIELDS,
} from "./types";

export { fetchProperties, fetchUserSignals, fetchUserSearches } from "./queries";
export { generatePropertyEmbeddings } from "./embeddings";
export {
  aggregateUserProfiles,
  computeAllUserEmbeddings,
  generateAllRecommendations,
} from "./engine";
export { syncRecommendationsToCIO } from "./sync";
export type { SyncOptions, SyncResult } from "./sync";

// ── Full Pipeline ─────────────────────────────────────────────

import { fetchProperties, fetchUserSignals, fetchUserSearches } from "./queries";
import { generatePropertyEmbeddings } from "./embeddings";
import { aggregateUserProfiles, computeAllUserEmbeddings, generateAllRecommendations } from "./engine";
import { syncRecommendationsToCIO } from "./sync";
import type { SyncOptions, SyncResult } from "./sync";
import type { UserRecommendations } from "./types";

export interface PipelineOptions {
  /** Voyage AI API key for embedding generation */
  voyageApiKey: string;
  /** If true, skip CIO sync (just generate recs) */
  skipSync?: boolean;
  /** Options passed to CIO sync */
  syncOptions?: SyncOptions;
}

export interface PipelineResult {
  propertyCount: number;
  userCount: number;
  embeddingCount: number;
  recsGenerated: number;
  coldStartCount: number;
  sync?: SyncResult;
  allRecs: Map<string, UserRecommendations>;
  elapsedMs: number;
}

/**
 * Run the full personalized recommendations pipeline.
 *
 * This is the main entry point — call from an API route or scheduled job.
 */
export async function runRecsPipeline(
  options: PipelineOptions,
): Promise<PipelineResult> {
  const start = Date.now();

  console.log("=" .repeat(60));
  console.log("Personalized Recommendations Pipeline");
  console.log("=" .repeat(60));

  // Phase 1: Fetch properties and generate embeddings
  console.log("\n── Phase 1: Property Embeddings ──────────────────────");
  const properties = await fetchProperties();
  console.log(`  Fetched ${properties.length} bookable properties`);

  const embeddings = await generatePropertyEmbeddings(properties, options.voyageApiKey);

  // Phase 2: Fetch user signals and aggregate profiles
  console.log("\n── Phase 2: User Profiles ────────────────────────────");
  const [signals, searches] = await Promise.all([
    fetchUserSignals(),
    fetchUserSearches(),
  ]);
  console.log(`  Fetched ${signals.length.toLocaleString()} signals, ${searches.length.toLocaleString()} searches`);

  const profiles = aggregateUserProfiles(signals, searches);

  // Phase 3: Compute user embeddings
  console.log("\n── Phase 3: User Embeddings ──────────────────────────");
  const userEmbeddings = computeAllUserEmbeddings(profiles, embeddings);

  // Phase 4: Generate recommendations
  console.log("\n── Phase 4: Recommendations ─────────────────────────");
  const allRecs = generateAllRecommendations(profiles, userEmbeddings, embeddings);

  let coldStartCount = 0;
  for (const recs of allRecs.values()) {
    if (recs.is_cold_start) coldStartCount++;
  }

  // Phase 5: Sync to Customer.io
  let syncResult: SyncResult | undefined;
  if (!options.skipSync) {
    console.log("\n── Phase 5: CIO Sync ────────────────────────────────");
    syncResult = await syncRecommendationsToCIO(allRecs, options.syncOptions);
  }

  const elapsedMs = Date.now() - start;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Pipeline complete in ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`  ${Object.keys(embeddings).length} properties`);
  console.log(`  ${allRecs.size.toLocaleString()} users (${coldStartCount.toLocaleString()} cold start)`);
  if (syncResult) {
    console.log(`  ${syncResult.synced.toLocaleString()} synced to CIO`);
  }
  console.log("=".repeat(60));

  return {
    propertyCount: properties.length,
    userCount: profiles.size,
    embeddingCount: Object.keys(embeddings).length,
    recsGenerated: allRecs.size,
    coldStartCount,
    sync: syncResult,
    allRecs,
    elapsedMs,
  };
}
