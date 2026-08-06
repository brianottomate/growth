import "server-only";

import { env } from "@/env";
import type { SpendConnector, ZernioShapedDailyRow } from "./types";

/**
 * INTERIM Pinterest Ads connector — delete when Zernio has Pinterest connected
 * (see README.md). Ported from Brian's tracker `src/lib/pinterest/queries.ts`.
 *
 * Pinterest is DORMANT ($0 spend for 30d as of Jul 2026) and its creds were
 * never handed off, so this ships unconfigured — it exists so reactivating the
 * channel is an env-var change, not a build.
 *
 * Methodology (locked): 30d click + 30d view windows (Ads Manager default);
 * conversions = TOTAL_CHECKOUT; value = TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR/1e6.
 */

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";

interface PinterestAnalyticsRow {
  DATE: string;
  SPEND_IN_DOLLAR?: number;
  PAID_IMPRESSION?: number;
  CLICKTHROUGH_1?: number;
  TOTAL_CHECKOUT?: number;
  TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR?: number;
}

function isConfigured(): boolean {
  return Boolean(env.PINTEREST_ACCESS_TOKEN && env.PINTEREST_AD_ACCOUNT_ID);
}

async function fetchTimeline(
  fromDate: string,
  toDate: string,
): Promise<ZernioShapedDailyRow[]> {
  const params = new URLSearchParams({
    start_date: fromDate,
    end_date: toDate,
    granularity: "DAY",
    click_window_days: "30",
    view_window_days: "30",
    columns:
      "SPEND_IN_DOLLAR,PAID_IMPRESSION,CLICKTHROUGH_1,TOTAL_CHECKOUT,TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR",
  });

  const res = await fetch(
    `${PINTEREST_API_BASE}/ad_accounts/${env.PINTEREST_AD_ACCOUNT_ID}/analytics?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${env.PINTEREST_ACCESS_TOKEN}` },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Pinterest API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as PinterestAnalyticsRow[];
  if (!Array.isArray(data)) return [];

  const rows = data
    .map((row) => ({
      date: row.DATE,
      spend: row.SPEND_IN_DOLLAR ?? 0,
      impressions: row.PAID_IMPRESSION ?? 0,
      clicks: row.CLICKTHROUGH_1 ?? 0,
      conversions: row.TOTAL_CHECKOUT ?? 0,
      purchaseValue:
        (row.TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR ?? 0) / 1_000_000,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  console.log(
    `[SpendTracker/Pinterest] ${rows.length} days, $${totalSpend.toFixed(0)} spend (30d click + 30d view)`,
  );
  return rows;
}

export const pinterestConnector: SpendConnector = {
  platform: "pinterest",
  isConfigured,
  fetchTimeline,
};
