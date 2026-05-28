import { NextResponse } from "next/server";
import { executeQuery } from "@/server/clients/bigquery.client";

/**
 * Explore Fivetran custom conversions by action
 *
 * GET /api/test/bigquery/conversions              — sample rows + column schema
 * GET /api/test/bigquery/conversions?limit=100    — more rows
 * GET /api/test/bigquery/conversions?mode=schema  — just column names/types
 * GET /api/test/bigquery/conversions?mode=summary — aggregate by conversion action
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "explore";
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 500);

  const startMs = Date.now();

  try {
    if (mode === "schema") {
      const columns = await executeQuery<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(`
        SELECT column_name, data_type, is_nullable
        FROM \`wander-9fc9c.analytics.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = 'stg_fivetran__custom_conversions_by_action'
        ORDER BY ordinal_position
      `);

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startMs,
        table: "analytics.stg_fivetran__custom_conversions_by_action",
        columns,
      });
    }

    if (mode === "datasets") {
      // Discover all datasets and their conversion/ads-related tables
      const datasets = await executeQuery<{
        schema_name: string;
      }>(`
        SELECT schema_name
        FROM \`wander-9fc9c\`.INFORMATION_SCHEMA.SCHEMATA
        ORDER BY schema_name
      `);

      const tableResults: Record<string, unknown> = {};
      for (const ds of datasets) {
        try {
          const tables = await executeQuery<{
            table_name: string;
            table_type: string;
          }>(`
            SELECT table_name, table_type
            FROM \`wander-9fc9c.${ds.schema_name}.INFORMATION_SCHEMA.TABLES\`
            ORDER BY table_name
          `);
          tableResults[ds.schema_name] = tables;
        } catch {
          tableResults[ds.schema_name] = "ACCESS_DENIED";
        }
      }

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startMs,
        datasets: datasets.map((d) => d.schema_name),
        tables: tableResults,
      });
    }

    if (mode === "summary") {
      // Aggregate by conversion name/type — most useful for cross-referencing tags
      const summary = await executeQuery<Record<string, unknown>>(`
        SELECT
          name_conversion,
          type_conversion,
          category,
          id_conversion,
          COUNT(*) AS row_count,
          SUM(all_conversions) AS total_conversions,
          SUM(all_conversions_value) AS total_value,
          MIN(dt) AS earliest_date,
          MAX(dt) AS latest_date
        FROM \`wander-9fc9c.analytics.stg_fivetran__custom_conversions_by_action\`
        GROUP BY name_conversion, type_conversion, category, id_conversion
        ORDER BY total_conversions DESC
        LIMIT ${limit}
      `);

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startMs,
        table: "analytics.stg_fivetran__custom_conversions_by_action",
        rowCount: summary.length,
        data: summary,
      });
    }

    if (mode === "growth-ads") {
      // Query the growth.google_ads_consolidated_daily table we CAN access
      const schema = await executeQuery<{
        column_name: string;
        data_type: string;
      }>(`
        SELECT column_name, data_type
        FROM \`wander-9fc9c.growth.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = 'google_ads_consolidated_daily'
        ORDER BY ordinal_position
      `);

      const rows = await executeQuery<Record<string, unknown>>(`
        SELECT *
        FROM \`wander-9fc9c.growth.google_ads_consolidated_daily\`
        ORDER BY 1 DESC
        LIMIT ${limit}
      `);

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startMs,
        table: "growth.google_ads_consolidated_daily",
        schema,
        rowCount: rows.length,
        data: rows,
      });
    }

    if (mode === "analytics-tables") {
      // Try to list tables in analytics that we can query
      const tables = await executeQuery<{
        table_name: string;
        table_type: string;
      }>(`
        SELECT table_name, table_type
        FROM \`wander-9fc9c.analytics.INFORMATION_SCHEMA.TABLES\`
        WHERE LOWER(table_name) LIKE '%conversion%'
           OR LOWER(table_name) LIKE '%google%'
           OR LOWER(table_name) LIKE '%ads%'
           OR LOWER(table_name) LIKE '%fivetran%'
        ORDER BY table_name
      `);

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startMs,
        dataset: "analytics",
        tables,
      });
    }

    if (mode === "int-google-ads") {
      const schema = await executeQuery<{
        column_name: string;
        data_type: string;
      }>(`
        SELECT column_name, data_type
        FROM \`wander-9fc9c.analytics.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = 'int_google_ads_report'
        ORDER BY ordinal_position
      `);

      const rows = await executeQuery<Record<string, unknown>>(`
        SELECT *
        FROM \`wander-9fc9c.analytics.int_google_ads_report\`
        ORDER BY 1 DESC
        LIMIT ${limit}
      `);

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startMs,
        table: "analytics.int_google_ads_report",
        schema,
        rowCount: rows.length,
        data: rows,
      });
    }

    if (mode === "ads-performance") {
      const schema = await executeQuery<{
        column_name: string;
        data_type: string;
      }>(`
        SELECT column_name, data_type
        FROM \`wander-9fc9c.analytics.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = 'ads_performance'
        ORDER BY ordinal_position
      `);

      const rows = await executeQuery<Record<string, unknown>>(`
        SELECT *
        FROM \`wander-9fc9c.analytics.ads_performance\`
        ORDER BY 1 DESC
        LIMIT ${limit}
      `);

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startMs,
        table: "analytics.ads_performance",
        schema,
        rowCount: rows.length,
        data: rows,
      });
    }

    if (mode === "conversion-actions") {
      // Try to find per-conversion-action data from an accessible table
      // The int_google_ads_report only has aggregate conversions.
      // Let's check if there's a conversion-specific materialized table.
      const conversionTables = await executeQuery<{
        table_name: string;
        table_type: string;
      }>(`
        SELECT table_name, table_type
        FROM \`wander-9fc9c.analytics.INFORMATION_SCHEMA.TABLES\`
        WHERE LOWER(table_name) LIKE '%conversion%'
        ORDER BY table_name
      `);

      // Try each conversion table
      const tableResults: Record<string, unknown> = {};
      for (const t of conversionTables) {
        try {
          const sample = await executeQuery<Record<string, unknown>>(`
            SELECT * FROM \`wander-9fc9c.analytics.${t.table_name}\`
            LIMIT 3
          `);
          tableResults[t.table_name] = {
            type: t.table_type,
            accessible: true,
            sampleRows: sample,
          };
        } catch (e) {
          tableResults[t.table_name] = {
            type: t.table_type,
            accessible: false,
            error: e instanceof Error ? e.message : "Unknown",
          };
        }
      }

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startMs,
        conversionTables,
        tableResults,
      });
    }

    // Default: explore — grab sample rows from the stg view
    const rows = await executeQuery<Record<string, unknown>>(`
      SELECT *
      FROM \`wander-9fc9c.analytics.stg_fivetran__custom_conversions_by_action\`
      ORDER BY dt DESC
      LIMIT ${limit}
    `);

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - startMs,
      table: "analytics.stg_fivetran__custom_conversions_by_action",
      rowCount: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("❌ [BQ Conversions] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        hint: "Table may not exist or service account may lack access. Check analytics.stg_fivetran__custom_conversions_by_action",
      },
      { status: 500 },
    );
  }
}
