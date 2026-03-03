/**
 * Phases 2-4: Recommendation engine.
 *
 * Phase 2: Aggregate user behavior signals into profiles
 * Phase 3: Compute user preference embeddings (weighted avg of property embeddings)
 * Phase 4: Score and rank properties per user → top recommendations
 *
 * Ported from Python: clients/wander/recs/generate_recommendations.py
 */
import "server-only";
import type {
  BQUserSignal,
  BQUserSearch,
  PropertyEmbedding,
  PropertySignals,
  UserProfile,
  Recommendation,
  UserRecommendations,
} from "./types";
import {
  SIGNAL_WEIGHTS,
  SCORING_WEIGHTS,
  RECS_CONFIG,
} from "./types";

// ── Vector Math (replaces numpy) ───────────────────────────────

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

function norm(v: number[]): number {
  return Math.sqrt(dotProduct(v, v));
}

function normalizeVector(v: number[]): number[] {
  const n = norm(v);
  if (n === 0) return v;
  return v.map((x) => x / n);
}

function addWeighted(
  target: number[],
  source: number[],
  weight: number,
): void {
  for (let i = 0; i < target.length; i++) {
    target[i]! += source[i]! * weight;
  }
}

// ── Time Decay ─────────────────────────────────────────────────

function timeDecayWeight(lastInteractionTs: string | null): number {
  if (!lastInteractionTs) return RECS_CONFIG.decayFloor;

  try {
    const ts = new Date(lastInteractionTs);
    const now = new Date();
    const daysAgo = (now.getTime() - ts.getTime()) / (1000 * 60 * 60 * 24);
    const decay = Math.pow(2, -daysAgo / RECS_CONFIG.decayHalfLifeDays);
    return Math.max(decay, RECS_CONFIG.decayFloor);
  } catch {
    return RECS_CONFIG.decayFloor;
  }
}

// ── Phase 2: Aggregate User Profiles ───────────────────────────

export function aggregateUserProfiles(
  signals: BQUserSignal[],
  searches: BQUserSearch[],
): Map<string, UserProfile> {
  const users = new Map<string, UserProfile>();

  const getOrCreate = (uid: string): UserProfile => {
    let profile = users.get(uid);
    if (!profile) {
      profile = {
        properties: {},
        search_locations: [],
        minerva_location: null,
        cio_id: null,
        email: null,
        total_signals: 0,
      };
      users.set(uid, profile);
    }
    return profile;
  };

  // Process property signals
  for (const row of signals) {
    const profile = getOrCreate(row.id_user);
    if (!profile.properties[row.property_name]) {
      profile.properties[row.property_name] = {
        view_count: 0,
        abandon_count: 0,
        book_count: 0,
        wishlisted: false,
        last_interaction: null,
      };
    }
    const p = profile.properties[row.property_name]!;
    p.view_count += row.view_count;
    p.abandon_count += row.abandon_count;
    p.book_count += row.book_count;
    if (
      row.last_interaction &&
      (!p.last_interaction || row.last_interaction > p.last_interaction)
    ) {
      p.last_interaction = row.last_interaction;
    }
  }

  // Process search locations
  const searchByUser = new Map<
    string,
    Array<{ state: string | null; city: string | null; count: number }>
  >();
  for (const row of searches) {
    if (!searchByUser.has(row.id_user)) {
      searchByUser.set(row.id_user, []);
    }
    searchByUser.get(row.id_user)!.push({
      state: row.search_location_state,
      city: row.search_location_city,
      count: row.search_count,
    });
  }
  for (const [uid, locs] of searchByUser) {
    const profile = getOrCreate(uid);
    profile.search_locations = locs.sort((a, b) => b.count - a.count);
  }

  // Compute total signals
  for (const profile of users.values()) {
    let total = 0;
    for (const p of Object.values(profile.properties)) {
      total += p.view_count * 1;
      total += p.abandon_count * 2;
      total += p.book_count * 3;
      if (p.wishlisted) total += SIGNAL_WEIGHTS.wishlisted;
    }
    profile.total_signals = total;
  }

  // Filter to users with at least 1 property interaction
  const active = new Map<string, UserProfile>();
  for (const [uid, profile] of users) {
    if (Object.keys(profile.properties).length >= 1) {
      active.set(uid, profile);
    }
  }

  console.log(
    `  ${users.size.toLocaleString()} total users → ${active.size.toLocaleString()} active (≥1 property)`,
  );
  return active;
}

// ── Phase 3: Compute User Embeddings ───────────────────────────

function computeUserEmbedding(
  profile: UserProfile,
  embeddings: Record<string, PropertyEmbedding>,
): number[] | null {
  const dim = Object.values(embeddings)[0]?.embedding.length ?? 1024;
  const weightedSum = new Array(dim).fill(0) as number[];
  let totalWeight = 0;

  for (const [propName, signals] of Object.entries(profile.properties)) {
    // Find embedding (case-insensitive fallback)
    let embData = embeddings[propName];
    if (!embData) {
      const lower = propName.toLowerCase();
      for (const [name, data] of Object.entries(embeddings)) {
        if (name.toLowerCase() === lower) {
          embData = data;
          break;
        }
      }
    }
    if (!embData) continue;

    let rawWeight = 0;
    rawWeight += signals.view_count * SIGNAL_WEIGHTS.viewed;
    rawWeight += signals.abandon_count * SIGNAL_WEIGHTS.abandoned;
    rawWeight += signals.book_count * SIGNAL_WEIGHTS.booked;
    if (signals.wishlisted) rawWeight += SIGNAL_WEIGHTS.wishlisted;

    if (rawWeight > 0) {
      const decay = timeDecayWeight(signals.last_interaction);
      const weight = rawWeight * decay;
      addWeighted(weightedSum, embData.embedding, weight);
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return null;
  return weightedSum.map((v) => v / totalWeight);
}

export function computeAllUserEmbeddings(
  profiles: Map<string, UserProfile>,
  embeddings: Record<string, PropertyEmbedding>,
): Map<string, number[]> {
  const result = new Map<string, number[]>();
  let skipped = 0;

  for (const [uid, profile] of profiles) {
    const emb = computeUserEmbedding(profile, embeddings);
    if (emb) {
      result.set(uid, emb);
    } else {
      skipped++;
    }
  }

  console.log(
    `  Computed ${result.size.toLocaleString()} user embeddings (${skipped} skipped)`,
  );
  return result;
}

// ── Phase 4: Generate Recommendations ──────────────────────────

function computePopularityScores(
  profiles: Map<string, UserProfile>,
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const profile of profiles.values()) {
    for (const [name, s] of Object.entries(profile.properties)) {
      const current = scores.get(name) ?? 0;
      scores.set(name, current + s.view_count + s.abandon_count * 3 + s.book_count * 10);
    }
  }

  const maxScore = Math.max(...scores.values(), 1);
  for (const [name, score] of scores) {
    scores.set(name, score / maxScore);
  }

  return scores;
}

function priceMatchScore(
  candidatePrice: number | null,
  userPricePref: number | null,
): number {
  if (!candidatePrice || !userPricePref) return 0.5;
  const ratio = candidatePrice / userPricePref;
  return Math.max(0, 1 - Math.abs(Math.log(Math.max(ratio, 0.1))) * 0.5);
}

function computePriceAffinity(
  profile: UserProfile,
  embeddings: Record<string, PropertyEmbedding>,
): number | null {
  const prices: number[] = [];
  for (const [propName, signals] of Object.entries(profile.properties)) {
    const emb = embeddings[propName];
    if (emb?.base_price) {
      const weight =
        signals.view_count + signals.abandon_count * 2 + signals.book_count * 5;
      for (let i = 0; i < Math.max(1, weight); i++) {
        prices.push(emb.base_price);
      }
    }
  }
  if (prices.length === 0) return null;
  prices.sort((a, b) => a - b);
  return prices[Math.floor(prices.length / 2)]!; // median
}

function generateForYou(
  userEmbedding: number[],
  profile: UserProfile,
  embeddings: Record<string, PropertyEmbedding>,
  popularityScores: Map<string, number>,
  profiles: Map<string, UserProfile>,
): Recommendation[] {
  const booked = new Set(
    Object.entries(profile.properties)
      .filter(([, s]) => s.book_count > 0)
      .map(([name]) => name),
  );
  const interacted = new Set(Object.keys(profile.properties));
  const pricePref = computePriceAffinity(profile, embeddings);
  const userNormed = normalizeVector(userEmbedding);

  // Score all properties by cosine similarity
  const scored: Array<{ name: string; sim: number }> = [];
  for (const [name, emb] of Object.entries(embeddings)) {
    if (booked.has(name)) continue;
    const embNormed = normalizeVector(emb.embedding);
    const sim = dotProduct(userNormed, embNormed);
    scored.push({ name, sim });
  }
  scored.sort((a, b) => b.sim - a.sim);

  // Compute recency scores for candidates (days since last interaction across all users)
  const now = new Date();
  function recencyScore(propName: string): number {
    let latest: string | null = null;
    for (const p of profiles.values()) {
      const sig = p.properties[propName];
      if (sig?.last_interaction && (!latest || sig.last_interaction > latest)) {
        latest = sig.last_interaction;
      }
    }
    if (!latest) return 0;
    const daysAgo = (now.getTime() - new Date(latest).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - daysAgo / RECS_CONFIG.recencyDays);
  }

  // Multi-factor scoring on top candidates
  // Note: diversity (0.15) is applied via landscape filtering below, not as a score factor
  const candidates: Recommendation[] = [];
  for (const { name, sim } of scored.slice(0, RECS_CONFIG.topCandidates)) {
    const emb = embeddings[name]!;
    const score =
      sim * SCORING_WEIGHTS.similarity +
      recencyScore(name) * SCORING_WEIGHTS.recency +
      (popularityScores.get(name) ?? 0) * SCORING_WEIGHTS.popularity +
      priceMatchScore(emb.base_price, pricePref) * SCORING_WEIGHTS.price_match;

    candidates.push({
      property_name: name,
      score: Math.round(score * 10000) / 10000,
      similarity: Math.round(sim * 10000) / 10000,
      city: emb.city,
      state: emb.state,
      landscape: emb.landscape,
      base_price: emb.base_price,
      bedrooms: emb.bedrooms,
      url: emb.url,
      cover_image_url: emb.cover_image_url,
      previously_viewed: interacted.has(name),
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // Pick top N with landscape diversity
  const final: Recommendation[] = [];
  const seenLandscapes = new Set<string>();

  for (const rec of candidates) {
    if (final.length >= RECS_CONFIG.recsPerFeed) break;
    if (
      seenLandscapes.has(rec.landscape) &&
      final.length < RECS_CONFIG.recsPerFeed - 1
    ) {
      continue;
    }
    final.push(rec);
    seenLandscapes.add(rec.landscape);
  }

  // Fill if diversity filtering was too aggressive
  if (final.length < RECS_CONFIG.recsPerFeed) {
    for (const rec of candidates) {
      if (!final.includes(rec)) final.push(rec);
      if (final.length >= RECS_CONFIG.recsPerFeed) break;
    }
  }

  return final;
}

function generateNearYou(
  profile: UserProfile,
  embeddings: Record<string, PropertyEmbedding>,
): Recommendation[] {
  if (profile.search_locations.length === 0) return [];

  const top = profile.search_locations[0]!;
  if (!top.state) return [];

  const booked = new Set(
    Object.entries(profile.properties)
      .filter(([, s]) => s.book_count > 0)
      .map(([name]) => name),
  );

  const candidates: Recommendation[] = [];
  for (const [name, emb] of Object.entries(embeddings)) {
    if (booked.has(name)) continue;

    let geoScore = 0;
    if (
      top.city &&
      emb.city.toLowerCase() === top.city.toLowerCase() &&
      emb.state.toLowerCase() === top.state!.toLowerCase()
    ) {
      geoScore = 1.0;
    } else if (emb.state.toLowerCase() === top.state!.toLowerCase()) {
      geoScore = 0.7;
    } else {
      continue;
    }

    candidates.push({
      property_name: name,
      score: geoScore,
      city: emb.city,
      state: emb.state,
      landscape: emb.landscape,
      base_price: emb.base_price,
      url: emb.url,
      cover_image_url: emb.cover_image_url,
      search_location: [top.city, top.state].filter(Boolean).join(", "),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, RECS_CONFIG.recsPerFeed);
}

function generateColdStartRecs(
  embeddings: Record<string, PropertyEmbedding>,
  popularityScores: Map<string, number>,
): Recommendation[] {
  const candidates: Recommendation[] = [];
  for (const [name, emb] of Object.entries(embeddings)) {
    candidates.push({
      property_name: name,
      score: popularityScores.get(name) ?? 0,
      city: emb.city,
      state: emb.state,
      landscape: emb.landscape,
      base_price: emb.base_price,
      url: emb.url,
      cover_image_url: emb.cover_image_url,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const recs: Recommendation[] = [];
  const seenLandscapes = new Set<string>();
  for (const c of candidates) {
    if (!seenLandscapes.has(c.landscape) || recs.length >= 2) {
      recs.push(c);
      seenLandscapes.add(c.landscape);
    }
    if (recs.length >= RECS_CONFIG.recsPerFeed) break;
  }

  return recs;
}

// ── Main Generation ────────────────────────────────────────────

export function generateAllRecommendations(
  profiles: Map<string, UserProfile>,
  userEmbeddings: Map<string, number[]>,
  embeddings: Record<string, PropertyEmbedding>,
): Map<string, UserRecommendations> {
  const popularityScores = computePopularityScores(profiles);
  const coldStartRecs = generateColdStartRecs(embeddings, popularityScores);

  const allRecs = new Map<string, UserRecommendations>();
  let withRecs = 0;
  let coldStart = 0;

  let i = 0;
  for (const [uid, profile] of profiles) {
    i++;
    if (i % 10000 === 0) {
      console.log(
        `  Processing user ${i.toLocaleString()}/${profiles.size.toLocaleString()}...`,
      );
    }

    const userEmb = userEmbeddings.get(uid);

    if (!userEmb) {
      allRecs.set(uid, {
        for_you: coldStartRecs,
        near_you: [],
        launches: [],
        is_cold_start: true,
      });
      coldStart++;
      continue;
    }

    const forYou = generateForYou(
      userEmb,
      profile,
      embeddings,
      popularityScores,
      profiles,
    );
    const nearYou = generateNearYou(profile, embeddings);

    allRecs.set(uid, {
      for_you: forYou,
      near_you: nearYou,
      launches: [], // TODO: implement when dt_launched is reliably available
      is_cold_start: false,
    });
    withRecs++;
  }

  console.log(
    `  Generated recs for ${withRecs.toLocaleString()} users (${coldStart.toLocaleString()} cold start)`,
  );
  return allRecs;
}
