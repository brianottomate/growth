/**
 * BigQuery queries for the personalized recommendations pipeline.
 *
 * Tables used:
 * - analytics.int_properties — property metadata (name, location, price, images)
 * - analytics.reviews — guest reviews (for testimonials in embeddings)
 * - analytics.bookings_gmv — booking history for signal aggregation
 * - analytics.int_wishlist — wishlist data for signal aggregation
 *
 * Ported from Python: clients/wander/recs/BIGQUERY_QUERIES.md
 */
import "server-only";
import { executeQuery } from "@/server/clients/bigquery.client";
import type { BQProperty, BQUserSignal, BQUserSearch } from "./types";

// ── Properties ─────────────────────────────────────────────────

const PROPERTIES_QUERY = `
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
  p.is_pet_allowed,
  p.cover_image_url,
  p.url,
  p.dt_launched,
  TO_JSON_STRING(ARRAY(
    SELECT r.text FROM UNNEST(p.testimonial_text) AS r LIMIT 3
  )) AS testimonial_text,
  TO_JSON_STRING(ARRAY(
    SELECT a FROM UNNEST(p.activities) AS a LIMIT 10
  )) AS activities
FROM \`wander-9fc9c.analytics.int_properties\` p
WHERE p.is_bookable = TRUE
  AND p.cover_image_url IS NOT NULL
ORDER BY p.property_name
`;

export async function fetchProperties(): Promise<BQProperty[]> {
  return executeQuery<BQProperty>(PROPERTIES_QUERY);
}

// ── User Behavior Signals ──────────────────────────────────────

const USER_SIGNALS_QUERY = `
WITH property_views AS (
  SELECT
    id_user,
    property_name,
    COUNT(*) AS view_count,
    MAX(ts) AS last_view
  FROM \`wander-9fc9c.analytics.int_product_viewed\`
  WHERE id_user IS NOT NULL AND property_name IS NOT NULL
  GROUP BY id_user, property_name
),
abandoned_checkouts AS (
  SELECT
    id_user,
    property_name,
    COUNT(*) AS abandon_count,
    MAX(ts) AS last_abandon
  FROM \`wander-9fc9c.analytics.funnel_events\`
  WHERE event_type = 'checkout_started'
    AND id_user IS NOT NULL
    AND property_name IS NOT NULL
  GROUP BY id_user, property_name
),
bookings AS (
  SELECT
    id_user,
    property_name,
    COUNT(*) AS book_count,
    MAX(ts_created) AS last_booking
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
  GREATEST(v.last_view, a.last_abandon, b.last_booking) AS last_interaction
FROM property_views v
FULL OUTER JOIN abandoned_checkouts a
  ON v.id_user = a.id_user AND v.property_name = a.property_name
FULL OUTER JOIN bookings b
  ON COALESCE(v.id_user, a.id_user) = b.id_user
  AND COALESCE(v.property_name, a.property_name) = b.property_name
`;

export async function fetchUserSignals(): Promise<BQUserSignal[]> {
  return executeQuery<BQUserSignal>(USER_SIGNALS_QUERY);
}

// ── User Search Locations ──────────────────────────────────────

const USER_SEARCHES_QUERY = `
SELECT
  id_user,
  search_location_state,
  search_location_city,
  COUNT(*) AS search_count
FROM \`wander-9fc9c.analytics.search_sessions\`
WHERE id_user IS NOT NULL
  AND search_location_state IS NOT NULL
GROUP BY id_user, search_location_state, search_location_city
ORDER BY id_user, search_count DESC
`;

export async function fetchUserSearches(): Promise<BQUserSearch[]> {
  return executeQuery<BQUserSearch>(USER_SEARCHES_QUERY);
}
