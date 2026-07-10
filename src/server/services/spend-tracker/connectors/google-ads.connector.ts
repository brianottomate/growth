import "server-only";

import { env } from "@/env";
import { isMarketplaceCampaign } from "../spend-tracker.config";
import type { SpendConnector, ZernioShapedDailyRow } from "./types";

/**
 * INTERIM Google Ads connector — delete when Zernio has Google connected
 * (see README.md). GAQL + methodology ported verbatim from Brian's tracker
 * `src/lib/google-ads/queries.ts`; transport reimplemented on the Google Ads
 * REST API (OAuth refresh + `googleAds:searchStream`) to avoid pulling in the
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

const GOOGLE_ADS_API_VERSION = "v20";

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
  return Boolean(
    env.GOOGLE_ADS_CLIENT_ID &&
      env.GOOGLE_ADS_CLIENT_SECRET &&
      env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      env.GOOGLE_ADS_REFRESH_TOKEN &&
      env.GOOGLE_ADS_CUSTOMER_ID,
  );
}

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Google OAuth token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google OAuth: no access_token in response");
  return json.access_token;
}

/** Run a GAQL query via searchStream and flatten the result batches. */
async function gaqlSearch(
  accessToken: string,
  query: string,
): Promise<GoogleAdsSearchRow[]> {
  const customerId = env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, "");
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    "Content-Type": "application/json",
  };
  if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers["login-customer-id"] = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "");
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Google Ads API ${res.status}: ${await res.text()}`);
  }

  // searchStream returns an ARRAY of batches: [{ results: [...] }, ...]
  const batches = (await res.json()) as Array<{ results?: GoogleAdsSearchRow[] }>;
  return batches.flatMap((b) => b.results ?? []);
}

async function fetchTimeline(
  fromDate: string,
  toDate: string,
): Promise<ZernioShapedDailyRow[]> {
  const accessToken = await getAccessToken();

  // Query 1: spend/clicks/impressions — campaign-level for the denylist.
  const spendRows = await gaqlSearch(
    accessToken,
    `SELECT segments.date, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions
     FROM campaign
     WHERE segments.date BETWEEN '${fromDate}' AND '${toDate}'`,
  );

  // Query 2: purchase conversions (both actions, all_conversions).
  const purchaseRows = await gaqlSearch(
    accessToken,
    `SELECT segments.date, segments.conversion_action_name, metrics.all_conversions, metrics.all_conversions_value
     FROM customer
     WHERE segments.date BETWEEN '${fromDate}' AND '${toDate}'
       AND segments.conversion_action_name IN (${PURCHASE_ACTION_NAMES.map((n) => `'${n}'`).join(", ")})`,
  );

  // Purchases per day (summed across both actions).
  const purchasesByDate = new Map<string, { conversions: number; value: number }>();
  for (const row of purchaseRows) {
    const date = row.segments?.date;
    if (!date) continue;
    const existing = purchasesByDate.get(date) ?? { conversions: 0, value: 0 };
    existing.conversions += Number(row.metrics?.allConversions ?? 0);
    existing.value += Number(row.metrics?.allConversionsValue ?? 0);
    purchasesByDate.set(date, existing);
  }

  // Marketplace denylist + daily grouping (log exclusions for audit).
  const excluded = spendRows.filter((r) => !isMarketplaceCampaign(r.campaign?.name));
  if (excluded.length > 0) {
    const exTotal = excluded.reduce(
      (s, r) => s + Number(r.metrics?.costMicros ?? 0) / 1_000_000,
      0,
    );
    const exNames = [...new Set(excluded.map((r) => r.campaign?.name ?? "(unnamed)"))];
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

  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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
