# Import Registry

> NEVER guess at paths. If it's not here, it doesn't exist yet.

## Types

| Export | Path | Notes |
|--------|------|-------|
| `Channel` | `@/types` | Channel type union |
| `ChannelMetrics` | `@/types` | Metrics interface |
| `DashboardSummary` | `@/types` | Dashboard data |
| `Insight` | `@/types` | Insight interface |
| `InsightType` | `@/types` | Insight type union |
| `InsightSeverity` | `@/types` | Severity union |
| `AskClaudeMessage` | `@/types` | Chat message |
| `AskClaudeContext` | `@/types` | Claude context |
| `AskClaudeRequest` | `@/types` | Request interface |
| `AskClaudeResponse` | `@/types` | Response interface |
| `SyncLog` | `@/types` | Sync log interface |
| `SyncStatus` | `@/types` | Status union |
| `SyncTrigger` | `@/types` | Trigger union |
| `User` | `@/types` | User interface |
| `ApiResponse` | `@/types` | Generic API response |
| `ApiError` | `@/types` | Error interface |
| `TrendDataPoint` | `@/types` | Chart data point |
| `TrendData` | `@/types` | Chart data |
| `ChannelConfig` | `@/types` | Channel display config |
| `DataSourceType` | `@/types` | Data source union |
| `AttributionMethod` | `@/types` | Attribution union |
| `REVENUE_TAKE_RATE` | `@/types` | 0.26 constant |
| `CPB_TARGET` | `@/types` | 600 constant |
| `ALLOWED_DOMAIN` | `@/types` | 'wander.com' constant |
| `CHANNEL_CONFIG` | `@/types` | Channel config map |
| `PLATFORM_TO_CHANNEL` | `@/types` | BigQuery mapping |
| `UTM_SOURCE_TO_CHANNEL` | `@/types` | UTM mapping |

## Utils

| Export | Path | Notes |
|--------|------|-------|
| `cn` | `@/lib/utils` | Class merger |
| `safeDiv` | `@/lib/utils` | Safe division |
| `calculateMetrics` | `@/lib/utils` | Metric calculator |
| `RawMetrics` | `@/lib/utils` | Input type for calculateMetrics |
| `CalculatedMetrics` | `@/lib/utils` | Output type for calculateMetrics |
| `formatCurrency` | `@/lib/utils` | Currency formatting |
| `formatNumber` | `@/lib/utils` | Number formatting |
| `formatPercent` | `@/lib/utils` | Percent formatting |
| `formatMultiplier` | `@/lib/utils` | Multiplier formatting |
| `formatDate` | `@/lib/utils` | Date formatting |
| `getMockDashboardData` | `@/lib/mock-data` | Mock data generator |
| `getMockChannelMetrics` | `@/lib/mock-data` | Mock channel metrics |
| `CHANNEL_DISPLAY_CONFIG` | `@/lib/channel-config` | Channel display configuration |
| `getChannelConfig` | `@/lib/channel-config` | Get config for channel |
| `getAllChannels` | `@/lib/channel-config` | Get all channel IDs |
| `generateInsights` | `@/lib/insights` | Generate insights from metrics |
| `countInsightsBySeverity` | `@/lib/insights` | Count insights by severity |
| `CHANNEL_CHART_COLORS` | `@/lib/chart-config` | Hex colors for charts |
| `TOP_CHART_CHANNELS` | `@/lib/chart-config` | Top 5 channels to display |
| `CHART_THEME` | `@/lib/chart-config` | Dark theme chart colors |
| `getChannelChartColor` | `@/lib/chart-config` | Get hex color for channel |
| `generateMockTrendData` | `@/lib/mock-trends` | Mock trend generator |
| `formatChartDate` | `@/lib/mock-trends` | Format date for chart |
| `getMockDashboardSummary` | `@/lib/mock-data` | Summary for AI context |
| `getAnthropicClient` | `@/lib/anthropic/client` | Anthropic SDK client |
| `ANTHROPIC_CONFIG` | `@/lib/anthropic/client` | Model configuration |
| `buildSystemPrompt` | `@/lib/anthropic/prompts` | System prompt builder |
| `generateFollowUpSuggestions` | `@/lib/anthropic/prompts` | Follow-up generator |
| `buildContextString` | `@/lib/anthropic/context` | Context formatter |
| `formatSummaryForPrompt` | `@/lib/anthropic/context` | Summary formatter |
| `formatChannelsForPrompt` | `@/lib/anthropic/context` | Channel formatter |
| `formatInsightsForPrompt` | `@/lib/anthropic/context` | Insights formatter |
| `getBigQueryClient` | `@/lib/bigquery/client` | BigQuery client |
| `getBigQueryConfig` | `@/lib/bigquery/client` | Config getter |
| `isBigQueryEnabled` | `@/lib/bigquery/client` | Feature flag check |
| `fetchSpendData` | `@/lib/bigquery/queries` | Spend query |
| `fetchConversionData` | `@/lib/bigquery/queries` | Conversion query |
| `mergeSpendAndConversions` | `@/lib/bigquery/mapper` | Data merger |
| `mapPlatformToChannel` | `@/lib/bigquery/mapper` | Platform mapping |
| `mapUtmSourceToChannel` | `@/lib/bigquery/mapper` | UTM mapping |
| `getCachedMetrics` | `@/lib/bigquery/cache` | Cache getter |
| `cacheMetrics` | `@/lib/bigquery/cache` | Cache setter |
| `invalidateCache` | `@/lib/bigquery/cache` | Cache invalidator |

## Meta API

| Export | Path | Notes |
|--------|------|-------|
| `initializeMetaAPI` | `@/lib/meta/client` | Initialize Meta SDK (call once) |
| `isMetaEnabled` | `@/lib/meta/client` | Check if env vars are configured |
| `getMetaAdAccount` | `@/lib/meta/client` | Get AdAccount instance |
| `fetchMetaInsights` | `@/lib/meta/queries` | Fetch daily insights for date range |
| `aggregateMetaInsights` | `@/lib/meta/queries` | Aggregate daily rows into single summary |
| `getBookingsFromActions` | `@/lib/meta/bookings` | Extract bookings from actions array |
| `getTotalBookingsWithAttribution` | `@/lib/meta/bookings` | Sum 28d_click + 1d_view |
| `STANDARD_ATTRIBUTION_WINDOWS` | `@/lib/meta/bookings` | ['7d_click', '1d_view', '28d_click'] |
| `retryMetaAPICall` | `@/lib/meta/retry` | Retry with exponential backoff |
| `withRateLimit` | `@/lib/meta/retry` | Rate-limited execution wrapper |
| `RateLimiter` | `@/lib/meta/retry` | Rate limiter class (200/hr) |

## Auth Utils

| Export | Path | Notes |
|--------|------|-------|
| `validateWanderEmail` | `@/lib/auth` | Domain validation |
| `getAuthUser` | `@/lib/auth` | Get Supabase Auth user |
| `getUserProfile` | `@/lib/auth` | Get user from users table |
| `createUserProfile` | `@/lib/auth` | Create user on first sign-in |
| `updateLastLogin` | `@/lib/auth` | Update user's last_login |
| `userProfileExists` | `@/lib/auth` | Check if user exists |

## Components

| Export | Path | Notes |
|--------|------|-------|
| `AuthProvider` | `@/components/auth/AuthProvider` | Auth context provider |
| `useAuth` | `@/components/auth/AuthProvider` | Auth context hook |
| `MagicLinkForm` | `@/components/auth/MagicLinkForm` | DORMANT — not used, replaced by PasswordLoginForm |
| `PasswordLoginForm` | `@/components/auth/PasswordLoginForm` | Email + password login with auto-signup |
| `SignOutButton` | `@/components/auth/SignOutButton` | Sign out button |
| `Sidebar` | `@/components/layout/Sidebar` | Icon-only sidebar |
| `SidebarIcon` | `@/components/layout/SidebarIcon` | Icon with tooltip |
| `Header` | `@/components/layout/Header` | Top header with greeting |
| `UserMenu` | `@/components/layout/UserMenu` | Avatar dropdown |
| `MobileNav` | `@/components/layout/MobileNav` | Mobile drawer navigation |
| `KPICard` | `@/components/dashboard/KPICard` | Single KPI card |
| `KPIGrid` | `@/components/dashboard/KPIGrid` | Grid of KPI cards |
| `KPISkeleton` | `@/components/dashboard/KPISkeleton` | Loading skeleton |
| `ChannelTable` | `@/components/dashboard/ChannelTable` | Main table component |
| `ChannelRow` | `@/components/dashboard/ChannelRow` | Individual channel row |
| `ChannelAvatar` | `@/components/dashboard/ChannelAvatar` | Colored badge |
| `StatusDot` | `@/components/dashboard/StatusDot` | CPB status indicator |
| `ChannelTableSkeleton` | `@/components/dashboard/ChannelTableSkeleton` | Loading skeleton |
| `InsightsPanel` | `@/components/dashboard/InsightsPanel` | Main insights container |
| `InsightCard` | `@/components/dashboard/InsightCard` | Individual insight |
| `InsightsSkeleton` | `@/components/dashboard/InsightsSkeleton` | Loading skeleton |
| `InsightBadge` | `@/components/ui/InsightBadge` | Severity badge |
| `TrendsChart` | `@/components/dashboard/TrendsChart` | Main chart component |
| `TrendsChartSkeleton` | `@/components/dashboard/TrendsChartSkeleton` | Loading skeleton |
| `ChartTooltip` | `@/components/dashboard/ChartTooltip` | Custom tooltip |
| `RefreshButton` | `@/components/dashboard/RefreshButton` | Refresh button |
| `RefreshStatus` | `@/components/dashboard/RefreshStatus` | Last updated display |
| `Toast` | `@/components/ui/Toast` | Toast notification |
| `ToastProvider` | `@/components/ui/ToastProvider` | Toast context |
| `useToastContext` | `@/components/ui/ToastProvider` | Toast context hook |
| `AskClaudePanel` | `@/components/ask-claude/AskClaudePanel` | Main chat panel |
| `ChatMessage` | `@/components/ask-claude/ChatMessage` | Single message |
| `ChatInput` | `@/components/ask-claude/ChatInput` | Input with send |
| `SuggestedPrompts` | `@/components/ask-claude/SuggestedPrompts` | Quick actions |
| `AskClaudeTrigger` | `@/components/ask-claude/AskClaudeTrigger` | Sidebar button |
| `SettingsSection` | `@/components/settings/SettingsSection` | Section wrapper |
| `ProfileSection` | `@/components/settings/ProfileSection` | User profile |
| `NotificationSettings` | `@/components/settings/NotificationSettings` | Email toggles |
| `DataSettings` | `@/components/settings/DataSettings` | Dashboard prefs |
| `Toggle` | `@/components/ui/Toggle` | Toggle switch |
| `Select` | `@/components/ui/Select` | Dropdown select |
| `ThemeToggle` | `@/components/ui/ThemeToggle` | Theme toggle button |
| `AppearanceSettings` | `@/components/settings/AppearanceSettings` | Theme selector |

## Hooks

| Export | Path | Notes |
|--------|------|-------|
| `useAuth` | `@/hooks/use-auth` | Re-export of auth hook |
| `useDashboard` | `@/hooks/use-dashboard` | Dashboard data hook |
| `useChannels` | `@/hooks/use-channels` | Channel data hook |
| `useInsights` | `@/hooks/use-insights` | Insights data hook |
| `useTrends` | `@/hooks/use-trends` | Trend data hook |
| `useToast` | `@/hooks/use-toast` | Toast notifications |
| `useRefresh` | `@/hooks/use-refresh` | Refresh coordination |
| `useAskClaude` | `@/hooks/use-ask-claude` | Chat state and API |
| `useSettings` | `@/hooks/use-settings` | Settings management |

## Context

| Export | Path | Notes |
|--------|------|-------|
| `AskClaudeProvider` | `@/context/AskClaudeContext` | Panel state provider |
| `useAskClaudePanel` | `@/context/AskClaudeContext` | Panel open/close |

## Providers

| Export | Path | Notes |
|--------|------|-------|
| `ThemeProvider` | `@/providers/ThemeProvider` | Theme context provider |
| `useTheme` | `@/providers/ThemeProvider` | Theme hook |

## Supabase

| Export | Path | Notes |
|--------|------|-------|
| `createClient` | `@/lib/supabase/client` | Browser Supabase client |
| `createClient` | `@/lib/supabase/server` | Server Supabase client (async) |
| `createServiceClient` | `@/lib/supabase/server` | Service role client (admin) |
| `createAdminClient` | `@/lib/supabase/server` | Alias for createServiceClient |
| `updateSession` | `@/lib/supabase/middleware` | Middleware session refresh |

---

**How to Update:** After creating ANY export, add it here immediately.
