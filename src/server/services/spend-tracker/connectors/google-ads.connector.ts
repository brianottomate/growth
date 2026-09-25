import "server-only";

import { env } from "@/env";
import { googleAdsClient } from "@/server/clients/google-ads.client";
import { isMarketplaceCampaign } from "../spend-tracker.config";
import type { SpendConnector, ZernioShapedDailyRow } from "./types";

/**
 * INTERIM Google Ads connector — delete when Zernio has Google connected
 * (see README.md). GAQL + methodology ported verbatim from Brian's tracker
 * `src/lib/google-ads/queries.ts`; transport reimplemented on the Google Ads
 * shared Google Ads client (`googleAds:searchStream`) to avoid pulling in the
 * `google-ads-api` package for a temporary integration.
 *
 * Methodology (locked):
 *   - Spend/clicks/impressions: campaign-level, `isMarketplaceCampaign`
 *     denylist (Decision #9m — defensive; no OS/Listed spend on Google today),
 *     re-summed to one row per day.
 *   - Conversions: `metrics.all_conversions` filtered to the TWO purchase
 *     actions (`metrics.conversions` would return 0 — Purchase is a secondary
 *     goal). Data-driven attribution (Google's default).
 */

// Purchase conversion actions — BOTH must be included to match the Google Ads
// UI totals (GTM client-side web + ECL-from-BigQuery for the Demand account).
const PURCHASE_ACTION_NAMES = [
  "Wander - GTM - Purchase - Web Production - Client-side - Account Level - 10.9.25",
  "Purchases ECL from GBQ for Demand Acct 10-25",
];

interface GoogleAdsSearchRow {
  segments?: { date?: string; conversionActionName?: string };
  campaign?: { name?: string };
  metrics?: {
    costMicros?: string | number;
    clicks?: string | number;
    impressions?: string | number;
    allConversions?: number;
    allConversionsValue?: number;
  };
}

function isConfigured(): boolean {
  return Boolean(googleAdsClient.authMode && env.GOOGLE_ADS_CUSTOMER_ID);
}

async function fetchTimeline(
  fromDate: string,
  toDate: string,
): Promise<ZernioShapedDailyRow[]> {
  // Query 1: spend/clicks/impressions — campaign-level for the denylist.
  const spendRows = await googleAdsClient.search<GoogleAdsSearchRow>(
    env.GOOGLE_ADS_CUSTOMER_ID!,
    `SELECT segments.date, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions
     FROM campaign
     WHERE segments.date BETWEEN '${fromDate}' AND '${toDate}'`,
  );

  // Query 2: purchase conversions (both actions, all_conversions).
  const purchaseRows = await googleAdsClient.search<GoogleAdsSearchRow>(
    env.GOOGLE_ADS_CUSTOMER_ID!,
    `SELECT segments.date, segments.conversion_action_name, metrics.all_conversions, metrics.all_conversions_value
     FROM customer
     WHERE segments.date BETWEEN '${fromDate}' AND '${toDate}'
       AND segments.conversion_action_name IN (${PURCHASE_ACTION_NAMES.map((n) => `'${n}'`).join(", ")})`,
  );

  // Purchases per day (summed across both actions).
  const purchasesByDate = new Map<
    string,
    { conversions: number; value: number }
  >();
  for (const row of purchaseRows) {
    const date = row.segments?.date;
    if (!date) continue;
    const existing = purchasesByDate.get(date) ?? { conversions: 0, value: 0 };
    existing.conversions += Number(row.metrics?.allConversions ?? 0);
    existing.value += Number(row.metrics?.allConversionsValue ?? 0);
    purchasesByDate.set(date, existing);
  }

  // Marketplace denylist + daily grouping (log exclusions for audit).
  const excluded = spendRows.filter(
    (r) => !isMarketplaceCampaign(r.campaign?.name),
  );
  if (excluded.length > 0) {
    const exTotal = excluded.reduce(
      (s, r) => s + Number(r.metrics?.costMicros ?? 0) / 1_000_000,
      0,
    );
    const exNames = [
      ...new Set(excluded.map((r) => r.campaign?.name ?? "(unnamed)")),
    ];
    console.log(
      `[SpendTracker/GoogleAds] Excluded ${excluded.length} non-Marketplace campaign-days, $${exTotal.toFixed(0)} spend: ${exNames.join(", ")}`,
    );
  }

  const byDate = new Map<string, ZernioShapedDailyRow>();
  for (const row of spendRows) {
    if (!isMarketplaceCampaign(row.campaign?.name)) continue;
    const date = row.segments?.date ?? fromDate;
    const existing = byDate.get(date) ?? {
      date,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      purchaseValue: 0,
    };
    existing.spend += Number(row.metrics?.costMicros ?? 0) / 1_000_000;
    existing.clicks += Number(row.metrics?.clicks ?? 0);
    existing.impressions += Number(row.metrics?.impressions ?? 0);
    byDate.set(date, existing);
  }
  for (const [date, purchases] of purchasesByDate) {
    const existing = byDate.get(date);
    if (!existing) continue; // no spend row that day — conversions without spend stay BQ-attributed
    existing.conversions = purchases.conversions;
    existing.purchaseValue = purchases.value;
  }

  const rows = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalConversions = rows.reduce((s, r) => s + r.conversions, 0);
  console.log(
    `[SpendTracker/GoogleAds] ${rows.length} days, ${totalConversions.toFixed(0)} purchases, $${totalSpend.toFixed(0)} marketplace spend (data-driven)`,
  );
  return rows;
}

export const googleAdsConnector: SpendConnector = {
  platform: "google",
  isConfigured,
  fetchTimeline,
};
