import "server-only";

import { fetchMetaConversions, type MetaConversionRow } from "@/server/clients/meta.client";
import { executeQuery, insertRows } from "@/server/clients/bigquery.client";
import { env } from "@/env";

// Marketing data lives in the `growth` dataset (same as Python pipeline)
const MARKETING_DATASET = "growth";
const META_TABLE = "meta_account_conversions_28d";

// =====================================================
// TYPES
// =====================================================

export interface MetaSyncResult {
  status: "success" | "no_data" | "dry_run";
  startDate: string;
  endDate: string;
  rowsWritten: number;
  durationMs: number;
  dryRun: boolean;
  summary?: {
    totalSpend: number;
    totalPurchases: number;
    totalRevenue: number;
    roas: number;
  };
}

// =====================================================
// HELPERS
// =====================================================

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function calcDateRange(daysBack: number): { startDate: string; endDate: string } {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);

  const start = new Date(yesterday);
  start.setUTCDate(start.getUTCDate() - daysBack);

  return {
    startDate: formatDate(start),
    endDate: formatDate(yesterday),
  };
}

function summarise(rows: MetaConversionRow[]) {
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalPurchases = rows.reduce(
    (s, r) => s + r.purchases_1d_view_28d_click,
    0,
  );
  const totalRevenue = rows.reduce(
    (s, r) => s + r.purchase_value_1d_view_28d_click,
    0,
  );
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  return { totalSpend, totalPurchases, totalRevenue, roas };
}

// =====================================================
// BIGQUERY WRITE
// =====================================================

async function deleteExistingRows(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const table = `\`${projectId}.${MARKETING_DATASET}.${META_TABLE}\``;
  const sql = `DELETE FROM ${table} WHERE date BETWEEN '${startDate}' AND '${endDate}'`;
  await executeQuery(sql);
  console.log(`[MetaSync] Deleted existing rows for ${startDate} → ${endDate}`);
}

// Row shape expected by BigQuery streaming insert
function toInsertRow(row: MetaConversionRow): Record<string, unknown> {
  return {
    ...row,
    // BigQuery DATE field accepts YYYY-MM-DD strings
    date: row.date,
    // BigQuery TIMESTAMP field accepts Date objects
    fetched_at: row.fetched_at,
  };
}

// =====================================================
// PUBLIC
// =====================================================

/**
 * Fetch Meta Ads conversion data and write it to BigQuery.
 *
 * Mirrors the Python MetaAttributionPipeline.run_pipeline() in
 * wander-growth-api/scripts_v2/pipelines/meta_28day_attribution_pipeline.py
 *
 * Default syncs 3 days back to capture late 28d-click attributions.
 */
export async function runMetaDailySync(params: {
  daysBack?: number;
  dryRun?: boolean;
}): Promise<MetaSyncResult> {
  const daysBack = params.daysBack ?? 3;
  const dryRun = params.dryRun ?? false;
  const startMs = Date.now();

  const { startDate, endDate } = calcDateRange(daysBack);

  console.log(
    `[MetaSync] Starting sync ${startDate} → ${endDate} (dryRun=${dryRun})`,
  );

  const rows = await fetchMetaConversions({ startDate, endDate });

  if (rows.length === 0) {
    return {
      status: "no_data",
      startDate,
      endDate,
      rowsWritten: 0,
      durationMs: Date.now() - startMs,
      dryRun,
    };
  }

  const summary = summarise(rows);

  if (dryRun) {
    console.log(
      `[MetaSync] DRY RUN — would write ${rows.length} rows. ROAS=${summary.roas.toFixed(2)}`,
    );
    return {
      status: "dry_run",
      startDate,
      endDate,
      rowsWritten: rows.length,
      durationMs: Date.now() - startMs,
      dryRun: true,
      summary: {
        totalSpend: Math.round(summary.totalSpend * 100) / 100,
        totalPurchases: Math.round(summary.totalPurchases),
        totalRevenue: Math.round(summary.totalRevenue * 100) / 100,
        roas: Math.round(summary.roas * 100) / 100,
      },
    };
  }

  const projectId = env.BIGQUERY_PROJECT_ID;

  // Delete-then-insert (upsert pattern — avoids duplicates on re-run)
  await deleteExistingRows(projectId, startDate, endDate);
  await insertRows(
    MARKETING_DATASET,
    META_TABLE,
    rows.map(toInsertRow),
  );

  const durationMs = Date.now() - startMs;
  console.log(
    `[MetaSync] Done — ${rows.length} rows written in ${durationMs}ms. ` +
      `Spend=$${summary.totalSpend.toFixed(0)} ROAS=${summary.roas.toFixed(2)}`,
  );

  return {
    status: "success",
    startDate,
    endDate,
    rowsWritten: rows.length,
    durationMs,
    dryRun: false,
    summary: {
      totalSpend: Math.round(summary.totalSpend * 100) / 100,
      totalPurchases: Math.round(summary.totalPurchases),
      totalRevenue: Math.round(summary.totalRevenue * 100) / 100,
      roas: Math.round(summary.roas * 100) / 100,
    },
  };
}
