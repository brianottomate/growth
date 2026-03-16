# API Route Registry

> Check here before creating or calling any API route.

## Auth Routes

| Method | Path | Request | Response | Auth |
|--------|------|---------|----------|------|
| GET | `/auth/callback` | `code`, `next` query params | Redirect | No |
| POST | `/api/auth/signout` | - | `{ success: true }` | Yes |

## Dashboard Routes

| Method | Path | Request | Response | Auth |
|--------|------|---------|----------|------|
| GET | `/api/dashboard` | `?month=2026-01` | `ApiResponse<DashboardSummary>` | Yes |
| GET | `/api/channels` | `?month=2026-01` | `ApiResponse<ChannelMetrics[]>` | Yes |
| GET | `/api/insights` | `?month=2026-01` | `ApiResponse<Insight[]>` | Yes |
| GET | `/api/trends` | `?metric=spend&days=30` | `ApiResponse<TrendData>` | Yes |

## Refresh Routes

| Method | Path | Request | Response | Auth |
|--------|------|---------|----------|------|
| POST | `/api/refresh` | `{ start?, end? }` | `ApiResponse<RefreshResponse>` | Yes |
| GET | `/api/refresh/status` | - | `ApiResponse<{ lastSync }>` | Yes |

**POST /api/refresh** fetches data from:
1. BigQuery (3 queries: spend, bookings, funnel) — all channels
2. Meta Ads API (if `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` set) — Meta channel only

Meta API data overrides BigQuery's last-touch attribution for the Meta channel with proper 28d_click + 1d_view attribution. If Meta API fails, falls back to BigQuery data silently. Response message indicates whether Meta API was used.

## Ask Claude Routes

| Method | Path | Request | Response | Auth |
|--------|------|---------|----------|------|
| POST | `/api/ask-claude` | `AskClaudeRequest` | `ApiResponse<AskClaudeResponse>` | Yes (real Claude API, rate limited 20/min) |

## Metrics Routes (BigQuery-aware)

| Method | Path | Request | Response | Auth |
|--------|------|---------|----------|------|
| GET | `/api/metrics` | `?start=&end=` | `ApiResponse<ChannelMetrics[]>` | Yes (BigQuery or mock) |
| GET | `/api/metrics/summary` | `?month=` | `ApiResponse<DashboardSummary>` | Yes (BigQuery or mock) |

## Settings Routes

| Method | Path | Request | Response | Auth |
|--------|------|---------|----------|------|
| GET | `/api/settings` | - | `ApiResponse<UserSettings>` | Yes |
| PUT | `/api/settings` | `Partial<UserSettings>` | `ApiResponse<UserSettings>` | Yes |

---

**How to Update:** After creating ANY route, document it here.
