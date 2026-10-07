import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { US_STATE_NAMES } from "@/lib/us-states";
import { getBigQueryClient } from "@/server/clients/bigquery.client";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";

import {
  type BookingDemand,
  type BookingDemandSummary,
} from "@/lib/booking-demand";

// Restrict both website and imported units before joining guest profiles. Deduplicate
// both sides so repeated warehouse rows cannot inflate counts or origin shares.
export const BOOKING_DEMAND_SQL = `
WITH units AS (
  SELECT JSON_VALUE(unit, '$.id') AS id_unit, JSON_VALUE(unit, '$.town') AS town
  FROM UNNEST(JSON_QUERY_ARRAY(@units)) AS unit
), state_codes AS (
  SELECT JSON_VALUE(state, '$.code') AS code, alias
  FROM UNNEST(JSON_QUERY_ARRAY(@state_codes)) AS state,
  UNNEST([JSON_VALUE(state, '$.code'), UPPER(JSON_VALUE(state, '$.name'))]) AS alias
), booking_rows AS (
  SELECT b.id_booking, b.id_user, b.ts_created, b.ts_checkin, b.ts_checkout, b.ldt_checkin, b.ldt_checkout, b.ts_confirmed,
    b.channel, b.is_wander_saas, b.status, b.is_manual_booking, b.ts_canceled, u.town
  FROM \`wander-9fc9c.analytics.bookings\` b
  JOIN units u USING (id_unit)
  WHERE b.id_website = @website_id AND b.id_booking IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY b.id_booking ORDER BY b.ts_created DESC) = 1
), bookings AS (
  SELECT id_booking, id_user, town, ts_checkin, ts_checkout, ldt_checkin, ldt_checkout, ts_confirmed
  FROM booking_rows
  WHERE channel = 'direct_website' AND is_wander_saas
    AND status = 'confirmed' AND NOT is_manual_booking
    AND ts_confirmed IS NOT NULL AND ts_canceled IS NULL
    AND ts_confirmed >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH))
), profiles AS (
  SELECT id_user, NULLIF(TRIM(city), '') AS city,
    NULLIF(TRIM(state), '') AS state, NULLIF(TRIM(country), '') AS country
  FROM \`wander-9fc9c.analytics.customer_profiles\`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id_user ORDER BY ts_updated DESC, ts_created DESC, city, state, country) = 1
), located AS (
  SELECT b.*,
    p.id_user IS NOT NULL AS profileLinked,
    INITCAP(p.city) AS city,
    COALESCE(s.code, INITCAP(p.state)) AS state,
    CASE WHEN UPPER(p.country) IN ('US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA') THEN 'US'
      ELSE UPPER(p.country) END AS country
  FROM bookings b
  LEFT JOIN profiles p USING (id_user)
  LEFT JOIN state_codes s ON UPPER(p.state) = s.alias
    AND (p.country IS NULL OR UPPER(p.country) IN ('US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'))
), scoped AS (
  SELECT * FROM located
  UNION ALL
  SELECT * REPLACE(CAST(NULL AS STRING) AS town) FROM located
), totals AS (
  SELECT town, COUNT(*) AS bookings,
    COUNTIF(profileLinked) AS profileMatched,
    COUNTIF(city IS NOT NULL AND (state IS NOT NULL OR country IS NOT NULL)) AS cityKnown,
    COUNTIF(state IS NOT NULL) AS stateKnown,
    APPROX_QUANTILES(IF(ts_checkout >= ts_checkin, DATE_DIFF(COALESCE(DATE(ldt_checkout), DATE(ts_checkout)), COALESCE(DATE(ldt_checkin), DATE(ts_checkin)), DAY), NULL), 2)[SAFE_OFFSET(1)] AS medianNights,
    APPROX_QUANTILES(IF(ts_checkin >= ts_confirmed, TIMESTAMP_DIFF(ts_checkin, ts_confirmed, DAY), NULL), 2)[SAFE_OFFSET(1)] AS medianLeadDays
  FROM scoped GROUP BY town
), city_counts AS (
  SELECT town, city, state, country, COUNT(*) AS bookings
  FROM scoped WHERE city IS NOT NULL AND (state IS NOT NULL OR country IS NOT NULL)
  GROUP BY town, city, state, country HAVING COUNT(*) >= 3
), state_counts AS (
  SELECT town, state, country, COUNT(*) AS bookings
  FROM scoped WHERE state IS NOT NULL
  GROUP BY town, state, country HAVING COUNT(*) >= 3
), months AS (
  SELECT town, FORMAT_TIMESTAMP('%m', ts_checkin) AS month, COUNT(*) AS bookings
  FROM scoped WHERE ts_checkin IS NOT NULL GROUP BY town, month
), city_arrays AS (
  SELECT c.town, ARRAY_AGG(STRUCT(c.city, c.state, c.country, c.bookings, ROUND(c.bookings / t.bookings, 3) AS share)
    ORDER BY c.bookings DESC, c.city, c.state, c.country LIMIT 5) AS cities
  FROM city_counts c JOIN totals t ON c.town IS NOT DISTINCT FROM t.town GROUP BY c.town
), state_arrays AS (
  SELECT s.town, ARRAY_AGG(STRUCT(s.state, s.country, s.bookings, ROUND(s.bookings / t.bookings, 3) AS share)
    ORDER BY s.bookings DESC, s.state, s.country LIMIT 5) AS states
  FROM state_counts s JOIN totals t ON s.town IS NOT DISTINCT FROM t.town GROUP BY s.town
), month_arrays AS (
  SELECT town, ARRAY_AGG(STRUCT(month, bookings) ORDER BY month) AS checkinMonths FROM months GROUP BY town
)
SELECT t.*, IFNULL(c.cities, []) AS cities, IFNULL(s.states, []) AS states, IFNULL(m.checkinMonths, []) AS checkinMonths
FROM totals t
LEFT JOIN city_arrays c ON c.town IS NOT DISTINCT FROM t.town
LEFT JOIN state_arrays s ON s.town IS NOT DISTINCT FROM t.town
LEFT JOIN month_arrays m ON m.town IS NOT DISTINCT FROM t.town
ORDER BY t.town IS NULL DESC, t.bookings DESC, t.town
LIMIT 7
`;

/** Aggregate evidence only: no guest IDs, addresses or booking records leave SQL. */
export async function readBrandBookingDemand(
  brandId: string,
): Promise<BookingDemand> {
  const base: BookingDemand = {
    status: "not-connected",
    source:
      "BigQuery direct-site confirmed bookings; current guest profile location",
    period: "Confirmed in past 12 months",
    scope: "Imported WanderOS homes on this brand's booking website",
    summaries: [],
  };
  const [brand, homes] = await Promise.all([
    db.query.brandTable.findFirst({
      where: eq(brandTable.id, brandId),
      columns: { wanderOsWebsiteId: true, wanderOsEnabled: true },
    }),
    db.query.homeTable.findMany({
      where: and(
        eq(homeTable.brandId, brandId),
        eq(homeTable.source, "wanderos"),
        isNull(homeTable.deletedAt),
      ),
      columns: { externalId: true, city: true },
    }),
  ]);
  if (!brand?.wanderOsEnabled || !brand.wanderOsWebsiteId || !homes.length)
    return base;
  try {
    const client = await getBigQueryClient();
    const [rows] = await client.query({
      query: BOOKING_DEMAND_SQL,
      params: {
        website_id: brand.wanderOsWebsiteId,
        units: JSON.stringify([
          ...new Map(
            homes.map((h) => [
              h.externalId,
              { id: h.externalId, town: h.city ?? "Unknown town" },
            ]),
          ).values(),
        ]),
        state_codes: JSON.stringify(
          Object.entries(US_STATE_NAMES).map(([code, name]) => ({
            code,
            name,
          })),
        ),
      },
      maximumBytesBilled: "2000000000",
      jobTimeoutMs: 15_000,
    });
    return {
      ...base,
      status: "available",
      summaries: rows as BookingDemandSummary[],
    };
  } catch {
    // A warehouse outage is unknown evidence, never evidence of zero demand.
    console.warn("Booking demand aggregates unavailable");
    return { ...base, status: "unavailable" };
  }
}
