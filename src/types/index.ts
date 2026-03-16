// =============================================================================
// src/types/index.ts — SINGLE SOURCE OF TRUTH FOR ALL TYPES
// =============================================================================

// -----------------------------------------------------------------------------
// Channel Types
// -----------------------------------------------------------------------------

export type Channel =
  | 'meta'
  | 'google'
  | 'pinterest'
  | 'tiktok'
  | 'microsoft'
  | 'criteo'
  | 'mountain'
  | 'influencer'
  | 'lifecycle'
  | 'demand_sales'
  | 'direct_mail'
  | 'affiliate'
  | 'seo'
  | 'organic'
  | 'airbnb'
  | 'vrbo'
  | 'booking'
  | 'amex'
  | 'other'

export type DataSourceType = 'bigquery' | 'meta_api' | 'google_api' | 'pinterest_api' | 'fixed_cost' | 'manual'

export type AttributionMethod =
  | 'first_partner'
  | 'view_click'
  | 'data_driven'
  | 'last_click'

// -----------------------------------------------------------------------------
// Channel Metrics
// -----------------------------------------------------------------------------

export interface ChannelMetrics {
  channel: Channel
  date: string // ISO date YYYY-MM-DD

  // Spend (from BigQuery marketing_adnetwork_daily_report)
  spend: number | null
  clicks: number | null
  impressions: number | null

  // Conversions (from BigQuery funnel_events)
  accountCreations: number | null
  checkoutPreviewed: number | null
  checkoutStarted: number | null
  bookings: number | null
  gmv: number | null

  // Cost breakdown (from bookings_reconciled_v2)
  pointsUsed: number | null   // Loyalty points redeemed
  couponOff: number | null     // Coupons/giveaways
  takeRateRevenue: number | null // booking_revenue_recognized (what Wander earns)
  directBookings: number | null  // is_direct_booking=TRUE
  otaBookings: number | null     // is_ota=TRUE

  // Efficiency (calculated — Dylan Wright methodology, March 2026)
  cpac?: number | null // all marketing spend / accountCreations
  cpcp?: number | null // spend / checkoutPreviewed
  cpc?: number | null  // spend / checkoutStarted
  cpb?: number | null  // all marketing spend / bookings
  roas?: number | null // take rate revenue / ad spend

  // Metadata
  dataSource: DataSourceType
  attribution: AttributionMethod
  lastUpdated: string // ISO timestamp
}

// -----------------------------------------------------------------------------
// Dashboard Summary
// -----------------------------------------------------------------------------

export interface DashboardSummary {
  period: {
    month: string // "January 2026"
    daysInMonth: number
    daysElapsed: number
    asOfDate: string // ISO date
  }

  totals: {
    adSpend: number // BigQuery ad spend only
    fixedCosts: number // Pro-rated fixed costs
    pointsUsed: number // Loyalty points redeemed (from bookings_reconciled_v2)
    couponOff: number // Coupons/giveaways (from bookings_reconciled_v2)
    totalMarketingSpend: number // adSpend + fixedCosts + pointsUsed + couponOff
    spend: number // Alias for totalMarketingSpend (backward compat)
    accountCreations: number
    checkoutPreviewed: number
    checkoutStarted: number
    bookings: number
    directBookings: number // is_direct_booking=TRUE from bookings_reconciled_v2
    otaBookings: number // is_ota=TRUE from bookings_reconciled_v2
    gmv: number // total_paid from bookings_reconciled_v2
    directGmv: number // GMV from non-OTA channels
    otaGmv: number // GMV from OTA channels
    takeRateRevenue: number // booking_revenue_recognized (what Wander earns)
  }

  efficiency: {
    cpac: number // All marketing spend / account creations
    cpb: number // Total CPB: all marketing spend / all bookings
    directCpb: number // DCPB: ad spend / direct bookings (primary metric)
    fullyLoadedCpb: number // All marketing spend / all bookings
    roas: number // Take rate revenue / ad spend
  }

  targets: {
    cpbTarget: number // $500
    bookingsTarget: number
  }

  channels: ChannelMetrics[]

  dataFreshness: {
    lastRefresh: string // ISO timestamp
    latestDataDate: string // YYYY-MM-DD — most recent date with data
    oldestData: string // ISO timestamp (data latency)
    nextScheduledRefresh: string
  }
}

// -----------------------------------------------------------------------------
// Insights
// -----------------------------------------------------------------------------

export type InsightType =
  | 'above_target'
  | 'below_target'
  | 'anomaly_high'
  | 'anomaly_low'
  | 'trend_improving'
  | 'trend_declining'
  | 'opportunity'

export type InsightSeverity =
  | 'action_needed'
  | 'opportunity'
  | 'monitor'
  | 'on_track'

export interface Insight {
  id: string
  type: InsightType
  severity: InsightSeverity
  channel: Channel | null // null = portfolio-wide
  title: string
  description: string
  metric: {
    name: string
    value: number
    comparison: number // target or benchmark
    delta: number // percent change
    direction: 'up' | 'down' | 'flat'
  }
  recommendation: string
  generatedAt: string
}

// -----------------------------------------------------------------------------
// Ask Claude
// -----------------------------------------------------------------------------

export interface AskClaudeMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface AskClaudeContext {
  summary: DashboardSummary
  channels: ChannelMetrics[]
  insights: Insight[]
  cpbTarget: number
  businessContext: string
  attributionNotes: string
}

export interface AskClaudeRequest {
  question: string
  conversationHistory: AskClaudeMessage[]
  context: AskClaudeContext
  days?: number // Selected date range (e.g. 30 for "Last 30 Days", 9999 for "All Time")
}

export interface AskClaudeResponse {
  answer: string
  suggestedFollowUps?: string[]
}

// -----------------------------------------------------------------------------
// Meta API Types
// -----------------------------------------------------------------------------

export interface MetaInsightRow {
  date: string              // YYYY-MM-DD
  spend: number
  clicks: number
  impressions: number
  bookings28dClick: number  // 28-day click attribution
  bookings1dView: number    // 1-day view attribution
  totalBookings: number     // 28d_click + 1d_view
  purchaseValue28dClick: number  // Purchase conversion value (28d click)
  purchaseValue1dView: number    // Purchase conversion value (1d view)
  totalPurchaseValue: number     // GMV from Meta's attribution
}

// -----------------------------------------------------------------------------
// Google Ads API Types
// -----------------------------------------------------------------------------

export interface GoogleInsightRow {
  date: string              // YYYY-MM-DD
  spend: number             // cost_micros / 1,000,000
  clicks: number
  impressions: number
  conversions: number       // data-driven attributed conversions (bookings)
  conversionsValue: number  // conversion value in dollars
}

// -----------------------------------------------------------------------------
// Sync Operations
// -----------------------------------------------------------------------------

export type SyncStatus = 'running' | 'success' | 'partial_failure' | 'failed'
export type SyncTrigger = 'scheduled' | 'manual' | 'api'

export interface SyncLog {
  id: string
  startedAt: string
  completedAt: string | null
  status: SyncStatus
  trigger: SyncTrigger
  results: {
    queriesAttempted: number
    queriesSucceeded: number
    queriesFailed: number
    rowsProcessed: number
  }
  duration: number // milliseconds
  error: string | null
}

// -----------------------------------------------------------------------------
// Fixed Costs (non-BigQuery spend)
// -----------------------------------------------------------------------------

export type FixedCostCategory =
  | 'tv_linear'
  | 'tv_streaming'
  | 'lifecycle'
  | 'demand_sales'
  | 'direct_mail'
  | 'affiliate'
  | 'seo'
  | 'events'
  | 'content'
  | 'other'

export interface FixedCost {
  id: string
  category: FixedCostCategory
  partner: string | null
  monthlyAmount: number
  updatedAt: string
  updatedBy: string | null
}

export const FIXED_COST_LABELS: Record<FixedCostCategory, string> = {
  tv_linear: 'TV (Linear)',
  tv_streaming: 'TV (Streaming)',
  lifecycle: 'Lifecycle (CIO)',
  demand_sales: 'Demand Sales (BDRs)',
  direct_mail: 'Direct Mail',
  affiliate: 'Affiliate',
  seo: 'SEO',
  events: 'Events',
  content: 'Content',
  other: 'Other',
}

// -----------------------------------------------------------------------------
// User
// -----------------------------------------------------------------------------

export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  lastLogin: string | null
  createdAt: string
}

// -----------------------------------------------------------------------------
// API Response Types
// -----------------------------------------------------------------------------

export interface ApiResponse<T> {
  data?: T
  error?: {
    code: string
    message: string
  }
}

export interface ApiError {
  code: string
  message: string
}

// -----------------------------------------------------------------------------
// Trend Data (for charts)
// -----------------------------------------------------------------------------

export interface TrendDataPoint {
  date: string
  total: number
  byChannel: Partial<Record<Channel, number>>
}

export interface TrendData {
  metric: string
  period: string
  series: TrendDataPoint[]
}

// -----------------------------------------------------------------------------
// Channel Display Configuration
// -----------------------------------------------------------------------------

export interface ChannelConfig {
  id: Channel
  name: string
  abbreviation: string
  color: string
  sourceLabel: string
  bigqueryPlatform: string | null
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const CPB_TARGET = 500
export const BLENDED_TAKE_RATE = 0.20 // 20% blended take rate (Kyle/Drayton, March 2026)

// Data Source Hierarchy — Platform APIs override BigQuery for channel performance.
// BigQuery uses last-touch attribution (bad for channel analysis). Platform APIs use
// their own attribution models (view-through, data-driven, etc.).
// Decision: Cam Aroz, March 12, 2026.
// See .claude/contracts/data-source-hierarchy.md for full rationale.
export const DATA_SOURCE_HIERARCHY: Record<string, {
  channel: Channel
  dataSource: DataSourceType
  attribution: AttributionMethod
}> = {
  meta: { channel: 'meta', dataSource: 'meta_api', attribution: 'view_click' },
  google: { channel: 'google', dataSource: 'google_api', attribution: 'data_driven' },
  pinterest: { channel: 'pinterest', dataSource: 'pinterest_api', attribution: 'view_click' },
}
export const ALLOWED_DOMAIN = 'wander.com'

// OTA channels (excluded from Direct CPB calculation)
export const OTA_CHANNELS: Channel[] = ['airbnb', 'vrbo', 'booking', 'amex']

// Channels excluded from CPB calculations (no marketing attribution)
export const CPB_EXCLUDED_CHANNELS: Channel[] = [
  'airbnb',   // OTA
  'vrbo',     // OTA
  'booking',  // OTA
  'amex',     // OTA (mybookingpal)
  'organic',  // No marketing spend
  'other',    // Catch-all, may include test bookings
]

// Channel configuration (used for display)
export const CHANNEL_CONFIG: Record<Channel, ChannelConfig> = {
  meta: { id: 'meta', name: 'Meta Ads', abbreviation: 'M', color: '#1877f2', sourceLabel: 'Paid Social', bigqueryPlatform: 'Meta' },
  google: { id: 'google', name: 'Google Ads', abbreviation: 'G', color: '#34a853', sourceLabel: 'Paid Search', bigqueryPlatform: 'Google' },
  pinterest: { id: 'pinterest', name: 'Pinterest Ads', abbreviation: 'P', color: '#e60023', sourceLabel: 'Paid Social', bigqueryPlatform: 'Pinterest' },
  tiktok: { id: 'tiktok', name: 'TikTok Ads', abbreviation: 'TT', color: '#000000', sourceLabel: 'Paid Social', bigqueryPlatform: 'TikTok' },
  microsoft: { id: 'microsoft', name: 'Microsoft/Bing', abbreviation: 'B', color: '#00897b', sourceLabel: 'Paid Search', bigqueryPlatform: 'Microsoft' },
  criteo: { id: 'criteo', name: 'Criteo', abbreviation: 'CR', color: '#f97316', sourceLabel: 'Display', bigqueryPlatform: 'Criteo' },
  mountain: { id: 'mountain', name: 'TV (CTV)', abbreviation: 'TV', color: '#8b5cf6', sourceLabel: 'CTV', bigqueryPlatform: 'Mountain' },
  influencer: { id: 'influencer', name: 'Influencer', abbreviation: 'INF', color: '#ec4899', sourceLabel: 'Attribution', bigqueryPlatform: 'Influencer' },
  lifecycle: { id: 'lifecycle', name: 'Lifecycle', abbreviation: 'CIO', color: '#10b981', sourceLabel: 'Fixed Cost', bigqueryPlatform: null },
  demand_sales: { id: 'demand_sales', name: 'Demand Sales', abbreviation: 'BDR', color: '#f59e0b', sourceLabel: 'Manual', bigqueryPlatform: null },
  direct_mail: { id: 'direct_mail', name: 'Direct Mail', abbreviation: 'DM', color: '#84cc16', sourceLabel: 'Manual', bigqueryPlatform: null },
  affiliate: { id: 'affiliate', name: 'Affiliate', abbreviation: 'AFF', color: '#6366f1', sourceLabel: 'Manual', bigqueryPlatform: null },
  seo: { id: 'seo', name: 'SEO', abbreviation: 'SEO', color: '#06b6d4', sourceLabel: 'Fixed Cost', bigqueryPlatform: null },
  organic: { id: 'organic', name: 'Organic/Referrals', abbreviation: 'ORG', color: '#a855f7', sourceLabel: 'Calculated', bigqueryPlatform: null },
  airbnb: { id: 'airbnb', name: 'Airbnb', abbreviation: 'ABB', color: '#f43f5e', sourceLabel: 'OTA', bigqueryPlatform: null },
  vrbo: { id: 'vrbo', name: 'Vrbo', abbreviation: 'VRB', color: '#3b82f6', sourceLabel: 'OTA', bigqueryPlatform: null },
  booking: { id: 'booking', name: 'Booking.com', abbreviation: 'BKG', color: '#1d4ed8', sourceLabel: 'OTA', bigqueryPlatform: null },
  amex: { id: 'amex', name: 'Amex (MyBookingPal)', abbreviation: 'AMX', color: '#006fcf', sourceLabel: 'OTA', bigqueryPlatform: null },
  other: { id: 'other', name: 'Other', abbreviation: 'OTH', color: '#64748b', sourceLabel: 'Various', bigqueryPlatform: null },
}

// Platform to channel mapping (for BigQuery data)
export const PLATFORM_TO_CHANNEL: Record<string, Channel> = {
  Meta: 'meta', Google: 'google', Pinterest: 'pinterest', TikTok: 'tiktok',
  Microsoft: 'microsoft', Criteo: 'criteo', Mountain: 'mountain', Influencer: 'influencer',
}

// UTM source to channel mapping (for attribution)
export const UTM_SOURCE_TO_CHANNEL: Record<string, Channel> = {
  facebook: 'meta', fb: 'meta', instagram: 'meta', ig: 'meta', meta: 'meta',
  google: 'google', pinterest: 'pinterest', tiktok: 'tiktok',
  bing: 'microsoft', microsoft: 'microsoft', criteo: 'criteo',
  mountain: 'mountain', tv: 'mountain', ctv: 'mountain',
  influencer: 'influencer', ambassador: 'influencer',
  customerio: 'lifecycle', cio: 'lifecycle', email: 'lifecycle',
}
