/**
 * Spend Tracker — merge + pacing + fixed costs + data health.
 * Pure functions only (no I/O) so everything here is unit-testable.
 *
 * Ported from wander-growth-tracker:
 *   - mergeSpendBookingsAndFunnel  ← src/lib/bigquery/mapper.ts (verbatim semantics)
 *   - computeChannelPacing         ← src/lib/metrics/pacing.ts (verbatim)
 *   - fixed-cost pro-ration        ← src/app/api/refresh/route.ts lines 147-217
 *   - computeDataHealth            ← src/lib/validation/post-refresh.ts
 *   - demand-sales injection       ← sheets sync, re-sourced to in-repo config
 */

import {
  BLENDED_TAKE_RATE,
  DATA_SOURCE_HIERARCHY,
  DEMAND_SALES_MONTHLY,
  FIXED_COST_TO_CHANNEL,
  resolveFixedCostsForMonth,
  type Channel,
  type ChannelMetrics,
  type DataHealth,
  type DataHealthStatus,
  type GoogleInsightRow,
  type MetaInsightRow,
  type PinterestInsightRow,
} from "./spend-tracker.config";
import type {
  BigQueryBookingRow,
  BigQueryConversionRow,
  BigQuerySpendRow,
} from "./spend-tracker.queries";

// -----------------------------------------------------------------------------
// Channel mapping (mapper.ts PLATFORM_TO_CHANNEL — lowercased keys)
// -----------------------------------------------------------------------------

export const PLATFORM_TO_CHANNEL: Record<string, Channel> = {
  // Meta
  facebook: "meta",
  instagram: "meta",
  facebook_ads: "meta",
  meta: "meta",

  // Google
  google: "google",
  google_ads: "google",
  google_search: "google",
  youtube: "google",

  // Other paid
  tiktok: "tiktok",
  pinterest: "pinterest",
  bing: "microsoft",
  microsoft: "microsoft",
  criteo: "criteo",

  // Non-paid
  mountain: "mountain",
  influencer: "influencer",
  email: "lifecycle",
  lifecycle: "lifecycle",
  "customer io": "lifecycle",
  customerio: "lifecycle",
  "email action": "lifecycle",
  newsletter: "lifecycle",
  iterable: "lifecycle",
  demand_sales: "demand_sales",
  direct_mail: "direct_mail",
  "direct mail": "direct_mail",
  affiliate: "affiliate",
  benefithub: "affiliate",
  seo: "seo",
  organic: "organic",
  airbnb: "airbnb",
  vrbo: "vrbo",
  booking: "booking",
  mybookingpal: "amex",

  // Explicit partner values from funnel_events_attribution
  // "Manual" = manually-entered bookings; "Other" = catch-all.
  manual: "other",
  other: "other",
};

export function mapPlatformToChannel(platform: string): Channel {
  const normalized = platform.toLowerCase().trim();
  return PLATFORM_TO_CHANNEL[normalized] ?? "other";
}

export function mapPartnerToChannel(partner: string | null): Channel {
  if (!partner) return "other";
  const normalized = partner.toLowerCase().trim();
  return PLATFORM_TO_CHANNEL[normalized] ?? "other";
}

/** Normalize BigQuery date values (string | Date | { value }). */
export function normalizeDate(date: unknown): string {
  if (typeof date === "string") {
    return date.includes("T") ? date.split("T")[0]! : date;
  }
  if (date instanceof Date) {
    return date.toISOString().split("T")[0]!;
  }
  if (date && typeof date === "object" && "value" in date) {
    return String((date as { value: string }).value);
  }
  return String(date);
}

// -----------------------------------------------------------------------------
// The merger (mapper.ts — port)
// -----------------------------------------------------------------------------

interface DailyMetrics {
  channel: Channel;
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  accountCreations: number;
  checkoutStarted: number;
  bookings: number;
  gmv: number;
  takeRateRevenue: number;
  pointsUsed: number;
  couponOff: number;
  directBookings: number;
  otaBookings: number;
}

/**
 * Merge BigQuery + API data into daily per-channel rows.
 * One ChannelMetrics row per (channel, date) — daily granularity preserved.
 * API overrides are applied per day; days without API data keep BigQuery
 * values, so no spend goes missing due to API lag.
 */
export function mergeSpendBookingsAndFunnel(
  spendRows: BigQuerySpendRow[],
  bookingRows: BigQueryBookingRow[],
  funnelRows: BigQueryConversionRow[],
  metaInsights: MetaInsightRow[] = [],
  googleInsights: GoogleInsightRow[] = [], // interim Google Ads connector (empty when unconfigured)
  pinterestInsights: PinterestInsightRow[] = [], // interim Pinterest connector (empty when unconfigured)
): ChannelMetrics[] {
  const byKey = new Map<string, DailyMetrics>();

  const getOrCreate = (channel: Channel, date: string): DailyMetrics => {
    const key = `${channel}|${date}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        channel,
        date,
        spend: 0,
        clicks: 0,
        impressions: 0,
        accountCreations: 0,
        checkoutStarted: 0,
        bookings: 0,
        gmv: 0,
        takeRateRevenue: 0,
        pointsUsed: 0,
        couponOff: 0,
        directBookings: 0,
        otaBookings: 0,
      });
    }
    return byKey.get(key)!;
  };

  // 1. BigQuery spend (daily, per platform)
  // Skip Meta from BigQuery — BQ aggregates ALL Meta ad accounts (incl. WanderOS).
  // Meta API is the sole source of truth for Meta spend (Kyle, Mar 19 2026).
  //
  // Also skip fixed-cost channels (mountain/influencer/…): their spend comes
  // ONLY from the fixed-costs config. In the tracker this happened implicitly —
  // fixed rows upsert-REPLACED the merged row on (channel,date) — which also
  // silently nuked those channels' BQ-attributed bookings (the likely cause of
  // "affiliate shows 0 bookings all 2026", CONTEXT §12 open item). Here we skip
  // only the SPEND and keep the rows additive, so fixed channels retain their
  // BQ bookings/funnel data while never double-counting spend.
  const fixedCostChannels = new Set<Channel>(
    Object.values(FIXED_COST_TO_CHANNEL),
  );
  for (const row of spendRows) {
    const channel = mapPlatformToChannel(row.platform);
    if (channel === "meta" || fixedCostChannels.has(channel)) continue;
    const date = normalizeDate(row.date);
    const agg = getOrCreate(channel, date);
    agg.spend += row.spend;
    agg.clicks += row.clicks;
    agg.impressions += row.impressions;
  }

  // 2. BigQuery bookings (daily, per channel)
  for (const row of bookingRows) {
    const channel = mapPartnerToChannel(row.channel);
    const date = normalizeDate(row.date);
    const agg = getOrCreate(channel, date);
    agg.bookings += row.bookings;
    agg.gmv += row.gmv;
    agg.takeRateRevenue += row.take_rate_revenue ?? 0;
    agg.pointsUsed += row.points_used ?? 0;
    agg.couponOff += row.coupon_off ?? 0;
    agg.directBookings += row.direct_bookings ?? 0;
    agg.otaBookings += row.ota_bookings ?? 0;
  }

  // 3. BigQuery funnel events (daily, per channel)
  for (const row of funnelRows) {
    const channel = mapPartnerToChannel(row.channel);
    const date = normalizeDate(row.date);
    const agg = getOrCreate(channel, date);
    if (row.event_type === "user_signed_up") {
      agg.accountCreations += row.count;
    } else if (row.event_type === "checkout_started") {
      agg.checkoutStarted += row.count;
    }
  }

  // 4. Meta API overrides — per day (28d_click + 1d_view). Only overrides days
  // where the API returned data; other days keep BigQuery values.
  const metaOverrideDates = new Set<string>();
  for (const meta of metaInsights) {
    const date = normalizeDate(meta.date);
    metaOverrideDates.add(date);
    const agg = getOrCreate("meta", date);
    agg.spend = meta.spend;
    agg.clicks = meta.clicks;
    agg.impressions = meta.impressions;
    agg.bookings = meta.totalBookings;
    if (meta.totalPurchaseValue > 0) {
      agg.gmv = meta.totalPurchaseValue;
    }
  }

  // 5. Google API overrides — per day (data-driven attribution). Empty until
  // the interim Google connector has creds — Google then stays on the
  // BigQuery baseline from step 1.
  const googleOverrideDates = new Set<string>();
  for (const google of googleInsights) {
    const date = normalizeDate(google.date);
    googleOverrideDates.add(date);
    const agg = getOrCreate("google", date);
    agg.spend = google.spend;
    agg.clicks = google.clicks;
    agg.impressions = google.impressions;
    agg.bookings = google.conversions;
    if (google.conversionsValue > 0) {
      agg.gmv = google.conversionsValue;
    }
  }

  // 6. Pinterest API overrides — per day (30d click + 30d view). Only
  // overrides spend/clicks/impressions; bookings stay on BigQuery unless the
  // checkout pixel reports conversions (tracker semantics).
  const pinterestOverrideDates = new Set<string>();
  for (const pinterest of pinterestInsights) {
    const date = normalizeDate(pinterest.date);
    pinterestOverrideDates.add(date);
    const agg = getOrCreate("pinterest", date);
    agg.spend = pinterest.spend;
    agg.clicks = pinterest.clicks;
    agg.impressions = pinterest.impressions;
    if (pinterest.conversions > 0) {
      agg.bookings = pinterest.conversions;
    }
    if (pinterest.conversionsValue > 0) {
      agg.gmv = pinterest.conversionsValue;
    }
  }

  // 7. Convert to ChannelMetrics[]
  const result: ChannelMetrics[] = [];
  for (const [, entry] of byKey) {
    const isMetaOverridden =
      entry.channel === "meta" && metaOverrideDates.has(entry.date);
    const isGoogleOverridden =
      entry.channel === "google" && googleOverrideDates.has(entry.date);
    const isPinterestOverridden =
      entry.channel === "pinterest" && pinterestOverrideDates.has(entry.date);

    const hierarchy = DATA_SOURCE_HIERARCHY[entry.channel];
    let dataSource: ChannelMetrics["dataSource"] = "bigquery";
    let attribution: ChannelMetrics["attribution"] = "last_click";
    if (isMetaOverridden && hierarchy?.dataSource === "meta_api") {
      dataSource = hierarchy.dataSource;
      attribution = hierarchy.attribution;
    } else if (isGoogleOverridden && hierarchy?.dataSource === "google_api") {
      dataSource = hierarchy.dataSource;
      attribution = hierarchy.attribution;
    } else if (
      isPinterestOverridden &&
      hierarchy?.dataSource === "pinterest_api"
    ) {
      dataSource = hierarchy.dataSource;
      attribution = hierarchy.attribution;
    } else if (hierarchy) {
      attribution = hierarchy.attribution;
    }

    result.push({
      channel: entry.channel,
      date: entry.date,
      spend: entry.spend,
      clicks: entry.clicks,
      impressions: entry.impressions,
      accountCreations: entry.accountCreations,
      checkoutPreviewed: null,
      checkoutStarted: entry.checkoutStarted,
      bookings: entry.bookings,
      gmv: entry.gmv,
      pointsUsed: entry.pointsUsed,
      couponOff: entry.couponOff,
      takeRateRevenue: entry.takeRateRevenue,
      directBookings: entry.directBookings,
      otaBookings: entry.otaBookings,
      cpac:
        entry.accountCreations > 0
          ? entry.spend / entry.accountCreations
          : null,
      cpcp: null,
      cpc:
        entry.checkoutStarted > 0 ? entry.spend / entry.checkoutStarted : null,
      cpb: entry.bookings > 0 ? entry.spend / entry.bookings : null,
      // ROAS = (GMV × 20% blended take rate) / spend (Kyle / data team, Mar 2026)
      roas:
        entry.spend > 0 ? (entry.gmv * BLENDED_TAKE_RATE) / entry.spend : null,
      dataSource,
      attribution,
      lastUpdated: new Date().toISOString(),
    });
  }

  return result.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return (b.spend ?? 0) - (a.spend ?? 0);
  });
}

// -----------------------------------------------------------------------------
// Fixed-cost daily rows (refresh/route.ts port — Decision #9j)
// -----------------------------------------------------------------------------

/**
 * Expand the effective-dated fixed-cost config into daily pro-rated rows for
 * the window. The IN-PROGRESS UTC day is written at $0 (not skipped) —
 * Decision #9j (Kyle, Jun 2 2026): a day's fixed cost only counts once that
 * UTC day has closed, aligning spend with UTC-keyed bookings.
 *
 * `todayUTC` is injectable for tests; defaults to the real current UTC day.
 */
export function buildFixedCostRows(
  startDate: string,
  endDate: string,
  todayUTC: string = new Date().toISOString().split("T")[0]!,
): ChannelMetrics[] {
  const rows: ChannelMetrics[] = [];
  const monthCache = new Map<
    string,
    ReturnType<typeof resolveFixedCostsForMonth>
  >();

  const cursor = new Date(`${startDate}T00:00:00Z`);
  const endD = new Date(`${endDate}T00:00:00Z`);

  while (cursor <= endD) {
    const date = cursor.toISOString().split("T")[0]!;
    const monthKey = date.slice(0, 7);
    const daysInMonth = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
    ).getUTCDate();

    let resolved = monthCache.get(monthKey);
    if (!resolved) {
      resolved = resolveFixedCostsForMonth(monthKey);
      monthCache.set(monthKey, resolved);
    }

    for (const fc of resolved) {
      const channel = FIXED_COST_TO_CHANNEL[fc.category];
      if (!channel) {
        console.warn(
          `[SpendTracker/FixedCosts] Unmapped category: ${fc.category} ($${fc.monthlyAmount}/mo) — skipping`,
        );
        continue;
      }
      const dailySpend = date >= todayUTC ? 0 : fc.monthlyAmount / daysInMonth;
      rows.push({
        channel,
        date,
        spend: dailySpend,
        clicks: null,
        impressions: null,
        accountCreations: null,
        checkoutPreviewed: null,
        checkoutStarted: null,
        bookings: null,
        gmv: null,
        pointsUsed: null,
        couponOff: null,
        takeRateRevenue: null,
        directBookings: null,
        otaBookings: null,
        dataSource: "fixed_cost",
        attribution: "last_click",
        lastUpdated: new Date().toISOString(),
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return rows;
}

// -----------------------------------------------------------------------------
// Demand-sales manual injection (replaces the Google Sheet sync)
// -----------------------------------------------------------------------------

/**
 * Overlay manually-reported demand-sales bookings + GMV onto the merged rows.
 * The config is monthly; the month's numbers are attached to the LAST day of
 * the month that falls inside the window (keeps daily rows sparse and sums
 * correct over any window fully containing the month). Spend is untouched —
 * demand-sales spend comes from fixed costs (BDR salaries).
 *
 * Mirrors the sheet-sync semantics: UPDATE bookings/GMV on demand_sales
 * without overwriting spend.
 */
export function applyDemandSalesManual(
  rows: ChannelMetrics[],
  startDate: string,
  endDate: string,
  manual: typeof DEMAND_SALES_MONTHLY = DEMAND_SALES_MONTHLY,
): ChannelMetrics[] {
  const out = [...rows];

  for (const m of manual) {
    const monthStart = `${m.month}-01`;
    const daysInMonth = new Date(
      Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7)), 0),
    ).getUTCDate();
    const monthEnd = `${m.month}-${String(daysInMonth).padStart(2, "0")}`;

    // Anchor date: last day of the month clamped into the window.
    if (monthEnd < startDate || monthStart > endDate) continue;
    const anchor = monthEnd <= endDate ? monthEnd : endDate;

    // Zero out BQ-attributed demand_sales bookings/gmv for the month (the
    // manual report supersedes them — same as the sheet being the source of
    // truth), then attach the manual totals to the anchor date.
    let anchorRow: ChannelMetrics | undefined;
    for (const row of out) {
      if (row.channel !== "demand_sales") continue;
      if (row.date < monthStart || row.date > monthEnd) continue;
      row.bookings = 0;
      row.gmv = 0;
      if (row.date === anchor) anchorRow = row;
    }

    if (!anchorRow) {
      anchorRow = {
        channel: "demand_sales",
        date: anchor,
        spend: 0,
        clicks: null,
        impressions: null,
        accountCreations: null,
        checkoutPreviewed: null,
        checkoutStarted: null,
        bookings: 0,
        gmv: 0,
        pointsUsed: null,
        couponOff: null,
        takeRateRevenue: null,
        directBookings: null,
        otaBookings: null,
        dataSource: "manual",
        attribution: "first_partner",
        lastUpdated: new Date().toISOString(),
      };
      out.push(anchorRow);
    }
    anchorRow.bookings = m.bookings;
    anchorRow.gmv = m.gmv;
  }

  return out;
}

// -----------------------------------------------------------------------------
// Pacing (pacing.ts — verbatim port)
// -----------------------------------------------------------------------------

export interface PacingAgg {
  spend: number;
  dataSource: string;
  /** Count of fixed-cost days with a non-zero slice (excludes the in-progress $0 day). */
  completedFixedDays: number;
  /** Spend on completed days only — dates < todayUTC. */
  spendThroughYesterday: number;
}

export interface PacingContext {
  currentDayOfMonth: number;
  calendarDaysInMonth: number;
}

/**
 * Project end-of-month off COMPLETED days only — never the in-progress day
 * (Decisions #9j/#9k/#9l). Fixed channels divide by completedFixedDays;
 * variable channels by (currentDayOfMonth − 1).
 */
export function computeChannelPacing(
  agg: PacingAgg,
  ctx: PacingContext,
): number | null {
  const num = agg.spendThroughYesterday;
  if (!(num > 0)) return null; // no completed-day spend → "—"
  const denom =
    agg.dataSource === "fixed_cost"
      ? agg.completedFixedDays
      : ctx.currentDayOfMonth - 1;
  return denom > 0 ? (num / denom) * ctx.calendarDaysInMonth : null;
}

// -----------------------------------------------------------------------------
// Data health (post-refresh.ts computeDataHealth — port)
// -----------------------------------------------------------------------------

export function computeDataHealth(
  rows: Array<{
    channel: string;
    date: string;
    bookings: number | null;
    dataSource: string;
  }>,
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): DataHealth {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const checkEnd =
    endDate > yesterday.toISOString().split("T")[0]!
      ? yesterday.toISOString().split("T")[0]!
      : endDate;

  // Date gaps
  const cachedDates = new Set(rows.map((s) => s.date));
  let gapsInRange = 0;
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const endCheck = new Date(`${checkEnd}T00:00:00Z`);
  while (cursor <= endCheck) {
    if (!cachedDates.has(cursor.toISOString().split("T")[0]!)) gapsInRange++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Other bucket
  let totalBookings = 0;
  let otherBookings = 0;
  for (const s of rows) {
    totalBookings += s.bookings ?? 0;
    if (s.channel === "other") otherBookings += s.bookings ?? 0;
  }
  const otherBucketPercent =
    totalBookings > 0 ? Math.round((otherBookings / totalBookings) * 100) : 0;

  // Meta API coverage (current month)
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const metaApiDays = rows.filter(
    (s) =>
      s.channel === "meta" &&
      s.dataSource === "meta_api" &&
      s.date >= currentMonthStart,
  ).length;
  const daysInMonth = Math.max(
    1,
    Math.floor(
      (new Date(endDate).getTime() - new Date(currentMonthStart).getTime()) /
        86400000,
    ) + 1,
  );
  const metaApiCoverage = Math.round((metaApiDays / daysInMonth) * 100);

  // Latest date
  const latestDate = rows.reduce((max, s) => (s.date > max ? s.date : max), "");
  const daysBehind = latestDate
    ? Math.floor((now.getTime() - new Date(latestDate).getTime()) / 86400000)
    : 999;

  let status: DataHealthStatus = "healthy";
  let message: string | null = null;

  if (gapsInRange > 0) {
    status = "incomplete";
    message = `${gapsInRange} missing day${gapsInRange > 1 ? "s" : ""} in date range`;
  } else if (daysBehind > 3) {
    status = "stale";
    message = `Data is ${daysBehind} days behind`;
  } else if (otherBucketPercent > 25) {
    status = "incomplete";
    message = `${otherBucketPercent}% of bookings unattributed`;
  }

  return { status, gapsInRange, otherBucketPercent, metaApiCoverage, message };
}
