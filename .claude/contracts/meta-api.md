# Meta Ads API Integration Contract

> Documents Meta API integration for proper attribution (28d_click + 1d_view).

## Why Meta API

> Part of the Data Source Hierarchy (see `data-source-hierarchy.md`).
> Rule: Platform APIs for channel performance, BigQuery for revenue reconciliation.
> Decision: Cam Aroz, March 12, 2026.

BigQuery uses last-touch attribution for all channels. For Meta, this undercounts conversions because it misses:
- View-through conversions (1d_view)
- Longer click windows (28d vs instant)

Meta's own API provides proper **28d_click + 1d_view** attribution. Per Brooke Hughes (March 2026).

## Environment Variables

```
META_ACCESS_TOKEN=<token>       # Same token as meta-tester
META_AD_ACCOUNT_ID=act_885632589057558
```

Both must be set for Meta API to be enabled. If either is missing, falls back to BigQuery-only.

## Files

| File | Purpose |
|------|---------|
| `src/lib/meta/client.ts` | API initialization, `isMetaEnabled()`, `getMetaAdAccount()` |
| `src/lib/meta/queries.ts` | `fetchMetaInsights()`, `aggregateMetaInsights()` |
| `src/lib/meta/bookings.ts` | `getBookingsFromActions()`, `getTotalBookingsWithAttribution()` |
| `src/lib/meta/retry.ts` | `retryMetaAPICall()`, `withRateLimit()`, `RateLimiter` |
| `src/lib/meta/facebook-nodejs-business-sdk.d.ts` | TypeScript declarations for SDK |

## Attribution Windows

```
STANDARD_ATTRIBUTION_WINDOWS = ['7d_click', '1d_view', '28d_click']
```

**Total bookings = 28d_click + 1d_view** (always sum both).

## Booking Extraction

Looks for `action_type === 'purchase' || 'omni_purchase'` in Meta's actions array. Each action has per-window values (e.g., `action['28d_click']`).

## Rate Limiting

- **Quota:** ~200 calls/hour (Meta standard apps)
- **Enforcement:** Global `RateLimiter` instance, `withRateLimit()` wrapper
- **Max wait:** 5 minutes, then throw
- **Retry:** Exponential backoff (1s → 32s) with ±20% jitter
- **Retryable errors:** Rate limits (17, 4, 80004), temporary (1, 2), network, 5xx

## Data Flow

```
POST /api/refresh
  ├── BigQuery (3 queries in parallel)
  │   ├── spend → all channels including Meta
  │   ├── bookings → all channels (Meta = last-touch, WRONG)
  │   └── funnel → signups, checkouts
  ├── Meta API (if enabled, in parallel)
  │   └── account.getInsights() → Meta spend + bookings (28d_click + 1d_view, CORRECT)
  └── Mapper (mergeSpendBookingsAndFunnel)
      ├── Merge BigQuery data for all channels
      ├── Override Meta bookings/spend/clicks/impressions with Meta API data
      ├── Keep BigQuery GMV + takeRateRevenue for Meta (API doesn't provide these)
      ├── Calculate ROAS as takeRateRevenue / spend
      ├── Tag Meta rows: dataSource='meta_api', attribution='view_click'
      └── Cache to Supabase channel_snapshots
```

## Graceful Degradation

If Meta API fails, the system falls back to BigQuery data for Meta channel. Error is logged but doesn't block the refresh. The catch handler in `route.ts` returns an empty array on failure.

## NPM Dependencies

```
facebook-nodejs-business-sdk  # Meta Marketing API SDK
p-retry                       # Retry with backoff
```
