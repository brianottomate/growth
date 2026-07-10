import "server-only";

import { fetchMetaCampaignDailyInsights } from "@/server/clients/meta.client";
import type { MetaInsightRow } from "./spend-tracker.config";
import { buildMetaDailyRows } from "./spend-tracker.meta-rows";

/**
 * Fetch + process: one MetaInsightRow per day for the window, marketplace-only
 * (28d_click + 1d_view). Pure post-processing lives in
 * `spend-tracker.meta-rows.ts` (unit-tested); this is the I/O wrapper.
 *
 * Graceful degradation: on API failure returns [] so the merge falls back to
 * BigQuery for Meta (matches the tracker's behavior — meta-api.md:75-77).
 */
export async function fetchMetaDailyRows(
  startDate: string,
  endDate: string,
): Promise<MetaInsightRow[]> {
  try {
    const campaignDays = await fetchMetaCampaignDailyInsights({
      startDate,
      endDate,
    });
    const rows = buildMetaDailyRows(campaignDays);
    const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
    const totalBookings = rows.reduce((s, r) => s + r.totalBookings, 0);
    console.log(
      `[SpendTracker/Meta] ${rows.length} days, ${totalBookings} bookings, $${totalSpend.toFixed(0)} marketplace spend (28d_click + 1d_view)`,
    );
    return rows;
  } catch (err) {
    console.error(
      `[SpendTracker/Meta] API failed — falling back to BigQuery for Meta:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
