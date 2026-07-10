import type { MetaCampaignDayRecord } from "@/server/clients/meta.client";
import { isMarketplaceCampaign, type MetaInsightRow } from "./spend-tracker.config";

/**
 * Meta daily insights for the spend tracker — campaign-level fetch, filtered
 * to Marketplace campaigns, grouped to one row per day.
 *
 * Ported from wander-growth-tracker `src/lib/meta/queries.ts` +
 * `src/lib/meta/bookings.ts`. Methodology (locked):
 *   - Attribution: 28d_click + 1d_view, summed (Decision #6 / meta-api.md).
 *   - Marketplace denylist on campaign_name (Decision #9m) — the ad account is
 *     shared with WanderOS/Listed. Excluded spend is logged for audit.
 *   - Bookings/values extracted PER campaign-day row first (each row has its
 *     own actions array), THEN summed — never concat actions arrays.
 */

interface MetaActionEntry {
  action_type: string;
  value?: string;
  "1d_view"?: string;
  "28d_click"?: string;
}

function safeParseInt(value: string | undefined): number {
  if (value === undefined || value === null) return 0;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? 0 : parsed;
}

function safeParseFloat(value: string | undefined): number {
  if (value === undefined || value === null) return 0;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? 0 : parsed;
}

type AttributionWindow = "28d_click" | "1d_view";

/** Port of tracker getBookingsFromActions (purchase | omni_purchase). */
export function getBookingsFromActions(
  actions: MetaActionEntry[] | null | undefined,
  attributionWindow: AttributionWindow,
): number {
  if (!actions || !Array.isArray(actions)) return 0;

  const bookingAction = actions.find(
    (action) =>
      (action.action_type === "purchase" ||
        action.action_type === "omni_purchase") &&
      action[attributionWindow] !== undefined,
  );
  if (bookingAction) return safeParseInt(bookingAction[attributionWindow]);

  // Fallback: standard value field
  const fallback = actions.find(
    (action) =>
      action.action_type === "purchase" ||
      action.action_type === "omni_purchase",
  );
  return fallback ? safeParseInt(fallback.value) : 0;
}

/** Port of tracker getPurchaseValueFromActions. */
export function getPurchaseValueFromActions(
  actionValues: MetaActionEntry[] | null | undefined,
  attributionWindow: AttributionWindow,
): number {
  if (!actionValues || !Array.isArray(actionValues)) return 0;

  const purchaseAction = actionValues.find(
    (action) =>
      action.action_type === "purchase" ||
      action.action_type === "omni_purchase",
  );
  if (!purchaseAction) return 0;

  if (purchaseAction[attributionWindow] !== undefined) {
    return safeParseFloat(purchaseAction[attributionWindow]);
  }
  return safeParseFloat(purchaseAction.value);
}

/**
 * Pure post-processing: marketplace-filter campaign-day rows and group to one
 * MetaInsightRow per day. Extracted from the fetch so it's unit-testable.
 */
export function buildMetaDailyRows(
  campaignDays: MetaCampaignDayRecord[],
): MetaInsightRow[] {
  // Exclude non-Marketplace campaigns (WanderOS + Listed) — shared account (#9m).
  // Log every excluded campaign + spend so a naming drift is auditable.
  const excluded = campaignDays.filter(
    (r) => !isMarketplaceCampaign(r.campaign_name),
  );
  if (excluded.length > 0) {
    const exBy = new Map<string, number>();
    for (const r of excluded) {
      const n = r.campaign_name ?? "(unnamed)";
      exBy.set(n, (exBy.get(n) ?? 0) + (parseFloat(r.spend) || 0));
    }
    const exTotal = [...exBy.values()].reduce((s, v) => s + v, 0);
    console.log(
      `[SpendTracker/Meta] Excluded ${excluded.length} non-Marketplace campaign-days, $${exTotal.toFixed(0)} spend:`,
    );
    for (const [n, s] of exBy) console.log(`  - ${n}: $${s.toFixed(0)}`);
  }
  const kept = campaignDays.filter((r) => isMarketplaceCampaign(r.campaign_name));

  // Group kept campaign-rows by day. Extract bookings/values PER campaign-row
  // first, then sum — never concat actions arrays (28d_click + 1d_view math).
  const byDate = new Map<string, MetaInsightRow>();
  for (const row of kept) {
    const date = row.date_start;
    const b28 = getBookingsFromActions(row.actions, "28d_click");
    const b1 = getBookingsFromActions(row.actions, "1d_view");
    const v28 = getPurchaseValueFromActions(row.action_values, "28d_click");
    const v1 = getPurchaseValueFromActions(row.action_values, "1d_view");

    const existing = byDate.get(date) ?? {
      date,
      spend: 0,
      clicks: 0,
      impressions: 0,
      bookings28dClick: 0,
      bookings1dView: 0,
      totalBookings: 0,
      purchaseValue28dClick: 0,
      purchaseValue1dView: 0,
      totalPurchaseValue: 0,
    };
    existing.spend += parseFloat(row.spend) || 0;
    existing.clicks += parseInt(row.clicks) || 0;
    existing.impressions += parseInt(row.impressions) || 0;
    existing.bookings28dClick += b28;
    existing.bookings1dView += b1;
    existing.totalBookings += b28 + b1;
    existing.purchaseValue28dClick += v28;
    existing.purchaseValue1dView += v1;
    existing.totalPurchaseValue += v28 + v1;
    byDate.set(date, existing);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
