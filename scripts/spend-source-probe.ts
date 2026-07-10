/**
 * Spend Tracker — Phase 0.5 source probe (read-only).
 *
 * Verifies, from growth's own BigQuery service account, every data source the
 * spend tracker will rely on:
 *   1. growth.google_ads_consolidated_daily — freshness + campaign-name access
 *      (candidate Google spend source; Zernio has no Google connection)
 *   2. analytics.marketing_adnetwork_daily_report — is the Fivetran feed alive?
 *      Pinterest rows present? (fallback spend source + cross-check)
 *   3. The six tracker queries (ported verbatim from
 *      brian/wander-growth-tracker/src/lib/bigquery/queries.ts) — access + shape.
 *
 * Run: bun run scripts/spend-source-probe.ts [--days 30]
 */
import { executeQuery } from "@/server/clients/bigquery.client";

const days = (() => {
  const i = process.argv.indexOf("--days");
  return i > -1 ? Number(process.argv[i + 1]) : 30;
})();

const end = new Date().toISOString().slice(0, 10);
const start = new Date(Date.now() - days * 86_400_000)
  .toISOString()
  .slice(0, 10);

function fmt(n: unknown): string {
  if (n === null || n === undefined) return "—";
  const v =
    typeof n === "object" && "value" in n ? Number(n.value) : Number(n);
  return Number.isFinite(v)
    ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : JSON.stringify(n);
}

async function probe(label: string, fn: () => Promise<void>) {
  process.stdout.write(`\n=== ${label} ===\n`);
  try {
    await fn();
  } catch (err) {
    console.log(`  ❌ FAILED: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// 1. growth.google_ads_consolidated_daily
// ---------------------------------------------------------------------------
await probe("1. growth.google_ads_consolidated_daily (Google spend candidate)", async () => {
  const schema = await executeQuery<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
     FROM \`wander-9fc9c.growth.INFORMATION_SCHEMA.COLUMNS\`
     WHERE table_name = 'google_ads_consolidated_daily'
     ORDER BY ordinal_position`,
  );
  console.log("  columns:", schema.map((c) => `${c.column_name}:${c.data_type}`).join(", ") || "(table not found)");
  if (schema.length === 0) return;

  const dateCol = schema.find((c) => /^(date|dt|day)$/i.test(c.column_name))?.column_name ?? "date";
  const rows = await executeQuery<Record<string, unknown>>(
    `SELECT MIN(${dateCol}) AS min_date, MAX(${dateCol}) AS max_date, COUNT(*) AS n
     FROM \`wander-9fc9c.growth.google_ads_consolidated_daily\``,
  );
  console.log("  coverage:", JSON.stringify(rows[0]));

  const sample = await executeQuery<Record<string, unknown>>(
    `SELECT * FROM \`wander-9fc9c.growth.google_ads_consolidated_daily\`
     ORDER BY ${dateCol} DESC LIMIT 3`,
  );
  console.log("  latest rows sample:");
  for (const r of sample) console.log("   ", JSON.stringify(r).slice(0, 300));
});

// ---------------------------------------------------------------------------
// 2. analytics.marketing_adnetwork_daily_report — alive? Pinterest?
// ---------------------------------------------------------------------------
await probe("2. analytics.marketing_adnetwork_daily_report (freshness + Pinterest)", async () => {
  const rows = await executeQuery<{ platform: string; max_dt: { value: string } | string; spend_30d: number }>(
    `SELECT platform, MAX(dt) AS max_dt, SUM(IF(dt >= @start, spend, 0)) AS spend_30d
     FROM \`wander-9fc9c.analytics.marketing_adnetwork_daily_report\`
     GROUP BY platform ORDER BY spend_30d DESC`,
    { start },
  );
  for (const r of rows) {
    const maxDt = typeof r.max_dt === "object" ? r.max_dt.value : r.max_dt;
    console.log(`  ${r.platform.padEnd(12)} latest=${maxDt}  spend last ${days}d=$${fmt(r.spend_30d)}`);
  }
});

// ---------------------------------------------------------------------------
// 3. The six tracker queries, verbatim
// ---------------------------------------------------------------------------
await probe("3a. SPEND_QUERY (adnetwork by platform/day)", async () => {
  const rows = await executeQuery<Record<string, unknown>>(
    `SELECT dt as date, platform, SUM(spend) as spend, SUM(clicks) as clicks, SUM(impressions) as impressions
     FROM \`wander-9fc9c.analytics.marketing_adnetwork_daily_report\`
     WHERE dt BETWEEN @start_date AND @end_date
     GROUP BY dt, platform ORDER BY dt DESC, platform LIMIT 6`,
    { start_date: start, end_date: end },
  );
  console.log(`  rows ok (${rows.length} sampled):`);
  for (const r of rows) console.log("   ", JSON.stringify(r));
});

await probe("3b. BOOKINGS_QUERY (bookings_reconciled_v2 ⋈ funnel, last_touch)", async () => {
  const rows = await executeQuery<Record<string, unknown>>(
    `SELECT
       COUNT(DISTINCT b.id_booking) as bookings,
       SUM(b.total_paid) as gmv,
       SUM(b.booking_revenue_recognized) as take_rate_revenue,
       COUNTIF(b.is_direct_booking = TRUE) as direct_bookings,
       COUNTIF(b.is_ota = TRUE) as ota_bookings,
       COUNT(DISTINCT COALESCE(f.partner, 'other')) as distinct_channels
     FROM \`wander-9fc9c.analytics.bookings_reconciled_v2\` b
     LEFT JOIN \`wander-9fc9c.analytics.funnel_events_attribution\` f
       ON b.id_booking = f.id_booking
       AND f.event_type = 'purchased'
       AND f.attribution_model = 'last_touch'
     WHERE b.is_profit = TRUE
       AND b.status = 'confirmed'
       AND DATE(b.ts_created) BETWEEN @start_date AND @end_date`,
    { start_date: start, end_date: end },
  );
  console.log(`  window ${start}..${end}:`, JSON.stringify(rows[0]));
});

await probe("3c. FUNNEL_QUERY (signups + checkouts, last_touch)", async () => {
  const rows = await executeQuery<{ event_type: string; n: number }>(
    `SELECT event_type, COUNT(*) as n
     FROM \`wander-9fc9c.analytics.funnel_events_attribution\`
     WHERE event_type IN ('user_signed_up', 'checkout_started')
       AND attribution_model = 'last_touch'
       AND DATE(ts) BETWEEN @start_date AND @end_date
     GROUP BY event_type`,
    { start_date: start, end_date: end },
  );
  for (const r of rows) console.log(`  ${r.event_type}: ${fmt(r.n)}`);
});

await probe("3d. NORTH_STAR_QUERY (dbt north_star_metrics)", async () => {
  const rows = await executeQuery<Record<string, unknown>>(
    `SELECT MAX(dt) AS latest, COUNT(*) AS days, SUM(gross_take) AS gross_take, SUM(total_gmv) AS total_gmv
     FROM \`wander-9fc9c.analytics.north_star_metrics\`
     WHERE dt BETWEEN @start_date AND @end_date`,
    { start_date: start, end_date: end },
  );
  console.log(`  window ${start}..${end}:`, JSON.stringify(rows[0]));
});

await probe("3e. TRUE_TOTALS_QUERY (analytics.bookings, Decision #9g)", async () => {
  const rows = await executeQuery<Record<string, unknown>>(
    `SELECT
       COUNTIF(is_profit AND ts_confirmed IS NOT NULL AND NOT COALESCE(is_wander_saas, FALSE)) AS total_confirmed_profit,
       COUNTIF(is_direct_booking AND is_profit AND ts_confirmed IS NOT NULL AND NOT COALESCE(is_wander_saas, FALSE)) AS wander_direct,
       COUNTIF(is_manual_booking AND is_profit AND ts_confirmed IS NOT NULL AND NOT COALESCE(is_wander_saas, FALSE)) AS manual_profit,
       COUNTIF(is_ota AND is_profit AND ts_confirmed IS NOT NULL AND NOT COALESCE(is_wander_saas, FALSE)) AS ota_confirmed_profit
     FROM \`wander-9fc9c.analytics.bookings\`
     WHERE DATE(ts_created) BETWEEN @start_date AND @end_date`,
    { start_date: start, end_date: end },
  );
  console.log(`  window ${start}..${end}:`, JSON.stringify(rows[0]));
});

await probe("3f. DYLAN_GMV_QUERY (analytics.report_gmv, Decision #9h)", async () => {
  const rows = await executeQuery<Record<string, unknown>>(
    `SELECT SUM(gmv) AS total_gmv, SUM(IF(ota_source IS NULL, gmv, 0)) AS direct_gmv
     FROM \`wander-9fc9c.analytics.report_gmv\`
     WHERE revenue_origin NOT IN ('sites_early_deposit','wander_sites','sites_subscription')
       AND DATE(ts_created) BETWEEN @start_date AND @end_date`,
    { start_date: start, end_date: end },
  );
  console.log(`  window ${start}..${end}:`, JSON.stringify(rows[0]));
});

console.log("\nDone.");
