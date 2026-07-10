# Spend-tracker interim connectors

**These are temporary.** Zernio is our ads aggregator, but its Wander
connection currently has NO Google Ads and NO Pinterest (probe 2026-07-10).
Until those platforms are connected in Zernio, the spend tracker fetches them
directly via the connectors in this folder — ported from Brian's
`wander-growth-tracker` (`src/lib/google-ads/`, `src/lib/pinterest/`).

## Design contract

- Every connector returns `ZernioShapedDailyRow[]` (`types.ts`) — field names
  mirror Zernio's `GET /ads/timeline` response (`date`, `spend`, `impressions`,
  `clicks`, `conversions`) plus `purchaseValue` (Zernio's ads-tree metric name
  for conversion value). When Zernio adds a platform, replace the connector's
  fetch with a Zernio timeline/tree call returning the same shape — nothing
  downstream changes.
- Connectors are **no-ops without credentials**: `isConfigured()` is false and
  the service skips them, falling back to BigQuery (adnetwork report spend +
  last-touch bookings). No env vars = exactly the pre-connector behavior.
- No new npm dependencies — Google uses the Ads REST API (OAuth token refresh +
  `googleAds:searchStream`) instead of the `google-ads-api` package the tracker
  used; Pinterest is one REST endpoint.

## Removal

When Zernio has the platform connected and verified (spend matches the
platform UI for a test window):

1. Re-run the account-scope probe against the new Zernio connection FIRST:
   platform OAuth is personal-identity-based, so foreign ad accounts leak in
   (the metaads connection carried Homi/Holaplex/personal accounts, and
   Zernio's /ads/tree ignores its own scope filter). Register every account
   the connection enumerates in the Neon `ad_account` allowlist
   (`scripts/seed-ad-accounts.ts`, default-deny) and filter reads through
   `ad-account-allowlist.service.ts`.
2. Point the connector's fetch at Zernio (or delete the connector and inline a
   Zernio call in `spend-tracker.service.ts`).
3. Delete the platform's env vars from `src/env.ts` (`GOOGLE_ADS_*` /
   `PINTEREST_*`).
4. This folder should eventually disappear entirely.

## Credentials

Not in Doppler anywhere (checked 2026-07-10) — they live only in Brian's
Railway env. Get `GOOGLE_ADS_*` in the handover; note the refresh token is
minted from Brian's Google login, so prefer re-authing under a Wander-owned
account. Pinterest is dormant ($0 spend / 30d as of Jul 2026) — don't chase
its creds until the channel is reactivated.

## Methodology notes (must survive any reimplementation)

- Google: campaign-level spend with the `isMarketplaceCampaign` denylist
  (Decision #9m, defensive — no OS/Listed spend on Google today); conversions
  from the TWO purchase actions via `metrics.all_conversions` (data-driven;
  `metrics.conversions` returns 0 because Purchase is a secondary goal).
- Pinterest: 30d click + 30d view windows, `TOTAL_CHECKOUT` as conversions,
  `TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR / 1e6` as value.
