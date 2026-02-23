import "server-only";
import type { BigQuery } from "@google-cloud/bigquery";
import { env } from "@/env";

// =====================================================
// CLIENT INITIALIZATION
// =====================================================

/**
 * BigQuery client for analytics data warehouse queries.
 *
 * Primary data source for lead enrichment during real-time sync.
 * Provides comprehensive lead data: booking history, activity counts,
 * funnel events, phone numbers, Minerva AI scores, etc.
 *
 * Uses lazy initialization to avoid loading @google-cloud/bigquery
 * at module load time (it's a heavy package).
 *
 * Reference: wander-growth-api/app/services/BigQuery/bigquery_client.py
 */

// =====================================================
// LAZY CLIENT
// =====================================================

type BigQueryClient = BigQuery;
type BigQueryScalar = string | number | boolean | Date | null;
type BigQueryParams = Record<string, BigQueryScalar | BigQueryScalar[]>;
type BigQueryParamTypes = Record<string, string | string[]>;

let _client: BigQueryClient | null = null;

function parseServiceAccountCredentials(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS_JSON must be a JSON object",
    );
  }

  return parsed as Record<string, unknown>;
}

function parseServiceAccountCredentialsFromBase64(
  b64: string,
): Record<string, unknown> {
  let decoded: string;
  try {
    decoded = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    throw new Error("Invalid GCP_SA_JSON_B64 (base64 decode failed)");
  }

  return parseServiceAccountCredentials(decoded);
}

async function getClient(): Promise<BigQueryClient> {
  if (_client) return _client;

  const { BigQuery } = await import("@google-cloud/bigquery");

  // Explicit credentials from env vars take priority
  if (env.GCP_SA_JSON_B64) {
    const credentials = parseServiceAccountCredentialsFromBase64(
      env.GCP_SA_JSON_B64,
    );
    _client = new BigQuery({
      projectId: env.BIGQUERY_PROJECT_ID,
      credentials,
    });
  } else if (env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const credentials = parseServiceAccountCredentials(
      env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    );
    _client = new BigQuery({
      projectId: env.BIGQUERY_PROJECT_ID,
      credentials,
    });
  } else {
    // Fall back to Application Default Credentials (gcloud auth application-default login)
    _client = new BigQuery({
      projectId: env.BIGQUERY_PROJECT_ID ?? "wander-9fc9c",
    });
  }

  return _client;
}

// =====================================================
// QUERY EXECUTION
// =====================================================

/**
 * Execute a parameterized BigQuery SQL query.
 */
export async function executeQuery<T = Record<string, unknown>>(
  sql: string,
  params?: BigQueryParams,
  types?: BigQueryParamTypes,
): Promise<T[]> {
  const client = await getClient();

  const [rows] = await client.query({
    query: sql,
    params,
    ...(types ? { types } : {}),
  });

  return rows as T[];
}

// =====================================================
// REALTIME LEAD DATA
// =====================================================

/**
 * Lead data returned by the realtime sync query.
 * Comprehensive profile data from BigQuery warehouse.
 */
export interface RealtimeLeadData {
  // User identification
  id_user: string | null;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;

  // Activity aggregations
  event_types: string | null;
  interacted_properties: string | null;
  unique_properties: number | null;

  // Last activity
  last_activity_ts: string | null;
  last_activity_type: string | null;
  last_activity_property_name: string | null;

  // Specific activity counts
  last_checkout_property: string | null;
  checkout_count: number | null;
  payment_count: number | null;
  property_view_count: number | null;
  wishlist_count: number | null;

  // Booking history
  past_properties: string | null;
  past_bookings: string | null;
  last_booking_date: string | null;
  last_checkin: string | null;
  last_checkout: string | null;
  last_booked_property_name: string | null;
  last_5_booked_properties: string | null;

  // Property engagement
  last_5_checkout_properties: string | null;
  wishlisted_properties: string | null;

  // Recency tracking
  last_abandoned_cart_date: string | null;
  last_wishlist_date: string | null;

  // Customer profile stats
  count_confirmed_bookings: number | null;
  total_spend: number | null;

  // Webhook context (echoed back)
  webhook_event_type: string | null;
  webhook_property_name: string | null;
  webhook_received_at: string | null;

  // Minerva AI
  minerva_rank: number | null;
  minerva_date_scored: string | null;
  minerva_lead_summary: string | null;
  minerva_ac_7d: boolean | null;
  minerva_ac_30d: boolean | null;
  flag_has_minerva_score: boolean | null;
  minerva_household_income: string | null;

  // Reviews
  review_count: number | null;
  avg_review_score: number | null;
}

// =====================================================
// REALTIME SYNC QUERY
// =====================================================

/**
 * The realtime sync SQL query.
 * Joins customer_profiles, funnel_events, bookings, minerva scores,
 * wishlists, and reviews into a comprehensive lead record.
 *
 * Ported from wander-growth-api/app/services/BigQuery/queries/outreach/realtime_sync.py
 */
const REALTIME_SYNC_SQL = `
WITH customer AS (
  SELECT
    id_user,
    email,
    phone,
    first_name,
    last_name,
    CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) AS full_name,
    city,
    state,
    country
  FROM \`wander-9fc9c.analytics.customer_profiles\`
  WHERE LOWER(email) = LOWER(@email)
  LIMIT 1
),

funnel AS (
  SELECT
    fe.id_user,
    STRING_AGG(DISTINCT fe.event_type, ', ') AS event_types,
    STRING_AGG(DISTINCT REGEXP_REPLACE(fe.property_name, r'^Wander ', ''), ', ') AS interacted_properties,
    COUNT(DISTINCT fe.property_name) AS unique_properties,
    MAX(fe.ts) AS last_activity_ts,
    ARRAY_AGG(fe.event_type ORDER BY fe.ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS last_activity_type,
    ARRAY_AGG(REGEXP_REPLACE(fe.property_name, r'^Wander ', '') ORDER BY fe.ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS last_activity_property_name,
    -- Checkout-specific
    ARRAY_AGG(
      IF(fe.event_type = 'checkout_started', REGEXP_REPLACE(fe.property_name, r'^Wander ', ''), NULL)
      IGNORE NULLS ORDER BY fe.ts DESC LIMIT 1
    )[SAFE_OFFSET(0)] AS last_checkout_property,
    COUNTIF(fe.event_type = 'checkout_started') AS checkout_count,
    COUNTIF(fe.event_type = 'payment_info_entered') AS payment_count,
    COUNTIF(fe.event_type = 'property_viewed') AS property_view_count,
    COUNTIF(fe.event_type = 'product_added_to_wishlist') AS wishlist_count,
    -- Last 5 checkout properties
    ARRAY_TO_STRING(
      ARRAY_AGG(
        IF(fe.event_type = 'checkout_started', REGEXP_REPLACE(fe.property_name, r'^Wander ', ''), NULL)
        IGNORE NULLS ORDER BY fe.ts DESC LIMIT 5
      ), ', '
    ) AS last_5_checkout_properties,
    -- Abandoned cart date
    MAX(IF(fe.event_type = 'checkout_started', CAST(fe.ts AS STRING), NULL)) AS last_abandoned_cart_date
  FROM \`wander-9fc9c.analytics.funnel_events\` fe
  JOIN customer c ON fe.id_user = c.id_user
  WHERE fe.ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  GROUP BY fe.id_user
),

bookings AS (
  SELECT
    b.id_user,
    STRING_AGG(DISTINCT REGEXP_REPLACE(b.property_name, r'^Wander ', ''), ', ') AS past_properties,
    STRING_AGG(
      CONCAT(
        REGEXP_REPLACE(b.property_name, r'^Wander ', ''), '|',
        COALESCE(CAST(b.ts_confirmed AS STRING), ''), '|',
        COALESCE(CAST(b.ts_checkin AS STRING), ''), '|',
        COALESCE(CAST(b.ts_checkout AS STRING), '')
      ), ';'
      ORDER BY b.ts_confirmed DESC
    ) AS past_bookings,
    MAX(CAST(b.ts_confirmed AS STRING)) AS last_booking_date,
    MAX(CAST(b.ts_checkin AS STRING)) AS last_checkin,
    MAX(CAST(b.ts_checkout AS STRING)) AS last_checkout,
    ARRAY_AGG(REGEXP_REPLACE(b.property_name, r'^Wander ', '') ORDER BY b.ts_confirmed DESC LIMIT 1)[SAFE_OFFSET(0)] AS last_booked_property_name,
    ARRAY_TO_STRING(
      ARRAY_AGG(REGEXP_REPLACE(b.property_name, r'^Wander ', '') ORDER BY b.ts_confirmed DESC LIMIT 5),
      ', '
    ) AS last_5_booked_properties,
    COUNT(*) AS count_confirmed_bookings,
    COALESCE(SUM(b.price), 0) AS total_spend
  FROM \`wander-9fc9c.analytics.bookings\` b
  JOIN customer c ON b.id_user = c.id_user
  WHERE b.status = 'confirmed'
  GROUP BY b.id_user
),

minerva AS (
  SELECT
    ms.id_user,
    ms.rank AS minerva_rank,
    CAST(ms.dt_minerva_delivered AS STRING) AS minerva_date_scored,
    ms.lead_summary AS minerva_lead_summary,
    ms.md_has_abandoned_cart_last_7d AS minerva_ac_7d,
    ms.md_has_abandoned_cart_last_30d AS minerva_ac_30d,
    TRUE AS flag_has_minerva_score
  FROM \`wander-9fc9c.minerva.customers_scored_v2\` ms
  JOIN customer c ON ms.id_user = c.id_user
  WHERE ms.dt_minerva_delivered = (
    SELECT MAX(dt_minerva_delivered) FROM \`wander-9fc9c.minerva.customers_scored_v2\`
  )
),

minerva_income AS (
  SELECT
    ue.id_user,
    ue.estimated_income_range AS minerva_household_income
  FROM \`wander-9fc9c.minerva.users_enriched\` ue
  JOIN customer c ON ue.id_user = c.id_user
),

wishlists AS (
  SELECT
    c.id_user,
    STRING_AGG(DISTINCT REGEXP_REPLACE(w.property_name, r'^Wander ', ''), ', ') AS wishlisted_properties,
    MAX(CAST(w.ts AS STRING)) AS last_wishlist_date
  FROM (
    SELECT user_id AS id_user, name AS property_name, timestamp AS ts
    FROM \`wander-9fc9c.wander_com.product_added_to_wishlist\`
    UNION ALL
    SELECT user_id AS id_user, name AS property_name, timestamp AS ts
    FROM \`wander-9fc9c.react_native.product_added_to_wishlist\`
  ) w
  JOIN customer c ON w.id_user = c.id_user
  GROUP BY c.id_user
),

reviews AS (
  SELECT
    b.id_user,
    COUNT(r.id_booking) AS review_count,
    AVG(r.score) AS avg_review_score
  FROM \`wander-9fc9c.analytics.bookings\` b
  LEFT JOIN \`wander-9fc9c.analytics.reviews\` r ON b.id_booking = r.id_booking
  JOIN customer c ON b.id_user = c.id_user
  WHERE b.status = 'confirmed'
  GROUP BY b.id_user
)

SELECT
  c.*,
  f.* EXCEPT(id_user),
  b.* EXCEPT(id_user),
  m.* EXCEPT(id_user),
  mi.* EXCEPT(id_user),
  wl.* EXCEPT(id_user),
  rv.* EXCEPT(id_user),
  @event_type AS webhook_event_type,
  @property_name AS webhook_property_name,
  CURRENT_TIMESTAMP() AS webhook_received_at
FROM customer c
LEFT JOIN funnel f ON c.id_user = f.id_user
LEFT JOIN bookings b ON c.id_user = b.id_user
LEFT JOIN minerva m ON c.id_user = m.id_user
LEFT JOIN minerva_income mi ON c.id_user = mi.id_user
LEFT JOIN wishlists wl ON c.id_user = wl.id_user
LEFT JOIN reviews rv ON c.id_user = rv.id_user
`;

/**
 * Fetch lead data for real-time sync processing.
 *
 * This is the key query for the webhook pipeline — it fetches comprehensive
 * lead data from the analytics warehouse for a given email.
 *
 * Returns null if no data found.
 */
export async function fetchLeadForRealtimeSync(params: {
  email: string;
  eventType: string;
  propertyName?: string;
}): Promise<RealtimeLeadData | null> {
  console.log(`🔍 [BigQuery] Fetching realtime lead data for ${params.email}`);
  const startMs = Date.now();

  try {
    const rows = await executeQuery<RealtimeLeadData>(
      REALTIME_SYNC_SQL,
      {
        email: params.email,
        event_type: params.eventType,
        property_name: params.propertyName ?? null,
      },
      {
        property_name: "STRING",
      },
    );

    if (rows.length === 0) {
      const durationMs = Date.now() - startMs;
      console.log(
        `⚠️ [BigQuery] No lead data found for ${params.email} (${durationMs}ms)`,
      );
      return null;
    }

    const durationMs = Date.now() - startMs;
    console.log(
      `✅ [BigQuery] Lead data found for ${params.email} (user: ${rows[0]!.id_user}) in ${durationMs}ms`,
    );
    return rows[0]!;
  } catch (error) {
    console.error(
      `❌ [BigQuery] Realtime sync query failed for ${params.email}:`,
      error,
    );
    return null;
  }
}

// =====================================================
// BATCH SYNC CANDIDATES
// =====================================================

export interface SyncCandidate {
  email: string;
  lastEventType: string;
  lastPropertyName: string | null;
  lastEventTs: string;
}

/**
 * Fetch recently active leads to process in batch sync workflows.
 *
 * This powers:
 * - `daily_comprehensive_sync`
 * - `outreach_auto_healing`
 */
export async function fetchRecentSyncCandidates(params: {
  hoursBack: number;
  limit: number;
  onlyCheckout?: boolean;
}): Promise<SyncCandidate[]> {
  const eventTypes = params.onlyCheckout
    ? ["checkout_started"]
    : ["checkout_started", "payment_info_entered"];
  const eventTypeList = eventTypes.map((e) => `'${e}'`).join(", ");

  const sql = `
WITH recent_events AS (
  SELECT
    cp.email,
    fe.event_type,
    REGEXP_REPLACE(fe.property_name, r'^Wander ', '') AS property_name,
    fe.ts
  FROM \`wander-9fc9c.analytics.funnel_events\` fe
  JOIN \`wander-9fc9c.analytics.customer_profiles\` cp
    ON cp.id_user = fe.id_user
  WHERE cp.email IS NOT NULL
    AND fe.ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @hours_back HOUR)
    AND fe.event_type IN (${eventTypeList})
)
SELECT
  LOWER(email) AS email,
  ARRAY_AGG(event_type ORDER BY ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS last_event_type,
  ARRAY_AGG(property_name ORDER BY ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS last_property_name,
  MAX(ts) AS last_event_ts
FROM recent_events
GROUP BY email
ORDER BY last_event_ts DESC
LIMIT @limit
`;

  const rows = await executeQuery<{
    email: string;
    last_event_type: string | null;
    last_property_name: string | null;
    last_event_ts: string | Date | null;
  }>(sql, {
    hours_back: params.hoursBack,
    limit: params.limit,
  });

  return rows
    .filter((row) => row.email && row.last_event_type)
    .map((row) => ({
      email: row.email,
      lastEventType: row.last_event_type ?? "checkout_started",
      lastPropertyName: row.last_property_name ?? null,
      lastEventTs: row.last_event_ts ? String(row.last_event_ts) : "",
    }));
}

/**
 * Fetch leads with recent activity but no CIO BDR assignment.
 *
 * This powers the round-robin `bdr_alignment_backfill` workflow.
 */
export async function fetchUnassignedBdrCandidates(params: {
  hoursBack: number;
  limit: number;
}): Promise<SyncCandidate[]> {
  const sql = `
WITH recent_events AS (
  SELECT
    cp.email,
    fe.event_type,
    REGEXP_REPLACE(fe.property_name, r'^Wander ', '') AS property_name,
    fe.ts
  FROM \`wander-9fc9c.analytics.funnel_events\` fe
  JOIN \`wander-9fc9c.analytics.customer_profiles\` cp
    ON cp.id_user = fe.id_user
  WHERE cp.email IS NOT NULL
    AND fe.ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @hours_back HOUR)
    AND fe.event_type IN ('checkout_started', 'payment_info_entered')
),
unassigned AS (
  SELECT DISTINCT LOWER(p.email_addr) AS email
  FROM \`wander-9fc9c.customer_io.people\` p
  LEFT JOIN \`wander-9fc9c.customer_io.attributes\` a
    ON p.internal_customer_id = a.internal_customer_id
    AND a.attribute_name = 'assigned_bdr_outreach_id'
  WHERE p.email_addr IS NOT NULL
    AND p.deleted = FALSE
    AND (a.attribute_value IS NULL OR TRIM(a.attribute_value) = '')
)
SELECT
  re.email,
  ARRAY_AGG(re.event_type ORDER BY re.ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS last_event_type,
  ARRAY_AGG(re.property_name ORDER BY re.ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS last_property_name,
  MAX(re.ts) AS last_event_ts
FROM recent_events re
JOIN unassigned u ON u.email = LOWER(re.email)
GROUP BY re.email
ORDER BY last_event_ts DESC
LIMIT @limit
`;

  const rows = await executeQuery<{
    email: string;
    last_event_type: string | null;
    last_property_name: string | null;
    last_event_ts: string | Date | null;
  }>(sql, {
    hours_back: params.hoursBack,
    limit: params.limit,
  });

  return rows
    .filter((row) => row.email && row.last_event_type)
    .map((row) => ({
      email: row.email,
      lastEventType: row.last_event_type ?? "checkout_started",
      lastPropertyName: row.last_property_name ?? null,
      lastEventTs: row.last_event_ts ? String(row.last_event_ts) : "",
    }));
}

// =====================================================
// WRITE: STREAMING INSERT
// =====================================================

/**
 * Stream rows into a BigQuery table.
 *
 * Uses BigQuery's streaming insert API (table.insert), which is the
 * simplest write path for small batches like daily ad data.
 *
 * The caller is responsible for deleting stale rows before calling
 * this (delete-then-insert = upsert pattern).
 */
export async function insertRows(
  datasetId: string,
  tableId: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;

  const client = await getClient();
  const table = client.dataset(datasetId).table(tableId);

  // table.insert() throws PartialFailureError if any rows fail
  await table.insert(rows);
}

// =====================================================
// BACKFILL QUERY
// =====================================================

/**
 * Find profiles that are out of sync with Outreach.
 */
export async function findOutOfSyncProfiles(params: {
  daysBack?: number;
  limit?: number;
}): Promise<
  Array<{
    email: string;
    syncStatus: "never_synced" | "late_sync";
    lagHours?: number;
  }>
> {
  // TODO: Implement backfill discovery query when ready
  // This requires a join with Outreach data (via sync_events table)
  console.warn(
    "⚠️ [BigQuery] findOutOfSyncProfiles not yet implemented",
    params,
  );
  return [];
}
