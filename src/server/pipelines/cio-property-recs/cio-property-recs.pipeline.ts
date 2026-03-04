/**
 * CIO Property Recommendations Pipeline
 *
 * Generates personalized property recommendations for ~450K users and syncs
 * them to Customer.io as profile attributes, which power personalized emails.
 *
 * PIPELINE STAGES
 * ───────────────
 * 1. Fetch ~4,700 bookable properties from BigQuery (analytics.int_properties)
 * 2. Generate OpenAI embeddings for each property (text-embedding-3-small, 1536 dims)
 * 3. Fetch user behavior signals from BigQuery (views, abandoned checkouts, bookings)
 * 4. Precompute property-level popularity + recency indexes (once, before user loop)
 * 5. For each user: compute taste embedding → cosine similarity → multi-factor score → top 3
 * 6. Sync 32 flat attributes per user to CIO (Track API identify or Pipelines batch)
 *
 * SCORING WEIGHTS
 * ───────────────
 * Similarity 50% · Popularity 15% · Recency 10% · Price match 10%
 * Diversity enforced via landscape-category filtering (not a score factor)
 *
 * CIO ATTRIBUTE SCHEMA (per user, 3 slots)
 * ─────────────────────────────────────────
 * rec_for_you_{1|2|3}_name         — property name
 * rec_for_you_{1|2|3}_image        — cover image URL
 * rec_for_you_{1|2|3}_url          — booking URL
 * rec_for_you_{1|2|3}_city         — city
 * rec_for_you_{1|2|3}_state        — state
 * rec_for_you_{1|2|3}_price        — base price per night
 * rec_for_you_{1|2|3}_beds         — bedroom count
 * rec_for_you_{1|2|3}_landscape    — landscape category
 * rec_for_you_{1|2|3}_description  — property description (truncated to 500 chars)
 * rec_for_you_{1|2|3}_cta          — call to action text
 * recs_updated_at                  — ISO date of last sync
 *
 * LIVE CIO TEMPLATE
 * ─────────────────
 * https://fly.customer.io/workspaces/142511/journeys/template/1802
 *
 * Example Liquid usage in CIO email templates:
 *   {{ customer.rec_for_you_1_name }}
 *   {{ customer.rec_for_you_1_description | truncate: 180 }}
 *   {{ customer.rec_for_you_1_cta | default: "Explore this home" }}
 *
 * HOW TO RUN
 * ──────────
 * bun scripts/test-recs-pipeline.ts --phase=fetch          # test BQ connectivity
 * bun scripts/test-recs-pipeline.ts --phase=embed --limit=3 # test OpenAI embeddings
 * bun scripts/test-recs-pipeline.ts --phase=rank --emails=you@wander.com
 * bun scripts/test-recs-pipeline.ts                        # full dry run
 * bun scripts/test-recs-pipeline.ts --live --limit=10      # sync 10 users to CIO
 */

import { executeQuery } from "@/server/clients/bigquery.client";
import { trackClient } from "@/server/clients/customerio.client";
import { generatePropertyEmbeddings, type PropertyEmbedding } from "./embed";
import { syncRecsViaPipelinesApi } from "./sync-batch";

// ── Config ────────────────────────────────────────────────────────────────────

const SIGNAL_WEIGHTS = {
  viewed: 1,
  abandoned: 4,
  booked: 5,
  wishlisted: 3,
} as const;

const SCORING = {
  similarity: 0.5,
  popularity: 0.15,
  recency: 0.1,
  priceMatch: 0.1,
  // diversity is enforced via landscape filtering, not a numeric score
} as const;

const CONFIG = {
  topCandidates: 50, // score top N by similarity, then apply multi-factor scoring
  recsPerUser: 3, // recommendation slots per user
  recencyWindowDays: 90, // properties with interaction in last N days get recency boost
  decayHalfLifeDays: 30, // user signal weight halves every N days
  decayFloor: 0.05, // minimum signal weight after decay
  cioConcurrency: 8, // parallel CIO Track API requests (~10/sec limit)
} as const;

const REC_FIELDS = [
  "name",
  "image",
  "url",
  "city",
  "state",
  "price",
  "beds",
  "landscape",
  "description",
  "cta",
] as const;

// ── BigQuery Row Types ────────────────────────────────────────────────────────

interface BQProperty {
  property_name: string;
  city: string;
  state: string;
  bedrooms: number | null;
  bathrooms: number | null;
  occupancy: number | null;
  base_price: number | null;
  landscape_category: string;
  description: string;
  has_pets_allowed: boolean;
  cover_image_url: string;
  url: string;
  dt_launched: string | null;
  testimonial_text: string | null;
  activities: string | null;
}

interface BQUserSignal {
  id_user: string;
  property_name: string;
  view_count: number;
  abandon_count: number;
  book_count: number;
  last_interaction: string | null;
}

interface BQUserSearch {
  id_user: string;
  search_location_state: string | null;
  search_location_city: string | null;
  search_count: number;
}

// ── Internal Types ────────────────────────────────────────────────────────────

interface PropertySignals {
  view_count: number;
  abandon_count: number;
  book_count: number;
  wishlisted: boolean;
  last_interaction: string | null;
}

interface UserProfile {
  properties: Record<string, PropertySignals>;
  searchLocations: Array<{
    state: string | null;
    city: string | null;
    count: number;
  }>;
  totalSignals: number;
}

// Precomputed property-level scores — built once, used for every user ranking
interface PropertyIndex {
  popularity: Map<string, number>; // normalized 0–1
  recency: Map<string, number>; // normalized 0–1 based on recencyWindowDays
}

interface Recommendation {
  propertyName: string;
  score: number;
  city: string;
  state: string;
  landscape: string;
  description: string;
  basePrice: number | null;
  bedrooms: number | null;
  url: string;
  imageUrl: string;
}

// ── Public Types ──────────────────────────────────────────────────────────────

export interface PipelineOptions {
  /** Skip CIO write — useful for local testing */
  dryRun?: boolean;
  /** Cap number of users synced — useful for smoke tests */
  limit?: number;
  /** Filter pipeline to specific users by email — for local testing */
  testEmails?: string[];
  /** Use Customer.io Data Pipelines /v1/batch sync instead of per-user identify() */
  useBatchSync?: boolean;
}

export interface PipelineResult {
  properties: number;
  users: number;
  coldStart: number;
  synced: number;
  failed: number;
  elapsedMs: number;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function lookupUserIdsByEmail(emails: string[]): Promise<string[]> {
  const rows = await executeQuery<{ id_user: string }>(
    `
    SELECT DISTINCT id_user
    FROM \`wander-9fc9c.analytics.customer_profiles\`
    WHERE LOWER(email) IN UNNEST(@emails)
      AND id_user IS NOT NULL
    `,
    { emails: emails.map((e) => e.toLowerCase()) },
    { emails: ["STRING"] },
  );
  return rows.map((r) => r.id_user);
}

export async function fetchBookableProperties(): Promise<BQProperty[]> {
  return executeQuery<BQProperty>(`
    SELECT
      p.property_name,
      p.city,
      p.state,
      p.bedrooms,
      p.bathrooms,
      p.occupancy,
      p.base_price,
      p.landscape_category,
      p.description,
      p.has_pets_allowed,
      p.cover_image_url,
      p.url,
      p.dt_launched,
      TO_JSON_STRING(ARRAY(SELECT r FROM UNNEST(p.testimonial_text) AS r LIMIT 3)) AS testimonial_text,
      TO_JSON_STRING(ARRAY(SELECT a FROM UNNEST(p.activities) AS a LIMIT 10)) AS activities
    FROM \`wander-9fc9c.analytics.int_properties\` p
    WHERE p.is_bookable = TRUE
      AND p.cover_image_url IS NOT NULL
    ORDER BY p.property_name
  `);
}

export async function fetchUserBehaviorSignals(userIds?: string[]): Promise<BQUserSignal[]> {
  const userFilter = userIds?.length
    ? `WHERE COALESCE(v.id_user, a.id_user, b.id_user) IN UNNEST(@user_ids)`
    : "";
  return executeQuery<BQUserSignal>(
    `
    WITH property_views AS (
      SELECT id_user, product_name AS property_name, COUNT(*) AS view_count, MAX(ts) AS last_view
      FROM \`wander-9fc9c.analytics.int_product_viewed\`
      WHERE id_user IS NOT NULL AND product_name IS NOT NULL
      GROUP BY id_user, product_name
    ),
    abandoned_checkouts AS (
      SELECT id_user, property_name, COUNT(*) AS abandon_count, MAX(ts) AS last_abandon
      FROM \`wander-9fc9c.analytics.funnel_events\`
      WHERE event_type = 'checkout_started'
        AND id_user IS NOT NULL AND property_name IS NOT NULL
      GROUP BY id_user, property_name
    ),
    bookings AS (
      SELECT id_user, property_name, COUNT(*) AS book_count, MAX(ts_created) AS last_booking
      FROM \`wander-9fc9c.analytics.bookings_gmv\`
      WHERE is_profit = TRUE AND status = 'confirmed'
        AND id_user IS NOT NULL AND property_name IS NOT NULL
      GROUP BY id_user, property_name
    )
    SELECT
      COALESCE(v.id_user, a.id_user, b.id_user) AS id_user,
      COALESCE(v.property_name, a.property_name, b.property_name) AS property_name,
      COALESCE(v.view_count, 0) AS view_count,
      COALESCE(a.abandon_count, 0) AS abandon_count,
      COALESCE(b.book_count, 0) AS book_count,
      CAST(GREATEST(v.last_view, a.last_abandon, b.last_booking) AS STRING) AS last_interaction
    FROM property_views v
    FULL OUTER JOIN abandoned_checkouts a ON v.id_user = a.id_user AND v.property_name = a.property_name
    FULL OUTER JOIN bookings b
      ON COALESCE(v.id_user, a.id_user) = b.id_user
      AND COALESCE(v.property_name, a.property_name) = b.property_name
    ${userFilter}
  `,
    userIds?.length ? { user_ids: userIds } : undefined,
    userIds?.length ? { user_ids: ["STRING"] } : undefined,
  );
}

export async function fetchUserSearchHistory(userIds?: string[]): Promise<BQUserSearch[]> {
  const userFilter = userIds?.length ? `AND id_user IN UNNEST(@user_ids)` : "";
  return executeQuery<BQUserSearch>(
    `
    SELECT id_user, search_location_state, search_location_city, COUNT(*) AS search_count
    FROM \`wander-9fc9c.analytics.search_sessions\`
    WHERE id_user IS NOT NULL AND search_location_state IS NOT NULL
      ${userFilter}
    GROUP BY id_user, search_location_state, search_location_city
    ORDER BY id_user, search_count DESC
  `,
    userIds?.length ? { user_ids: userIds } : undefined,
    userIds?.length ? { user_ids: ["STRING"] } : undefined,
  );
}

// ── Profile Building ──────────────────────────────────────────────────────────

export function buildUserProfiles(
  signals: BQUserSignal[],
  searches: BQUserSearch[],
): Map<string, UserProfile> {
  const profiles = new Map<string, UserProfile>();

  const getOrCreate = (uid: string): UserProfile => {
    let p = profiles.get(uid);
    if (!p) {
      p = { properties: {}, searchLocations: [], totalSignals: 0 };
      profiles.set(uid, p);
    }
    return p;
  };

  for (const row of signals) {
    const profile = getOrCreate(row.id_user);
    const existing = profile.properties[row.property_name];
    if (existing) {
      existing.view_count += row.view_count;
      existing.abandon_count += row.abandon_count;
      existing.book_count += row.book_count;
      if (
        row.last_interaction &&
        (!existing.last_interaction ||
          row.last_interaction > existing.last_interaction)
      ) {
        existing.last_interaction = row.last_interaction;
      }
    } else {
      profile.properties[row.property_name] = {
        view_count: row.view_count,
        abandon_count: row.abandon_count,
        book_count: row.book_count,
        wishlisted: false,
        last_interaction: row.last_interaction,
      };
    }
  }

  const searchByUser = new Map<string, BQUserSearch[]>();
  for (const row of searches) {
    if (!searchByUser.has(row.id_user)) searchByUser.set(row.id_user, []);
    searchByUser.get(row.id_user)!.push(row);
  }
  for (const [uid, locs] of searchByUser) {
    const profile = getOrCreate(uid);
    profile.searchLocations = locs
      .sort((a, b) => b.search_count - a.search_count)
      .map((l) => ({
        state: l.search_location_state,
        city: l.search_location_city,
        count: l.search_count,
      }));
  }

  for (const profile of profiles.values()) {
    let total = 0;
    for (const s of Object.values(profile.properties)) {
      total +=
        s.view_count * SIGNAL_WEIGHTS.viewed +
        s.abandon_count * SIGNAL_WEIGHTS.abandoned +
        s.book_count * SIGNAL_WEIGHTS.booked +
        (s.wishlisted ? SIGNAL_WEIGHTS.wishlisted : 0);
    }
    profile.totalSignals = total;
  }

  // Drop users with no property interactions
  for (const [uid, profile] of profiles) {
    if (Object.keys(profile.properties).length === 0) profiles.delete(uid);
  }

  return profiles;
}

// ── Property Index ────────────────────────────────────────────────────────────

/**
 * Precompute property-level popularity and recency scores.
 * Called once before the user ranking loop — avoids O(users × properties) recomputation.
 */
export function buildPropertyIndex(profiles: Map<string, UserProfile>): PropertyIndex {
  const popRaw = new Map<string, number>();
  const latestInteraction = new Map<string, string>();

  for (const profile of profiles.values()) {
    for (const [name, s] of Object.entries(profile.properties)) {
      popRaw.set(
        name,
        (popRaw.get(name) ?? 0) +
          s.view_count +
          s.abandon_count * 3 +
          s.book_count * 10,
      );
      if (s.last_interaction) {
        const cur = latestInteraction.get(name);
        if (!cur || s.last_interaction > cur)
          latestInteraction.set(name, s.last_interaction);
      }
    }
  }

  const maxPop = Math.max(...popRaw.values(), 1);
  const popularity = new Map([...popRaw].map(([k, v]) => [k, v / maxPop]));

  const now = Date.now();
  const recency = new Map<string, number>();
  for (const [name, ts] of latestInteraction) {
    const daysAgo = (now - new Date(ts).getTime()) / 86_400_000;
    recency.set(name, Math.max(0, 1 - daysAgo / CONFIG.recencyWindowDays));
  }

  return { popularity, recency };
}

// ── Vector Math ───────────────────────────────────────────────────────────────

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

function normalize(v: number[]): number[] {
  const n = Math.sqrt(dot(v, v));
  return n === 0 ? v : v.map((x) => x / n);
}

function timeDecay(lastInteraction: string | null): number {
  if (!lastInteraction) return CONFIG.decayFloor;
  // BQ may return timestamps as objects — extract .value if needed
  const ts = typeof lastInteraction === "object" ? (lastInteraction as { value: string }).value : lastInteraction;
  const daysAgo = (Date.now() - new Date(ts).getTime()) / 86_400_000;
  if (isNaN(daysAgo)) return CONFIG.decayFloor;
  return Math.max(
    Math.pow(2, -daysAgo / CONFIG.decayHalfLifeDays),
    CONFIG.decayFloor,
  );
}

function computeUserEmbedding(
  profile: UserProfile,
  embeddings: Record<string, PropertyEmbedding>,
): number[] | null {
  const dim = Object.values(embeddings)[0]?.embedding.length ?? 1024;
  const sum = new Array<number>(dim).fill(0);
  let totalWeight = 0;

  for (const [name, signals] of Object.entries(profile.properties)) {
    const emb =
      embeddings[name] ?? findEmbeddingCaseInsensitive(embeddings, name);
    if (!emb) continue;

    const rawWeight =
      signals.view_count * SIGNAL_WEIGHTS.viewed +
      signals.abandon_count * SIGNAL_WEIGHTS.abandoned +
      signals.book_count * SIGNAL_WEIGHTS.booked +
      (signals.wishlisted ? SIGNAL_WEIGHTS.wishlisted : 0);

    if (rawWeight > 0) {
      const w = rawWeight * timeDecay(signals.last_interaction);
      for (let i = 0; i < dim; i++) sum[i]! += emb.embedding[i]! * w;
      totalWeight += w;
    }
  }

  if (totalWeight === 0) return null;
  return sum.map((v) => v / totalWeight);
}

function findEmbeddingCaseInsensitive(
  embeddings: Record<string, PropertyEmbedding>,
  name: string,
): PropertyEmbedding | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(embeddings)) {
    if (k.toLowerCase() === lower) return v;
  }
}

// ── Ranking ───────────────────────────────────────────────────────────────────

function inferUserPricePreference(
  profile: UserProfile,
  embeddings: Record<string, PropertyEmbedding>,
): number | null {
  const prices: number[] = [];
  for (const [name, s] of Object.entries(profile.properties)) {
    const emb = embeddings[name];
    if (emb?.base_price) {
      const weight = s.view_count + s.abandon_count * 2 + s.book_count * 5;
      for (let i = 0; i < Math.max(1, weight); i++) prices.push(emb.base_price);
    }
  }
  if (!prices.length) return null;
  prices.sort((a, b) => a - b);
  return prices[Math.floor(prices.length / 2)]!; // median
}

function priceMatchScore(
  candidatePrice: number | null,
  userPricePref: number | null,
): number {
  if (!candidatePrice || !userPricePref) return 0.5;
  const ratio = candidatePrice / userPricePref;
  return Math.max(0, 1 - Math.abs(Math.log(Math.max(ratio, 0.1))) * 0.5);
}

function rankPropertiesForUser(
  userEmbedding: number[],
  profile: UserProfile,
  embeddings: Record<string, PropertyEmbedding>,
  index: PropertyIndex,
): Recommendation[] {
  const booked = new Set(
    Object.entries(profile.properties)
      .filter(([, s]) => s.book_count > 0)
      .map(([name]) => name),
  );
  const pricePref = inferUserPricePreference(profile, embeddings);
  const userNorm = normalize(userEmbedding);

  // Score all properties by cosine similarity, exclude already-booked
  const bySimilarity: Array<{ name: string; sim: number }> = [];
  for (const [name, emb] of Object.entries(embeddings)) {
    if (booked.has(name)) continue;
    bySimilarity.push({ name, sim: dot(userNorm, normalize(emb.embedding)) });
  }
  bySimilarity.sort((a, b) => b.sim - a.sim);

  // Apply multi-factor scoring to top candidates
  const scored: Recommendation[] = [];
  for (const { name, sim } of bySimilarity.slice(0, CONFIG.topCandidates)) {
    const emb = embeddings[name]!;
    const score =
      sim * SCORING.similarity +
      (index.recency.get(name) ?? 0) * SCORING.recency +
      (index.popularity.get(name) ?? 0) * SCORING.popularity +
      priceMatchScore(emb.base_price, pricePref) * SCORING.priceMatch;

    scored.push({
      propertyName: name,
      score: Math.round(score * 10_000) / 10_000,
      city: emb.city,
      state: emb.state,
      landscape: emb.landscape,
      description: emb.description,
      basePrice: emb.base_price,
      bedrooms: emb.bedrooms,
      url: emb.url,
      imageUrl: emb.cover_image_url,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Pick top N with landscape diversity
  const result: Recommendation[] = [];
  const seenLandscapes = new Set<string>();
  for (const rec of scored) {
    if (result.length >= CONFIG.recsPerUser) break;
    if (
      seenLandscapes.has(rec.landscape) &&
      result.length < CONFIG.recsPerUser - 1
    )
      continue;
    result.push(rec);
    seenLandscapes.add(rec.landscape);
  }
  // Fill any remaining slots if diversity filtering was too aggressive
  for (const rec of scored) {
    if (result.length >= CONFIG.recsPerUser) break;
    if (!result.includes(rec)) result.push(rec);
  }

  return result;
}

function buildColdStartRecs(
  embeddings: Record<string, PropertyEmbedding>,
  index: PropertyIndex,
): Recommendation[] {
  const candidates = Object.entries(embeddings)
    .map(([name, emb]) => ({
      propertyName: name,
      score: index.popularity.get(name) ?? 0,
      city: emb.city,
      state: emb.state,
      landscape: emb.landscape,
      description: emb.description,
      basePrice: emb.base_price,
      bedrooms: emb.bedrooms,
      url: emb.url,
      imageUrl: emb.cover_image_url,
    }))
    .sort((a, b) => b.score - a.score);

  const result: Recommendation[] = [];
  const seenLandscapes = new Set<string>();
  for (const c of candidates) {
    if (result.length >= CONFIG.recsPerUser) break;
    if (
      !seenLandscapes.has(c.landscape) ||
      result.length >= CONFIG.recsPerUser - 1
    ) {
      result.push(c);
      seenLandscapes.add(c.landscape);
    }
  }
  return result;
}

export function generateAllRecs(
  profiles: Map<string, UserProfile>,
  embeddings: Record<string, PropertyEmbedding>,
  index: PropertyIndex,
): { recs: Map<string, Recommendation[]>; coldStart: number } {
  const recs = new Map<string, Recommendation[]>();
  const fallback = buildColdStartRecs(embeddings, index);
  let coldStart = 0;
  let i = 0;

  for (const [uid, profile] of profiles) {
    if (++i % 10_000 === 0) {
      console.log(
        `  Ranking user ${i.toLocaleString()}/${profiles.size.toLocaleString()}...`,
      );
    }

    const userEmbedding = computeUserEmbedding(profile, embeddings);
    if (!userEmbedding) {
      recs.set(uid, fallback);
      coldStart++;
    } else {
      recs.set(
        uid,
        rankPropertiesForUser(userEmbedding, profile, embeddings, index),
      );
    }
  }

  return { recs, coldStart };
}

// ── CIO Sync ──────────────────────────────────────────────────────────────────

function buildCioAttributes(
  recs: Recommendation[],
): Record<string, string | number | null> {
  const attrs: Record<string, string | number | null> = {};

  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i]!;
    const p = `rec_for_you_${i + 1}`;
    attrs[`${p}_name`] = rec.propertyName;
    attrs[`${p}_image`] = rec.imageUrl;
    attrs[`${p}_url`] = rec.url;
    attrs[`${p}_city`] = rec.city;
    attrs[`${p}_state`] = rec.state;
    attrs[`${p}_price`] = rec.basePrice;
    attrs[`${p}_beds`] = rec.bedrooms ?? null;
    attrs[`${p}_landscape`] = rec.landscape;
    attrs[`${p}_description`] = rec.description;
    attrs[`${p}_cta`] = "Explore this home";
  }

  // Clear unused slots so stale data doesn't bleed into emails
  for (let i = recs.length; i < CONFIG.recsPerUser; i++) {
    for (const field of REC_FIELDS) attrs[`rec_for_you_${i + 1}_${field}`] = "";
  }

  attrs.recs_updated_at = new Date().toISOString().split("T")[0]!;
  return attrs;
}

async function syncToCio(
  allRecs: Map<string, Recommendation[]>,
  options: Pick<PipelineOptions, "dryRun" | "limit" | "useBatchSync">,
): Promise<{ synced: number; failed: number }> {
  const entries = [...allRecs.entries()].slice(0, options.limit ?? Infinity);

  if (options.dryRun) {
    console.log(
      `  DRY RUN — would sync ${entries.length.toLocaleString()} users`,
    );
    return { synced: 0, failed: 0 };
  }

  if (options.useBatchSync) {
    const attrsByUser = new Map<string, Record<string, string | number | null>>(
      entries.map(([uid, recs]) => [uid, buildCioAttributes(recs)]),
    );
    return syncRecsViaPipelinesApi(attrsByUser, {
      dryRun: options.dryRun,
      limit: options.limit,
    });
  }

  let synced = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i += CONFIG.cioConcurrency) {
    const batch = entries.slice(i, i + CONFIG.cioConcurrency);
    const results = await Promise.allSettled(
      batch.map(([uid, recs]) =>
        trackClient.identify(uid, buildCioAttributes(recs)),
      ),
    );
    for (const r of results) {
      if (r.status === "fulfilled") synced++;
      else failed++;
    }
  }

  return { synced, failed };
}

// ── Pipeline Entry Point ──────────────────────────────────────────────────────

export async function run(
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const start = Date.now();
  console.log(
    "── CIO Property Recs Pipeline ───────────────────────────────────",
  );

  console.log("  [1/5] Fetching bookable properties...");
  const properties = await fetchBookableProperties();
  console.log(`        ${properties.length} properties`);

  console.log("  [2/5] Generating property embeddings...");
  const embeddings = await generatePropertyEmbeddings(properties);

  console.log("  [3/5] Fetching user signals and search history...");
  const userIds = options.testEmails?.length
    ? await lookupUserIdsByEmail(options.testEmails)
    : undefined;
  if (userIds) console.log(`        Filtering to ${userIds.length} test users`);
  const [signals, searches] = await Promise.all([
    fetchUserBehaviorSignals(userIds),
    fetchUserSearchHistory(userIds),
  ]);
  const profiles = buildUserProfiles(signals, searches);
  console.log(`        ${profiles.size.toLocaleString()} active users`);

  console.log("  [4/5] Ranking properties per user...");
  const index = buildPropertyIndex(profiles);
  const { recs, coldStart } = generateAllRecs(profiles, embeddings, index);
  console.log(`        ${coldStart.toLocaleString()} cold start users`);

  console.log("  [5/5] Syncing to Customer.io...");
  console.log(
    `        mode=${options.useBatchSync ? "pipelines-batch" : "track-identify"}`,
  );
  const { synced, failed } = await syncToCio(recs, options);

  const elapsedMs = Date.now() - start;
  console.log(
    "─────────────────────────────────────────────────────────────────",
  );
  console.log(`  Done in ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(
    `  ${properties.length} properties | ${recs.size.toLocaleString()} users | ${coldStart.toLocaleString()} cold start`,
  );
  console.log(`  ${synced.toLocaleString()} synced | ${failed} failed`);

  return {
    properties: properties.length,
    users: recs.size,
    coldStart,
    synced,
    failed,
    elapsedMs,
  };
}
