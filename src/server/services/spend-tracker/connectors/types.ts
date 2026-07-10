/**
 * Interim-connector contract — shaped like Zernio's ads API so connectors can
 * be swapped for real Zernio calls when the platform lands there (see README).
 *
 * Field provenance (verified against the live Zernio API, 2026-07-10):
 *   date / spend / impressions / clicks / conversions — `GET /ads/timeline`
 *     row fields ("daily aggregate metrics... one row per calendar day").
 *   purchaseValue — Zernio ads-tree `metrics.purchaseValue` (timeline rows
 *     don't carry a value field; the tree metric is the canonical name).
 */
export interface ZernioShapedDailyRow {
  /** YYYY-MM-DD */
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  purchaseValue: number;
}

export interface SpendConnector {
  platform: "google" | "pinterest";
  /** False ⇒ the service skips this connector (BigQuery fallback). */
  isConfigured(): boolean;
  fetchTimeline(
    fromDate: string,
    toDate: string,
  ): Promise<ZernioShapedDailyRow[]>;
}
