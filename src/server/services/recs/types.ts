/**
 * Types for the personalized recommendations pipeline.
 *
 * Ported from Python: clients/wander/recs/
 * Original author: Brian Sun (Ottomate)
 */

// ── BigQuery Row Types ─────────────────────────────────────────

export interface BQProperty {
  property_name: string;
  city: string;
  state: string;
  bedrooms: number | null;
  bathrooms: number | null;
  occupancy: number | null;
  base_price: number | null;
  landscape_category: string;
  description: string;
  is_pet_allowed: boolean;
  cover_image_url: string;
  url: string;
  dt_launched: string | null;
  testimonial_text: string | null; // JSON array stored as string
  activities: string | null; // JSON array stored as string
}

export interface BQUserSignal {
  id_user: string;
  property_name: string;
  view_count: number;
  abandon_count: number;
  book_count: number;
  last_interaction: string | null;
}

export interface BQUserSearch {
  id_user: string;
  search_location_state: string | null;
  search_location_city: string | null;
  search_count: number;
}

// ── Internal Types ─────────────────────────────────────────────

export interface PropertyEmbedding {
  embedding: number[];
  city: string;
  state: string;
  landscape: string;
  base_price: number | null;
  bedrooms: number | null;
  occupancy: number | null;
  url: string;
  cover_image_url: string;
}

export interface PropertySignals {
  view_count: number;
  abandon_count: number;
  book_count: number;
  wishlisted: boolean;
  last_interaction: string | null;
}

export interface UserProfile {
  properties: Record<string, PropertySignals>;
  search_locations: Array<{
    state: string | null;
    city: string | null;
    count: number;
  }>;
  minerva_location: { city: string; state: string } | null;
  cio_id: string | null;
  email: string | null;
  total_signals: number;
}

export interface Recommendation {
  property_name: string;
  score: number;
  similarity?: number;
  city: string;
  state: string;
  landscape: string;
  base_price: number | null;
  bedrooms?: number | null;
  url: string;
  cover_image_url: string;
  previously_viewed?: boolean;
  search_location?: string;
  days_since_launch?: number;
  recency_score?: number;
}

export interface UserRecommendations {
  for_you: Recommendation[];
  near_you: Recommendation[];
  launches: Recommendation[];
  is_cold_start: boolean;
}

// ── CIO Sync Types ─────────────────────────────────────────────

export interface CIORecAttributes {
  [key: string]: string | number | boolean | null;
}

// ── Config ─────────────────────────────────────────────────────

export const SIGNAL_WEIGHTS = {
  viewed: 1,
  searched: 2,
  wishlisted: 3,
  abandoned: 4,
  booked: 5,
} as const;

export const SCORING_WEIGHTS = {
  similarity: 0.5,
  recency: 0.1,
  popularity: 0.15,
  diversity: 0.15,
  price_match: 0.1,
} as const;

export const RECS_CONFIG = {
  minSignals: 2,
  topCandidates: 50,
  recsPerFeed: 3,
  recencyDays: 90,
  decayHalfLifeDays: 30,
  decayFloor: 0.05,
  suppressAfterShown: 2,
  slotsPerFeed: 3,
  feeds: ["for_you"] as const,
} as const;

export const REC_FIELDS = [
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
