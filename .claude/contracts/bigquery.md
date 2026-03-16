# BigQuery Integration Contract

> Documents all BigQuery queries, table sources, mappings, and attribution rules.

## Data Source

**Project:** `wander-9fc9c`
**Dataset:** `analytics`
**Service Account:** `marketing-sync-pipeline@wander-9fc9c.iam.gserviceaccount.com`

## Queries

### 1. SPEND — `marketing_adnetwork_daily_report`

Aggregates daily spend, clicks, and impressions by platform.

```sql
SELECT dt as date, platform,
  SUM(spend), SUM(clicks), SUM(impressions)
FROM `wander-9fc9c.analytics.marketing_adnetwork_daily_report`
WHERE dt BETWEEN @start_date AND @end_date
GROUP BY dt, platform
```

Returns: `BigQuerySpendRow[]` — `{ date, platform, spend, clicks, impressions }`

### 2. BOOKINGS — `bookings_reconciled_v2` JOIN `funnel_events_attribution`

Confirmed, profitable bookings with last-touch attribution.

```sql
SELECT DATE(b.ts_created) as date, COALESCE(f.partner, 'other') as channel,
  COUNT(DISTINCT b.id_booking), SUM(b.total_paid), SUM(b.booking_revenue_recognized),
  SUM(b.points_used), SUM(b.coupon_off),
  COUNTIF(b.is_direct_booking = TRUE), COUNTIF(b.is_ota = TRUE)
FROM bookings_reconciled_v2 b
LEFT JOIN funnel_events_attribution f ON b.id_booking = f.id_booking
  AND f.event_type = 'purchased' AND f.attribution_model = 'last_touch'
WHERE b.is_profit = TRUE AND b.status = 'confirmed'
```

Returns: `BigQueryBookingRow[]` — `{ date, channel, bookings, gmv, take_rate_revenue, points_used, coupon_off, direct_bookings, ota_bookings }`

### 3. FUNNEL — `funnel_events_attribution`

Signup and checkout events for conversion funnel.

```sql
SELECT DATE(ts) as date, partner as channel, event_type, COUNT(*)
FROM funnel_events_attribution
WHERE event_type IN ('user_signed_up', 'checkout_started')
```

Returns: `BigQueryConversionRow[]` — `{ date, channel, event_type, count }`

## Platform-to-Channel Mapping (24 entries)

| Platform(s) | Channel |
|-------------|---------|
| facebook, instagram, facebook_ads, meta | `meta` |
| google, google_ads, google_search, youtube | `google` |
| tiktok | `tiktok` |
| pinterest | `pinterest` |
| bing, microsoft | `microsoft` |
| criteo | `criteo` |
| mountain | `mountain` |
| influencer | `influencer` |
| email, lifecycle, customer io, customerio, email action, newsletter, iterable | `lifecycle` |
| demand_sales | `demand_sales` |
| direct_mail, direct mail | `direct_mail` |
| affiliate, benefithub | `affiliate` |
| seo | `seo` |
| organic | `organic` |
| airbnb | `airbnb` |
| vrbo | `vrbo` |
| booking | `booking` |
| mybookingpal | `amex` (NOT booking) |

## Attribution Rules

> See `data-source-hierarchy.md` for full rationale (Cam Aroz, March 12, 2026).

| Channel | Source | Attribution Method |
|---------|--------|--------------------|
| **Meta** | Meta Ads API | 28d_click + 1d_view |
| **Google** | Google Ads API | Data-driven |
| **Pinterest** | Pinterest Ads API (planned) | 30d_click + 1d_view |
| All others | BigQuery `funnel_events_attribution` | last_touch |

**Rule:** For channel performance monitoring, use platform Ads APIs. BigQuery last-touch is only for reconciling actual revenue. `DATA_SOURCE_HIERARCHY` in `src/types/index.ts` enforces this. When a platform API is enabled, the mapper overrides that channel's spend/clicks/impressions/bookings/GMV with API data.

## ROAS Calculation

```
ROAS = takeRateRevenue / spend
```

**NOT** `gmv / spend`. Take rate revenue = what Wander earns (booking_revenue_recognized). Per Dylan Wright review, March 2026.

## Cache Strategy

- **Table:** `channel_snapshots` (Supabase)
- **Key:** `(channel, date)` unique constraint
- **Upsert:** On refresh, invalidate date range then insert new rows
- **TTL:** None (manually refreshed via POST /api/refresh)
- **Data source tag:** `data_source` column = `'bigquery'` | `'meta_api'` | `'google_api'` | `'pinterest_api'`
