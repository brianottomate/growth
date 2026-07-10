import "server-only";

import { unstable_cache } from "next/cache";

import {
  ACTIVE_CHANNELS,
  BLENDED_TAKE_RATE,
  CPB_EXCLUDED_CHANNELS,
  CPB_TARGET,
  OTA_CHANNELS,
  type Channel,
  type ChannelMetrics,
  type DailyChannelRow,
  type DashboardSummary,
} from "./spend-tracker.config";
import { googleAdsConnector } from "./connectors/google-ads.connector";
import { pinterestConnector } from "./connectors/pinterest.connector";
import type { SpendConnector } from "./connectors/types";
import {
  applyDemandSalesManual,
  buildFixedCostRows,
  computeChannelPacing,
  computeDataHealth,
  mergeSpendBookingsAndFunnel,
  normalizeDate,
} from "./spend-tracker.merge";
import { fetchMetaDailyRows } from "./spend-tracker.meta";
import {
  fetchBookingData,
  fetchDylanGmv,
  fetchFunnelData,
  fetchNorthStarData,
  fetchSpendData,
  fetchTrueTotals,
  type BigQueryNorthStarRow,
} from "./spend-tracker.queries";

/**
 * Spend Tracker — orchestrator. Pulls spend (Meta API marketplace-filtered +
 * BQ ad-network for the rest), revenue/bookings/funnel (BigQuery), fixed costs
 * + demand-sales manual numbers (in-repo config), merges to daily per-channel
 * rows, and computes the dashboard summary with the tracker's locked KPI
 * formulas. Cached via unstable_cache; a daily cron warms it.
 *
 * KPI formulas + enrichment ported from wander-growth-tracker
 * `src/app/api/dashboard/route.ts` (buildSummaryFromSnapshots) and
 * `src/lib/bigquery/cache.ts` (enrichWithTrueTotals / NorthStar / DylanGmv).
 */

export const SPEND_TRACKER_CACHE_TAG = "spend-tracker";
const CACHE_TTL_SECONDS = 3600; // cron re-warms daily; manual refresh revalidates the tag

// -----------------------------------------------------------------------------
// Window
// -----------------------------------------------------------------------------

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a concrete YYYY-MM-DD window (default = last 90 days). Computed by
 * the caller so the cache key is a stable explicit window per day.
 */
export function resolveSpendWindow(input: {
  start?: string;
  end?: string;
  days?: number;
}): { startDate: string; endDate: string } {
  const endDate = input.end ?? ymd(new Date());
  const startDate =
    input.start ??
    ymd(new Date(Date.now() - (input.days ?? 90) * 24 * 60 * 60 * 1000));
  return { startDate, endDate };
}

// -----------------------------------------------------------------------------
// Interim connectors (Google / Pinterest until Zernio has them — connectors/README.md)
// -----------------------------------------------------------------------------

/**
 * Fetch a connector's timeline if configured; [] otherwise or on failure
 * (per-day BigQuery fallback in the merge — same degradation as Meta).
 */
async function fetchConnectorRows(connector: SpendConnector, startDate: string, endDate: string) {
  if (!connector.isConfigured()) return [];
  try {
    return await connector.fetchTimeline(startDate, endDate);
  } catch (err) {
    console.error(
      `[SpendTracker/${connector.platform}] connector failed — falling back to BigQuery:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// -----------------------------------------------------------------------------
// Core compute (uncached)
// -----------------------------------------------------------------------------

export interface SpendTrackerResult {
  summary: DashboardSummary;
  /** All merged daily rows (incl. fixed-cost + manual rows) — trends/write-back input. */
  rows: ChannelMetrics[];
}

/** Uncached core compute — used by the cached entry point and verify scripts. */
export async function computeSpendTracker(
  startDate: string,
  endDate: string,
): Promise<SpendTrackerResult> {
  // Parallel fetch: 5 BigQuery reads + platform APIs (graceful per-source
  // failure for the APIs; BQ failures throw — no numbers beats wrong numbers).
  const [
    spendRows,
    bookingRows,
    funnelRows,
    metaRows,
    googleRows,
    pinterestRows,
    trueTotals,
    dylanGmv,
    northStar,
  ] = await Promise.all([
    fetchSpendData(startDate, endDate),
    fetchBookingData(startDate, endDate),
    fetchFunnelData(startDate, endDate),
    fetchMetaDailyRows(startDate, endDate),
    fetchConnectorRows(googleAdsConnector, startDate, endDate),
    fetchConnectorRows(pinterestConnector, startDate, endDate),
    fetchTrueTotals(startDate, endDate),
    fetchDylanGmv(startDate, endDate),
    fetchNorthStarData(startDate, endDate).catch((err) => {
      console.error("[SpendTracker] north_star_metrics failed:", err);
      return [] as BigQueryNorthStarRow[];
    }),
  ]);

  const merged = mergeSpendBookingsAndFunnel(
    spendRows,
    bookingRows,
    funnelRows,
    metaRows,
    // Zernio-shaped connector rows → override-row shape (purchaseValue is
    // Zernio's name for conversion value).
    googleRows.map((r) => ({
      date: r.date,
      spend: r.spend,
      clicks: r.clicks,
      impressions: r.impressions,
      conversions: r.conversions,
      conversionsValue: r.purchaseValue,
    })),
    pinterestRows.map((r) => ({
      date: r.date,
      spend: r.spend,
      clicks: r.clicks,
      impressions: r.impressions,
      conversions: r.conversions,
      conversionsValue: r.purchaseValue,
    })),
  );
  const fixedRows = buildFixedCostRows(startDate, endDate);
  const rows = applyDemandSalesManual(
    [...merged, ...fixedRows],
    startDate,
    endDate,
  );

  const summary = buildSummaryFromRows(rows, startDate, endDate);

  // --- Enrichment (tracker cache.ts, Supabase wrappers dropped) ---

  // True totals (Decision #9g): finance-aligned top-line bookings override.
  if (trueTotals) {
    const total = Number(trueTotals.total_confirmed_profit) || 0;
    const wanderDirect = Number(trueTotals.wander_direct) || 0;
    const manualProfit = Number(trueTotals.manual_profit) || 0;
    const ota = Number(trueTotals.ota_confirmed_profit) || 0;

    summary.totals.bookings = total;
    summary.totals.directBookings = wanderDirect + manualProfit;
    summary.totals.otaBookings = ota;
    summary.totals.wanderDirectBookings = wanderDirect;
    summary.totals.manualBookings = manualProfit;

    const spend = summary.totals.totalMarketingSpend;
    summary.efficiency.cpb = total > 0 ? spend / total : 0;
    summary.efficiency.directCpb =
      summary.totals.directBookings > 0
        ? spend / summary.totals.directBookings
        : 0;
    summary.efficiency.fullyLoadedCpb = total > 0 ? spend / total : 0;
  }

  // North star (Decision #9b): gross take from dbt; net take = gross − OUR
  // complete spend (ads + fixed). No multiplier — actuals only.
  if (northStar.length > 0) {
    const ns = northStar.reduce(
      (acc, row) => ({
        grossTake: acc.grossTake + (Number(row.gross_take) || 0),
        directGmv: acc.directGmv + (Number(row.direct_gmv) || 0),
        totalGmv: acc.totalGmv + (Number(row.total_gmv) || 0),
        directConfirmedBookings:
          acc.directConfirmedBookings +
          (Number(row.direct_confirmed_booking_count) || 0),
        engagedSessions:
          acc.engagedSessions + (Number(row.engaged_sessions) || 0),
      }),
      {
        grossTake: 0,
        directGmv: 0,
        totalGmv: 0,
        directConfirmedBookings: 0,
        engagedSessions: 0,
      },
    );
    const actualMarketingSpend = summary.totals.totalMarketingSpend;
    const netTake = ns.grossTake - actualMarketingSpend;

    // Settled net take: gross take restates upward for several days
    // (recognition backfill), spend doesn't — so clip BOTH to T-7 for an
    // apples-to-apples figure. Computed from rows already in hand.
    const SETTLE_DAYS = 7;
    const settledThrough = ymd(
      new Date(Date.now() - SETTLE_DAYS * 24 * 60 * 60 * 1000),
    );
    let settled: NonNullable<typeof summary.northStar>["settled"] = null;
    const settledGross = northStar
      .filter((r) => normalizeDate(r.dt) <= settledThrough)
      .reduce((s, r) => s + (Number(r.gross_take) || 0), 0);
    const settledSpend = rows
      .filter((r) => r.date <= settledThrough)
      .reduce((s, r) => s + (r.spend ?? 0), 0);
    if (northStar.some((r) => normalizeDate(r.dt) <= settledThrough)) {
      settled = {
        through: settledThrough,
        grossTake: settledGross,
        spend: settledSpend,
        netTake: settledGross - settledSpend,
      };
    }

    summary.northStar = {
      ...ns,
      totalMarketingSpend: actualMarketingSpend,
      netTake,
      netTakeRate: ns.directGmv > 0 ? netTake / ns.directGmv : 0,
      takeRate: ns.directGmv > 0 ? ns.grossTake / ns.directGmv : 0,
      settled,
    };
    summary.efficiency.netTakeRate = summary.northStar.netTakeRate;
  }

  // Dylan GMV (Decision #9h): canonical top-line GMV override.
  if (dylanGmv) {
    const total = Number(dylanGmv.total_gmv) || 0;
    const direct = Number(dylanGmv.direct_gmv) || 0;
    summary.totals.gmv = total;
    summary.totals.directGmv = direct;
    summary.totals.otaGmv = total - direct;
  }

  return { summary, rows };
}

// -----------------------------------------------------------------------------
// Summary builder (dashboard/route.ts buildSummaryFromSnapshots — port)
// -----------------------------------------------------------------------------

function buildSummaryFromRows(
  rows: ChannelMetrics[],
  startDate: string,
  endDate: string,
): DashboardSummary {
  const now = new Date();
  const days =
    Math.ceil(
      (new Date(`${endDate}T00:00:00Z`).getTime() -
        new Date(`${startDate}T00:00:00Z`).getTime()) /
        86400000,
    ) + 1;

  let adSpend = 0;
  let fixedCostSpend = 0;
  let directGmv = 0;
  let otaGmv = 0;
  let takeRateRevenue = 0;
  let pointsUsed = 0;
  let couponOff = 0;
  let otaBookingsNative = 0;

  const totals: DashboardSummary["totals"] = {
    adSpend: 0,
    fixedCosts: 0,
    pointsUsed: 0,
    couponOff: 0,
    totalMarketingSpend: 0,
    spend: 0,
    accountCreations: 0,
    checkoutPreviewed: 0,
    checkoutStarted: 0,
    bookings: 0,
    directBookings: 0,
    otaBookings: 0,
    wanderDirectBookings: 0,
    manualBookings: 0,
    gmv: 0,
    directGmv: 0,
    otaGmv: 0,
    takeRateRevenue: 0,
  };

  interface ChannelAgg {
    spend: number;
    bookings: number;
    accountCreations: number;
    checkoutStarted: number;
    gmv: number;
    takeRateRevenue: number;
    pointsUsed: number;
    couponOff: number;
    directBookings: number;
    otaBookings: number;
    clicks: number;
    impressions: number;
    lastDate: string;
    dataSource: string;
    attribution: string;
    completedFixedDays: number;
    spendThroughYesterday: number;
  }
  const channelMap = new Map<Channel, ChannelAgg>();

  const todayUTC = new Date().toISOString().split("T")[0]!;

  for (const snap of rows) {
    if (snap.dataSource === "fixed_cost") {
      fixedCostSpend += snap.spend ?? 0;
    } else {
      adSpend += snap.spend ?? 0;
    }
    totals.accountCreations += snap.accountCreations ?? 0;
    totals.checkoutPreviewed += snap.checkoutPreviewed ?? 0;
    totals.checkoutStarted += snap.checkoutStarted ?? 0;
    totals.bookings += snap.bookings ?? 0;
    totals.gmv += snap.gmv ?? 0;
    takeRateRevenue += snap.takeRateRevenue ?? 0;
    pointsUsed += snap.pointsUsed ?? 0;
    couponOff += snap.couponOff ?? 0;
    otaBookingsNative += snap.otaBookings ?? 0;

    const channel = snap.channel;

    if (OTA_CHANNELS.includes(channel)) {
      otaGmv += snap.gmv ?? 0;
    } else {
      directGmv += snap.gmv ?? 0;
    }

    if (!CPB_EXCLUDED_CHANNELS.includes(channel)) {
      totals.directBookings += snap.bookings ?? 0;
    }

    const existing = channelMap.get(channel) ?? {
      spend: 0,
      bookings: 0,
      accountCreations: 0,
      checkoutStarted: 0,
      gmv: 0,
      takeRateRevenue: 0,
      pointsUsed: 0,
      couponOff: 0,
      directBookings: 0,
      otaBookings: 0,
      clicks: 0,
      impressions: 0,
      lastDate: snap.date,
      dataSource: snap.dataSource,
      attribution: snap.attribution,
      completedFixedDays: 0,
      spendThroughYesterday: 0,
    };

    // Completed fixed-cost days (non-zero slice) for pacing — the in-progress
    // UTC day is written at $0 (Decision #9j) so it's excluded here.
    if (snap.dataSource === "fixed_cost" && (snap.spend ?? 0) > 0) {
      existing.completedFixedDays += 1;
    }
    // Spend on completed days only — pacing projects off this (Decision #9l).
    if (snap.date < todayUTC) {
      existing.spendThroughYesterday += snap.spend ?? 0;
    }

    existing.spend += snap.spend ?? 0;
    existing.bookings += snap.bookings ?? 0;
    existing.accountCreations += snap.accountCreations ?? 0;
    existing.checkoutStarted += snap.checkoutStarted ?? 0;
    existing.gmv += snap.gmv ?? 0;
    existing.takeRateRevenue += snap.takeRateRevenue ?? 0;
    existing.pointsUsed += snap.pointsUsed ?? 0;
    existing.couponOff += snap.couponOff ?? 0;
    existing.directBookings += snap.directBookings ?? 0;
    existing.otaBookings += snap.otaBookings ?? 0;
    existing.clicks += snap.clicks ?? 0;
    existing.impressions += snap.impressions ?? 0;

    // Channel-level dataSource: prefer the API/fixed source over 'bigquery'
    // (a channel's rows mix sources; the table shows its primary source).
    if (snap.dataSource !== "bigquery" && existing.dataSource === "bigquery") {
      existing.dataSource = snap.dataSource;
      existing.attribution = snap.attribution;
    }

    if (snap.date > existing.lastDate) {
      existing.lastDate = snap.date;
    }

    channelMap.set(channel, existing);
  }

  totals.adSpend = adSpend;
  totals.fixedCosts = fixedCostSpend;
  totals.pointsUsed = pointsUsed;
  totals.couponOff = couponOff;
  totals.takeRateRevenue = takeRateRevenue;
  totals.directGmv = directGmv;
  totals.otaGmv = otaGmv;
  totals.otaBookings = otaBookingsNative;

  // Total marketing spend = ad spend + fixed costs (Kyle, Mar 19 2026).
  // NOT + points + coupons (revenue reductions, not acquisition costs).
  const totalMarketingSpend = adSpend + fixedCostSpend;
  totals.totalMarketingSpend = totalMarketingSpend;
  totals.spend = totalMarketingSpend;

  // Net-take FALLBACK (only meaningful when north_star is unavailable):
  // gross take ≈ takeRateRevenue; net = gross − complete spend. No multiplier.
  const netTake = takeRateRevenue - totalMarketingSpend;
  const netTakeRate = directGmv > 0 ? netTake / directGmv : 0;

  const efficiency: DashboardSummary["efficiency"] = {
    cpac:
      totals.accountCreations > 0
        ? totalMarketingSpend / totals.accountCreations
        : 0,
    cpb: totals.bookings > 0 ? totalMarketingSpend / totals.bookings : 0,
    directCpb:
      totals.directBookings > 0
        ? totalMarketingSpend / totals.directBookings
        : 0,
    fullyLoadedCpb:
      totals.bookings > 0 ? totalMarketingSpend / totals.bookings : 0,
    // ROAS denominator is AD spend, not total marketing spend (deliberate).
    roas: adSpend > 0 ? (totals.gmv * BLENDED_TAKE_RATE) / adSpend : 0,
    netTakeRate,
  };

  // Pacing (Decisions #9j/#9k/#9l/#14)
  const currentDayOfMonth = now.getDate();
  const calendarDaysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  const channels: ChannelMetrics[] = [];
  channelMap.forEach((agg, channel) => {
    if (!ACTIVE_CHANNELS.includes(channel)) return;

    const pacing = computeChannelPacing(agg, {
      currentDayOfMonth,
      calendarDaysInMonth,
    });
    const gmvPacing =
      currentDayOfMonth > 0 && agg.gmv > 0
        ? (agg.gmv / currentDayOfMonth) * calendarDaysInMonth
        : null;

    channels.push({
      channel,
      date: agg.lastDate,
      spend: agg.spend,
      bookings: agg.bookings,
      accountCreations: agg.accountCreations,
      checkoutPreviewed: null,
      checkoutStarted: agg.checkoutStarted,
      gmv: agg.gmv,
      pointsUsed: agg.pointsUsed || null,
      couponOff: agg.couponOff || null,
      takeRateRevenue: agg.takeRateRevenue || null,
      directBookings: agg.directBookings || null,
      otaBookings: agg.otaBookings || null,
      clicks: agg.clicks || null,
      impressions: agg.impressions || null,
      cpac: agg.accountCreations > 0 ? agg.spend / agg.accountCreations : null,
      cpcp: null,
      cpc: agg.checkoutStarted > 0 ? agg.spend / agg.checkoutStarted : null,
      cpb: agg.bookings > 0 ? agg.spend / agg.bookings : null,
      roas: agg.spend > 0 ? (agg.gmv * BLENDED_TAKE_RATE) / agg.spend : null,
      pacing,
      gmvPacing,
      dataSource: agg.dataSource as ChannelMetrics["dataSource"],
      attribution: agg.attribution as ChannelMetrics["attribution"],
      lastUpdated: new Date().toISOString(),
    });
  });

  channels.sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));

  const latestDataDate = rows.reduce(
    (max, snap) => (snap.date > max ? snap.date : max),
    "",
  );

  const dataHealth = computeDataHealth(
    rows.map((s) => ({
      channel: s.channel,
      date: s.date,
      bookings: s.bookings,
      dataSource: s.dataSource,
    })),
    startDate,
    latestDataDate || endDate,
  );

  return {
    period: {
      month: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      daysInMonth: days,
      daysElapsed: days,
      asOfDate: now.toISOString().split("T")[0]!,
    },
    totals,
    efficiency,
    targets: { cpbTarget: CPB_TARGET, bookingsTarget: 1000 },
    channels,
    dataFreshness: {
      lastRefresh: new Date().toISOString(),
      latestDataDate: latestDataDate || endDate,
      oldestData: startDate,
    },
    dataHealth,
  };
}

// -----------------------------------------------------------------------------
// Cached entry points
// -----------------------------------------------------------------------------

const computeCached = unstable_cache(
  async (startDate: string, endDate: string) =>
    computeSpendTracker(startDate, endDate),
  ["spend-tracker-v1"],
  { revalidate: CACHE_TTL_SECONDS, tags: [SPEND_TRACKER_CACHE_TAG] },
);

/** Cached dashboard for an explicit window (resolve via resolveSpendWindow). */
export async function getSpendTracker(
  startDate: string,
  endDate: string,
): Promise<SpendTrackerResult> {
  return computeCached(startDate, endDate);
}

// -----------------------------------------------------------------------------
// Trends (daily series for charts)
// -----------------------------------------------------------------------------

export interface TrendPoint {
  date: string;
  [channelOrMetric: string]: string | number;
}

/** Daily spend series per active channel + total, for the trends chart. */
export function buildSpendTrend(rows: ChannelMetrics[]): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>();
  for (const row of rows) {
    const date = normalizeDate(row.date);
    const point = byDate.get(date) ?? { date, total: 0 };
    if (ACTIVE_CHANNELS.includes(row.channel)) {
      point[row.channel] = ((point[row.channel] as number) ?? 0) + (row.spend ?? 0);
    }
    point.total = ((point.total as number) ?? 0) + (row.spend ?? 0);
    byDate.set(date, point);
  }
  return [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

// -----------------------------------------------------------------------------
// Option C (v1.1): flat daily spend rows for the BQ write-back
// -----------------------------------------------------------------------------

/**
 * Flatten merged rows to the `growth_tracker_daily_spend` shape (Decision O-2 /
 * Stream 1: dbt north-star reads real spend; the 1.70× multiplier dies).
 * Not wired to a writer yet — pending Joao's confirmation on table/dataset.
 */
export function computeDailySpendRows(rows: ChannelMetrics[]): DailyChannelRow[] {
  return rows
    .filter((r) => (r.spend ?? 0) > 0)
    .map((r) => ({
      date: r.date,
      channel: r.channel,
      spend: r.spend ?? 0,
      dataSource: r.dataSource,
      attribution: r.attribution,
    }));
}
