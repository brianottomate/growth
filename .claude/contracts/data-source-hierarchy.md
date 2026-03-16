# Data Source Hierarchy Contract

> Defines which data source is authoritative for each channel's metrics.
> Decision confirmed by Cam Aroz (March 12, 2026).

## The Rule

**Channel performance monitoring → Platform Ads API (not BigQuery).**

BigQuery (`bookings_reconciled_v2` + `funnel_events_attribution`) uses last-touch attribution, which is bad for channel analysis. Platform APIs use their own attribution models (view-through, data-driven, etc.) which correctly credit the channel.

BigQuery is only for reconciling actual revenue (takeRateRevenue / booking_revenue_recognized).

## Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: BigQuery (foundation for ALL channels)        │
│  - Spend, clicks, impressions (adnetwork_daily_report)  │
│  - Bookings, GMV (bookings_reconciled_v2, last-touch)   │
│  - Funnel events (signups, checkouts)                   │
│  - takeRateRevenue (ALWAYS from BigQuery, never API)    │
├─────────────────────────────────────────────────────────┤
│  LAYER 2: Platform API overrides (per-channel)          │
│  - Replaces: spend, clicks, impressions, bookings, GMV  │
│  - Keeps: takeRateRevenue from BigQuery                 │
│  - Graceful degradation: if API fails → BigQuery only   │
└─────────────────────────────────────────────────────────┘
```

## Per-Channel Source of Truth

| Channel | Performance Source | Attribution Model | Status |
|---------|-------------------|-------------------|--------|
| **Meta** | Meta Ads API | 28d_click + 1d_view | Live |
| **Google** | Google Ads API | Data-driven | Live |
| **Pinterest** | Pinterest Ads API | 30d_click + 1d_view | Planned |
| **TikTok** | TikTok Ads API | TBD | Future |
| **Microsoft** | Microsoft Ads API | TBD | Future |
| **Criteo** | Criteo API | TBD | Future |
| All others | BigQuery | Last-touch | Permanent |

## What Each API Overrides

When a platform API is enabled and returns data, it **completely replaces** these BigQuery metrics for that channel:

- `spend` — platform-reported spend (not BigQuery adnetwork)
- `clicks` — platform-reported clicks
- `impressions` — platform-reported impressions
- `bookings` — platform-attributed conversions (NOT last-touch)
- `gmv` — platform-reported conversion value

## What BigQuery ALWAYS Provides

These fields are never overridden by platform APIs:

- `takeRateRevenue` — `booking_revenue_recognized` (what Wander earns)
- `pointsUsed` — loyalty points redeemed
- `couponOff` — coupons/giveaways
- `directBookings` — `is_direct_booking=TRUE`
- `otaBookings` — `is_ota=TRUE`
- `accountCreations` — from funnel events
- `checkoutStarted` — from funnel events

## Enforcement

The `DATA_SOURCE_HIERARCHY` constant in `src/types/index.ts` defines which channels have API overrides. The mapper validates at runtime that overrides only apply to channels in this config.

## Why Not BigQuery for Everything?

Cam Aroz (March 12, 2026):
> "Monitoring channel performance → Ads API. Monitoring and reconciling actual revenue → BQ. Last touch attribution is bad for channel analysis."

BigQuery last-touch undercounts conversions for channels with:
- View-through attribution (Meta, Pinterest)
- Multi-touch / data-driven models (Google)
- Longer click windows (Meta 28d vs BigQuery instant)

## Adding a New API Integration

1. Add `{channel}_api` to `DataSourceType` in `src/types/index.ts`
2. Add entry to `DATA_SOURCE_HIERARCHY` with attribution model
3. Create `src/lib/{channel}/client.ts` + `queries.ts`
4. Add override block in `mergeSpendBookingsAndFunnel()` (mapper.ts)
5. Add parallel fetch in `src/app/api/refresh/route.ts`
6. Add Supabase migration for `data_source` CHECK constraint
7. Update this contract
