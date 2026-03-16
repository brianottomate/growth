# Type Registry

> NEVER create duplicate types. All types defined in `@/types/index.ts`.

## Channel Types

```typescript
type Channel = 'meta' | 'google' | 'pinterest' | 'tiktok' | 'microsoft' | 'criteo' | 'mountain' | 'influencer' | 'lifecycle' | 'demand_sales' | 'direct_mail' | 'affiliate' | 'seo' | 'organic' | 'other'

type DataSourceType = 'bigquery' | 'meta_api' | 'fixed_cost' | 'manual'

type AttributionMethod = 'first_partner' | 'view_click' | 'data_driven' | 'last_click'
```

## Core Interfaces

```typescript
interface ChannelMetrics { channel: Channel; date: string; spend: number | null; clicks: number | null; impressions: number | null; accountCreations: number | null; checkoutPreviewed: number | null; checkoutStarted: number | null; bookings: number | null; gmv: number | null; revenue?: number | null; cpac?: number | null; cpcp?: number | null; cpc?: number | null; cpb?: number | null; roas?: number | null; roi?: number | null; dataSource: DataSourceType; attribution: AttributionMethod; lastUpdated: string }

interface DashboardSummary { period: { month: string; daysInMonth: number; daysElapsed: number; asOfDate: string }; totals: { spend: number; accountCreations: number; checkoutPreviewed: number; checkoutStarted: number; bookings: number; gmv: number; revenue: number }; efficiency: { cpac: number; cpb: number; roas: number; roi: number }; targets: { cpbTarget: number; bookingsTarget: number; revenueTarget: number }; channels: ChannelMetrics[]; dataFreshness: { lastRefresh: string; oldestData: string; nextScheduledRefresh: string } }

interface Insight { id: string; type: InsightType; severity: InsightSeverity; channel: Channel | null; title: string; description: string; metric: { name: string; value: number; comparison: number; delta: number; direction: 'up' | 'down' | 'flat' }; recommendation: string; generatedAt: string }

interface User { id: string; email: string; name: string | null; avatarUrl: string | null; lastLogin: string | null; createdAt: string }
```

## Meta API Types

```typescript
interface MetaInsightRow { date: string; spend: number; clicks: number; impressions: number; bookings28dClick: number; bookings1dView: number; totalBookings: number }

type AttributionWindow = '7d_click' | '1d_view' | '28d_click'
```

## API Types

```typescript
interface ApiResponse<T> { data?: T; error?: { code: string; message: string } }
interface ApiError { code: string; message: string }
```

## Utility Types (from metrics.ts)

```typescript
interface RawMetrics { spend: number | null; accountCreations: number | null; checkoutPreviewed: number | null; checkoutStarted: number | null; bookings: number | null; gmv: number | null }

interface CalculatedMetrics { revenue: number | null; cpac: number | null; cpcp: number | null; cpc: number | null; cpb: number | null; roas: number | null; roi: number | null }
```

## Settings Types (from @/types/settings)

```typescript
type DateRangeOption = '7' | '14' | '30' | '60' | '90'
type RefreshIntervalOption = '15' | '30' | '60' | '240' | 'never'

interface UserSettings {
  userId: string
  emailInsightsDigest: boolean
  emailCpbAlert: boolean
  defaultDateRange: DateRangeOption
  autoRefreshInterval: RefreshIntervalOption
  updatedAt: string
}
```

## Theme Types (from @/providers/ThemeProvider)

```typescript
type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}
```

---

**How to Update:** Types are defined ONCE in Prompt 01. Do not add new types here — only reference existing ones.
