/**
 * Spend Tracker — methodology constants, channel taxonomy, and manual config.
 *
 * Ported (near-verbatim) from Brian Sun's wander-growth-tracker
 * (`src/types/index.ts` + Supabase `fixed_costs` migrations 004→014).
 * The methodology decisions behind every constant are documented in
 * `../brian/wander-growth-tracker/docs/GROWTH_TRACKER_CONTEXT.md` §12
 * ("locked decisions") — do NOT change values here casually; a subtle change
 * silently changes a number leadership reads daily.
 *
 * Two blocks below are MANUAL CONFIG, updated by editing this file
 * (Claude Code → commit → deploy; git is the audit log):
 *   - FIXED_COSTS         (effective-dated monthly amounts per category)
 *   - DEMAND_SALES_MONTHLY (bookings + GMV reported by the demand-sales team;
 *                           replaces Serrelle's Google Sheet — no more sheets)
 *
 * ─── FUTURE: config → Neon (jotted 2026-07-10, not built) ───────────────────
 * If manual entry ever moves to a form (a `manual_channel_metric`-style table
 * + admin form on /app/spend), migrate ONLY the operational data:
 *   - DEMAND_SALES_MONTHLY → `manual_channel_metric` (channel, month,
 *     bookings, gmv, note, enteredBy) — lets Serrelle self-serve monthly.
 *   - FIXED_COSTS → `fixed_cost` table (same effective-dated resolver
 *     semantics; port resolveFixedCostsForMonth as a query) — lets Kyle edit
 *     without a deploy. Beware the tracker's lesson: its Settings-UI edits
 *     bypassed migrations and made history unauditable — keep an
 *     updatedBy/note column and never allow editing past months in place.
 *   - Precedent: the ad-account allowlist already lives in Neon
 *     (`ad_account`, db/ad-account-schema.ts) because it's shared config
 *     enforced across services.
 * KEEP IN CODE regardless: methodology constants (CPB_TARGET,
 * BLENDED_TAKE_RATE, OTA/ACTIVE channel sets, NON_MARKETPLACE_CAMPAIGN_PATTERN,
 * DATA_SOURCE_HIERARCHY, META_AD_ACCOUNT_ID) — these are locked DECISIONS, not
 * data; changing them should require code review, tests, and a git trail.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// -----------------------------------------------------------------------------
// Channel taxonomy
// -----------------------------------------------------------------------------

export type Channel =
  | "meta"
  | "google"
  | "pinterest"
  | "tiktok"
  | "microsoft"
  | "criteo"
  | "mountain"
  | "influencer"
  | "content"
  | "lifecycle"
  | "demand_sales"
  | "direct_mail"
  | "affiliate"
  | "seo"
  | "organic"
  | "airbnb"
  | "vrbo"
  | "booking"
  | "amex"
  | "other";

export type DataSourceType =
  | "bigquery"
  | "meta_api"
  | "google_api"
  | "pinterest_api"
  | "fixed_cost"
  | "manual";

export type AttributionMethod =
  | "first_partner"
  | "view_click"
  | "data_driven"
  | "last_click";

// -----------------------------------------------------------------------------
// Methodology constants (locked decisions)
// -----------------------------------------------------------------------------

/** DCPB target — Decision #5. */
export const CPB_TARGET = 500;

/** 20% blended take rate (Kyle / Wander data team, March 2026 — Decision #4). */
export const BLENDED_TAKE_RATE = 0.2;

/**
 * The tracker's Meta ad account. The account is SHARED with WanderOS/Listed/
 * Supply/Sites/Homi at the Zernio-connection level — Meta numbers must always
 * be scoped to this single account (probe 2026-07-10: unscoped spend runs ~2×).
 */
export const META_AD_ACCOUNT_ID = "act_885632589057558";

/**
 * Data Source Hierarchy — platform APIs override BigQuery for channel
 * performance (BQ last-touch misses view-through/multi-touch). Decision #6,
 * Cam Aroz 2026-03-12.
 *
 * Google/Pinterest overrides run through the INTERIM connectors in
 * `connectors/` (Zernio-shaped, ported from Brian's tracker) and are no-ops
 * until their env creds are set — see connectors/README.md. Unconfigured,
 * Google falls back to BQ `marketing_adnetwork_daily_report` spend +
 * last-touch bookings; Pinterest is dormant ($0/30d as of Jul 2026).
 * Delete the connectors when Zernio has these platforms connected.
 */
export const DATA_SOURCE_HIERARCHY: Partial<
  Record<
    Channel,
    { channel: Channel; dataSource: DataSourceType; attribution: AttributionMethod }
  >
> = {
  meta: { channel: "meta", dataSource: "meta_api", attribution: "view_click" },
  google: { channel: "google", dataSource: "google_api", attribution: "data_driven" },
  pinterest: { channel: "pinterest", dataSource: "pinterest_api", attribution: "view_click" },
};

/** OTA channels — excluded from Direct CPB. mybookingpal = Amex, NOT Booking.com. */
export const OTA_CHANNELS: Channel[] = ["airbnb", "vrbo", "booking", "amex"];

/** Channels excluded from the direct-booking count (OTAs only — Kyle, Mar 5 2026). */
export const CPB_EXCLUDED_CHANNELS: Channel[] = ["airbnb", "vrbo", "booking", "amex"];

/**
 * Marketplace-only ad-spend filter (Decision #9m, Kyle/Brooke, Jun 2026).
 * The Meta ad account is shared with WanderOS lead-form + Listed test
 * campaigns which must NOT count toward Marketplace CPB. Denylist (not
 * allowlist): a mis-named new OS/Listed campaign over-counts spend
 * (pessimistic CPB — caught on review); an allowlist miss would under-count
 * (optimistic — unsafe vs the $500 target). Excluded campaigns are logged at
 * ingest so naming drift is auditable.
 */
export const NON_MARKETPLACE_CAMPAIGN_PATTERN = /wanderos|listed/i;

export function isMarketplaceCampaign(name: string | null | undefined): boolean {
  if (!name) return true; // unnamed → keep (fail toward counting — pessimistic)
  return !NON_MARKETPLACE_CAMPAIGN_PATTERN.test(name);
}

/** Active channels — Kyle's universe (Mar 19 2026; `content` added May 16 2026). */
export const ACTIVE_CHANNELS: Channel[] = [
  "meta",
  "google",
  "pinterest",
  "mountain",
  "influencer",
  "content",
  "demand_sales",
  "direct_mail",
  "affiliate",
  "seo",
];

/** Map fixed-cost categories to channel IDs. */
export const FIXED_COST_TO_CHANNEL: Record<string, Channel> = {
  tv_linear: "mountain", // Comcast → TV
  content: "content", // Amortized content production (Brian, May 16 2026)
  influencer: "influencer", // Influencer Program (Lefty retired Aug 2026)
  demand_sales: "demand_sales",
  direct_mail: "direct_mail",
  affiliate: "affiliate",
  seo: "seo",
};

// -----------------------------------------------------------------------------
// Channel display config
// -----------------------------------------------------------------------------

export interface ChannelConfig {
  id: Channel;
  name: string;
  abbreviation: string;
  color: string;
  sourceLabel: string;
}

export const CHANNEL_CONFIG: Record<Channel, ChannelConfig> = {
  meta: { id: "meta", name: "Meta Ads", abbreviation: "M", color: "#1877f2", sourceLabel: "Paid Social" },
  google: { id: "google", name: "Google Ads", abbreviation: "G", color: "#34a853", sourceLabel: "Paid Search" },
  pinterest: { id: "pinterest", name: "Pinterest Ads", abbreviation: "P", color: "#e60023", sourceLabel: "Paid Social" },
  tiktok: { id: "tiktok", name: "TikTok Ads", abbreviation: "TT", color: "#000000", sourceLabel: "Paid Social" },
  microsoft: { id: "microsoft", name: "Microsoft/Bing", abbreviation: "B", color: "#00897b", sourceLabel: "Paid Search" },
  criteo: { id: "criteo", name: "Criteo", abbreviation: "CR", color: "#f97316", sourceLabel: "Display" },
  mountain: { id: "mountain", name: "Comcast + Ad IDs", abbreviation: "TV", color: "#8b5cf6", sourceLabel: "Fixed Cost" },
  influencer: { id: "influencer", name: "Influencers", abbreviation: "INF", color: "#ec4899", sourceLabel: "Fixed Cost" },
  content: { id: "content", name: "Amortized Content", abbreviation: "CNT", color: "#d946ef", sourceLabel: "Fixed Cost" },
  lifecycle: { id: "lifecycle", name: "Lifecycle", abbreviation: "CIO", color: "#10b981", sourceLabel: "Fixed Cost" },
  demand_sales: { id: "demand_sales", name: "Demand Sales + OpenPhone", abbreviation: "BDR", color: "#f59e0b", sourceLabel: "Fixed Cost" },
  direct_mail: { id: "direct_mail", name: "Direct Mail", abbreviation: "DM", color: "#84cc16", sourceLabel: "Fixed Cost" },
  affiliate: { id: "affiliate", name: "Affiliate", abbreviation: "AFF", color: "#6366f1", sourceLabel: "Fixed Cost" },
  seo: { id: "seo", name: "SEO", abbreviation: "SEO", color: "#06b6d4", sourceLabel: "Fixed Cost" },
  organic: { id: "organic", name: "Organic/Referrals", abbreviation: "ORG", color: "#a855f7", sourceLabel: "Calculated" },
  airbnb: { id: "airbnb", name: "Airbnb", abbreviation: "ABB", color: "#f43f5e", sourceLabel: "OTA" },
  vrbo: { id: "vrbo", name: "Vrbo", abbreviation: "VRB", color: "#3b82f6", sourceLabel: "OTA" },
  booking: { id: "booking", name: "Booking.com", abbreviation: "BKG", color: "#1d4ed8", sourceLabel: "OTA" },
  amex: { id: "amex", name: "Amex (MyBookingPal)", abbreviation: "AMX", color: "#006fcf", sourceLabel: "OTA" },
  other: { id: "other", name: "Other", abbreviation: "OTH", color: "#64748b", sourceLabel: "Various" },
};

// -----------------------------------------------------------------------------
// Fixed costs — MANUAL CONFIG (effective-dated)
// -----------------------------------------------------------------------------

export type FixedCostCategory =
  | "tv_linear"
  | "tv_streaming"
  | "lifecycle"
  | "demand_sales"
  | "direct_mail"
  | "affiliate"
  | "seo"
  | "events"
  | "content"
  | "influencer"
  | "other";

export interface FixedCostEntry {
  category: FixedCostCategory;
  partner: string | null;
  /** Monthly amount in USD. */
  monthlyAmount: number;
  /** First month this amount applies, YYYY-MM. Latest entry ≤ target month wins and carries forward. */
  effectiveMonth: string;
  note?: string;
}

/**
 * Effective-dated monthly fixed costs. History from the tracker's Supabase
 * migrations 004→014; source citations in each note. To change a cost going
 * forward, ADD a new row with the new effectiveMonth — don't edit history.
 */
export const FIXED_COSTS: FixedCostEntry[] = [
  // ---- Seeds (migration 004, effective 2025-01) ----
  { category: "tv_linear", partner: "Comcast", monthlyAmount: 10_581, effectiveMonth: "2025-01" },
  { category: "lifecycle", partner: "Customer.io", monthlyAmount: 13_500, effectiveMonth: "2025-01" },
  { category: "demand_sales", partner: "BDRs (4)", monthlyAmount: 36_842, effectiveMonth: "2025-01" },
  { category: "direct_mail", partner: "PebblePost", monthlyAmount: 17_134, effectiveMonth: "2025-01" },
  { category: "affiliate", partner: "Acceleration Partners", monthlyAmount: 8_797, effectiveMonth: "2025-01" },
  { category: "seo", partner: "Digitaloft", monthlyAmount: 27_871, effectiveMonth: "2025-01" },

  // ---- May 2026 overrides (Kyle, Decision #9a + migrations 010-013) ----
  { category: "direct_mail", partner: "PebblePost", monthlyAmount: 0, effectiveMonth: "2026-05", note: "Kyle override May 4 2026" },
  { category: "affiliate", partner: "Acceleration Partners", monthlyAmount: 10_000, effectiveMonth: "2026-05", note: "Decision #9a / CONTEXT §4d — was a Settings-UI edit in the tracker's Supabase, never migrated; caught reconciling against the methodology page 2026-07-10" },
  { category: "seo", partner: "Digitaloft", monthlyAmount: 10_000, effectiveMonth: "2026-05", note: "Kyle: dropped from $20K, May 4 2026" },
  { category: "demand_sales", partner: "BDRs (4) + OpenPhone", monthlyAmount: 35_784, effectiveMonth: "2026-05", note: "migration 011" },
  { category: "tv_linear", partner: "Comcast + Ad IDs", monthlyAmount: 12_900, effectiveMonth: "2026-05", note: "migration 012; Kyle picked $12.5-12.9K range May 15 2026" },
  { category: "content", partner: "Amortized Content", monthlyAmount: 6_021, effectiveMonth: "2026-05", note: "migration 013 — split from influencer" },
  { category: "influencer", partner: "Lefty", monthlyAmount: 1_000, effectiveMonth: "2026-05", note: "migration 013; Lefty cancels Jul 2026" },

  // ---- June 2026 (migration 014) ----
  { category: "seo", partner: "Digitaloft", monthlyAmount: 0, effectiveMonth: "2026-06", note: "SEO cut from June onward (Decision #9i)" },

  // ---- August 2026 (migration 013 + Kyle Slack 2026-07-23) ----
  { category: "influencer", partner: null, monthlyAmount: 0, effectiveMonth: "2026-08", note: "Lefty ($1,000/mo) cancelled — no active influencer retainer. Kyle 2026-07-23, reconfirmed by Kyle in #marketing-leads 2026-08-03" },
  { category: "affiliate", partner: null, monthlyAmount: 0, effectiveMonth: "2026-08", note: "Acceleration Partners retainer ended — AP handed the Impact.com program back to Wander 8/1/26 (docs/affiliate-program-takeover.md), so there is no agency line item left to precommit. Kyle 2026-07-23, reconfirmed in #marketing-leads 2026-08-03. NB: Kyle quoted the old amount as $6,500/mo; this config carried $10,000 from 2026-05 (Decision #9a reconciliation) — discrepancy flagged, moot from August" },
  { category: "tv_linear", partner: "Comcast + Ad IDs", monthlyAmount: 0, effectiveMonth: "2026-08", note: "Kyle Slack 2026-07-23: Comcast paused while improving the marketplace" },
];

/**
 * Resolve the applicable fixed costs for a month (YYYY-MM): per category,
 * the row with the latest effectiveMonth ≤ target wins and carries forward
 * until overridden. Port of the tracker's `resolveFixedCostsForMonth`
 * (src/lib/fixed-costs/resolve.ts / migration 010's DISTINCT ON query).
 */
export function resolveFixedCostsForMonth(month: string): FixedCostEntry[] {
  const applicable = FIXED_COSTS.filter((fc) => fc.effectiveMonth <= month);
  // Sort category asc, effectiveMonth DESC — first row per category wins.
  applicable.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      b.effectiveMonth.localeCompare(a.effectiveMonth),
  );
  const seen = new Set<FixedCostCategory>();
  const resolved: FixedCostEntry[] = [];
  for (const fc of applicable) {
    if (seen.has(fc.category)) continue;
    seen.add(fc.category);
    resolved.push(fc);
  }
  return resolved;
}

// -----------------------------------------------------------------------------
// Demand-sales manual numbers — MANUAL CONFIG (replaces Serrelle's Google Sheet)
// -----------------------------------------------------------------------------

export interface DemandSalesMonth {
  /** YYYY-MM */
  month: string;
  bookings: number;
  gmv: number;
  note?: string;
}

/**
 * Demand-sales bookings + GMV, reported monthly by the demand-sales team and
 * entered here directly (no more Google Sheets — Kristian, 2026-07-10).
 * Spend for the demand_sales channel comes from FIXED_COSTS (BDR salaries),
 * never from here. Months absent from this list simply show BQ-attributed
 * demand-sales numbers (usually near zero — BDR attribution is manual).
 */
export const DEMAND_SALES_MONTHLY: DemandSalesMonth[] = [
  // 2026 actuals seeded from Serrelle's "Source of Truth" tab (Demand Sales
  // sheet, GMV row), downloaded 2026-07-10. Going forward the demand-sales
  // team reports here directly.
  { month: "2026-01", bookings: 109, gmv: 740_368.84 },
  { month: "2026-02", bookings: 91, gmv: 582_306.3 },
  { month: "2026-03", bookings: 73, gmv: 514_054.6 },
  { month: "2026-04", bookings: 74, gmv: 515_437.31 },
  { month: "2026-05", bookings: 57, gmv: 559_801.51 },
  { month: "2026-06", bookings: 41, gmv: 315_875.8 },
  { month: "2026-07", bookings: 19, gmv: 194_945.71, note: "partial — as of 2026-07-10 download" },
];

// -----------------------------------------------------------------------------
// Row / summary types (ported subset of tracker src/types/index.ts)
// -----------------------------------------------------------------------------

export interface ChannelMetrics {
  channel: Channel;
  date: string;
  spend: number | null;
  clicks: number | null;
  impressions: number | null;
  accountCreations: number | null;
  checkoutPreviewed: number | null;
  checkoutStarted: number | null;
  bookings: number | null;
  gmv: number | null;
  pointsUsed: number | null;
  couponOff: number | null;
  takeRateRevenue: number | null;
  directBookings: number | null;
  otaBookings: number | null;
  cpac?: number | null;
  cpcp?: number | null;
  cpc?: number | null;
  cpb?: number | null;
  roas?: number | null;
  pacing?: number | null;
  gmvPacing?: number | null;
  dataSource: DataSourceType;
  attribution: AttributionMethod;
  lastUpdated: string;
}

export type DataHealthStatus = "healthy" | "stale" | "incomplete";

export interface DataHealth {
  status: DataHealthStatus;
  gapsInRange: number;
  otherBucketPercent: number;
  metaApiCoverage: number;
  message: string | null;
}

export interface DashboardTotals {
  adSpend: number;
  fixedCosts: number;
  pointsUsed: number;
  couponOff: number;
  totalMarketingSpend: number;
  spend: number;
  accountCreations: number;
  checkoutPreviewed: number;
  checkoutStarted: number;
  bookings: number;
  directBookings: number;
  otaBookings: number;
  wanderDirectBookings: number;
  manualBookings: number;
  gmv: number;
  directGmv: number;
  otaGmv: number;
  takeRateRevenue: number;
}

export interface DashboardEfficiency {
  cpac: number;
  cpb: number;
  directCpb: number;
  fullyLoadedCpb: number;
  roas: number;
  netTakeRate: number;
}

export interface NorthStarSummary {
  grossTake: number;
  netTake: number;
  directGmv: number;
  totalGmv: number;
  netTakeRate: number;
  takeRate: number;
  totalMarketingSpend: number;
  directConfirmedBookings: number;
  engagedSessions: number;
  /**
   * Net take over the SETTLED part of the window only (both gross take and
   * spend clipped to `through`). The dbt gross_take restates upward for
   * several days (recognition backfill — Jul 1-6 2026 restated +57% in 4
   * days), so recent-day net take always reads low at first; this variant is
   * apples-to-apples. Null when the window has no settled days.
   */
  settled: { through: string; grossTake: number; spend: number; netTake: number } | null;
}

export interface DashboardSummary {
  period: {
    month: string;
    daysInMonth: number;
    daysElapsed: number;
    asOfDate: string;
  };
  totals: DashboardTotals;
  efficiency: DashboardEfficiency;
  targets: { cpbTarget: number; bookingsTarget: number };
  channels: ChannelMetrics[];
  northStar?: NorthStarSummary | null;
  dataFreshness: {
    lastRefresh: string;
    latestDataDate: string;
    oldestData: string;
  };
  dataHealth: DataHealth;
}

/** Per-day Meta insight row (28d_click + 1d_view, marketplace-filtered). */
export interface MetaInsightRow {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  bookings28dClick: number;
  bookings1dView: number;
  totalBookings: number;
  purchaseValue28dClick: number;
  purchaseValue1dView: number;
  totalPurchaseValue: number;
}

/** Per-day Google override row (data-driven attribution, marketplace-filtered). */
export interface GoogleInsightRow {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionsValue: number;
}

/** Per-day Pinterest override row (30d click + 30d view). */
export interface PinterestInsightRow {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionsValue: number;
}

/**
 * Flat serializable daily-spend row — the Option-C write-back shape for
 * BQ `analytics.growth_tracker_daily_spend` (dbt north-star spend CTE).
 */
export interface DailyChannelRow {
  date: string;
  channel: Channel;
  spend: number;
  dataSource: DataSourceType;
  attribution: AttributionMethod;
}
