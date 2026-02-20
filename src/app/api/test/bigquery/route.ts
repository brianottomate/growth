import { NextResponse } from "next/server";
import {
  executeQuery,
  fetchLeadForRealtimeSync,
} from "@/server/clients/bigquery.client";

/**
 * BigQuery diagnostic endpoint
 *
 * GET /api/test/bigquery                — full diagnostics (connectivity + table access + stats)
 * GET /api/test/bigquery?email=x@y.z   — realtime sync query for a specific lead
 * GET /api/test/bigquery?mode=tables   — just table access checks
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const mode = searchParams.get("mode");

  try {
    // -----------------------------------------------
    // Mode: email lookup — full realtime sync query
    // -----------------------------------------------
    if (email) {
      const eventType = searchParams.get("event") ?? "checkout_started";

      const lead = await fetchLeadForRealtimeSync({
        email,
        eventType,
        propertyName: searchParams.get("property") ?? undefined,
      });

      if (!lead) {
        return NextResponse.json({
          success: true,
          message: `No lead data found for ${email}`,
          email,
          eventType,
        });
      }

      return NextResponse.json({
        success: true,
        message: `Lead data found for ${email}`,
        email,
        eventType,
        data: lead,
      });
    }

    // -----------------------------------------------
    // Default: full diagnostics
    // -----------------------------------------------
    const startMs = Date.now();
    const results: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    // 1. Connectivity
    try {
      const [row] = await executeQuery<{ ok: number }>("SELECT 1 AS ok");
      results.connectivity = { ok: row?.ok === 1 };
    } catch (e) {
      errors.connectivity = e instanceof Error ? e.message : "Unknown";
    }

    if (mode === "quick") {
      return NextResponse.json({
        success: Object.keys(errors).length === 0,
        durationMs: Date.now() - startMs,
        results,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
      });
    }

    // 2. Discover available datasets
    try {
      const datasets = await executeQuery<{
        schema_name: string;
        location: string;
      }>(
        `SELECT schema_name, location
         FROM \`wander-9fc9c\`.INFORMATION_SCHEMA.SCHEMATA
         ORDER BY schema_name`,
      );
      results.datasets = datasets;
    } catch (e) {
      errors.datasets = e instanceof Error ? e.message : "Unknown";
    }

    // 3. Table access — check each key table the sync pipeline needs
    const tableChecks: Array<{ name: string; query: string }> = [
      {
        name: "customer_profiles",
        query: `SELECT COUNT(*) as cnt FROM \`wander-9fc9c.analytics.customer_profiles\` WHERE email IS NOT NULL`,
      },
      {
        name: "funnel_events_today",
        query: `SELECT COUNT(*) as cnt FROM \`wander-9fc9c.analytics.funnel_events\` WHERE DATE(ts) = CURRENT_DATE()`,
      },
      {
        name: "funnel_events_30d",
        query: `SELECT COUNT(*) as cnt FROM \`wander-9fc9c.analytics.funnel_events\` WHERE ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)`,
      },
      {
        name: "bookings_confirmed",
        query: `SELECT COUNT(*) as cnt FROM \`wander-9fc9c.analytics.bookings\` WHERE status = 'confirmed'`,
      },
      {
        name: "minerva_scores",
        query: `SELECT COUNT(*) as cnt, MAX(CAST(dt_minerva_delivered AS STRING)) as latest_batch FROM \`wander-9fc9c.minerva.customers_scored_v2\``,
      },
      {
        name: "outreach_prospects",
        query: `SELECT COUNT(*) as cnt FROM \`wander-9fc9c.outreach.prospect\``,
      },
      {
        name: "cio_people",
        query: `SELECT COUNT(*) as cnt FROM \`wander-9fc9c.customer_io.people\` WHERE deleted = FALSE`,
      },
    ];

    if (mode !== "tables") {
      let cioSyncColumn: string | null = null;

      try {
        const columns = await executeQuery<{ column_name: string }>(`
          SELECT column_name
          FROM \`wander-9fc9c.customer_io.INFORMATION_SCHEMA.COLUMNS\`
          WHERE table_name = 'attributes'
            AND column_name IN (
              '_fivetran_synced',
              '_fivetran_synced_at',
              '_fivetran_synced_timestamp'
            )
          ORDER BY CASE column_name
            WHEN '_fivetran_synced' THEN 1
            WHEN '_fivetran_synced_at' THEN 2
            WHEN '_fivetran_synced_timestamp' THEN 3
            ELSE 999
          END
          LIMIT 1
        `);

        const candidate = columns[0]?.column_name ?? null;
        if (candidate && /^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate)) {
          cioSyncColumn = candidate;
        } else if (candidate) {
          errors.cio_fivetran_lag = `Detected unexpected column name: ${candidate}`;
        }
      } catch (e) {
        errors.cio_fivetran_lag = e instanceof Error ? e.message : "Unknown";
      }

      // 3. Pipeline-relevant stats
      const statQueries: Array<{ name: string; query: string }> = [
        {
          name: "high_intent_leads_24h",
          query: `
            SELECT COUNT(DISTINCT id_user) as cnt
            FROM \`wander-9fc9c.analytics.funnel_events\`
            WHERE ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
              AND event_type IN ('payment_info_entered', 'checkout_started', 'order_completed')
          `,
        },
        {
          name: "recent_event_types_24h",
          query: `
            SELECT event_type, COUNT(*) as cnt
            FROM \`wander-9fc9c.analytics.funnel_events\`
            WHERE ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
            GROUP BY event_type
            ORDER BY cnt DESC
            LIMIT 10
          `,
        },
        {
          name: "unassigned_leads",
          query: `
            SELECT COUNT(*) AS cnt
            FROM \`wander-9fc9c.customer_io.people\` p
            LEFT JOIN \`wander-9fc9c.customer_io.attributes\` a
              ON p.internal_customer_id = a.internal_customer_id
              AND a.attribute_name = 'assigned_bdr_outreach_id'
            WHERE p.email_addr IS NOT NULL
              AND p.deleted = FALSE
              AND a.attribute_value IS NULL
          `,
        },
      ];

      if (cioSyncColumn) {
        statQueries.push({
          name: "cio_fivetran_lag",
          query: `
            SELECT
              MAX(${cioSyncColumn}) AS last_sync,
              TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(${cioSyncColumn}), MINUTE) AS lag_minutes
            FROM \`wander-9fc9c.customer_io.attributes\`
          `,
        });
      } else if (!errors.cio_fivetran_lag) {
        results.cio_fivetran_lag = {
          skipped: true,
          reason:
            "No supported sync timestamp column found in customer_io.attributes",
        };
      }

      tableChecks.push(...statQueries);
    }

    // Run all checks in parallel
    const checkResults = await Promise.allSettled(
      tableChecks.map(async (check) => {
        const rows = await executeQuery<Record<string, unknown>>(check.query);
        return { name: check.name, data: rows };
      }),
    );

    for (const [i, result] of checkResults.entries()) {
      const name = tableChecks[i]!.name;
      if (result.status === "fulfilled") {
        // For single-row results, flatten
        if (result.value.data.length === 1) {
          results[name] = result.value.data[0];
        } else {
          results[name] = result.value.data;
        }
      } else {
        errors[name] =
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown error";
      }
    }

    const durationMs = Date.now() - startMs;

    return NextResponse.json({
      success: Object.keys(errors).length === 0,
      durationMs,
      tablesChecked: tableChecks.length,
      tablesOk: tableChecks.length - Object.keys(errors).length,
      results,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      usage: {
        email:
          "/api/test/bigquery?email=user@example.com — full lead enrichment query",
        tables: "/api/test/bigquery?mode=tables — table access only (faster)",
        quick: "/api/test/bigquery?mode=quick — connectivity only",
      },
    });
  } catch (error) {
    console.error("❌ [BQ Test] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
