# Segment Status Snapshot — 2026-02-23

As-of date: **2026-02-23**
Workspace: **Wander**
Snapshot folder: `tracking/plans/segment-snapshots/2026-02-23T17-15-21Z`

## Scope

This document captures the current operational state of Segment Connections and Tracking Plans at a point in time.

Primary source files:
- `tracking/plans/segment-snapshots/2026-02-23T17-15-21Z/tracking-plans.json`
- `tracking/plans/segment-snapshots/2026-02-23T17-15-21Z/connections/sources.json`
- `tracking/plans/segment-snapshots/2026-02-23T17-15-21Z/connections/destinations.json`
- `tracking/plans/segment-snapshots/2026-02-23T17-15-21Z/connections/destinations/<destinationId>.json`

## Tracking Plans (Protocols)

Found 2 LIVE tracking plans:
- `tp_2wMjCKetiwMn6v4IJQ9H9AYkUa4` — `wander.com`
- `tp_2y9E9zkcxOXuMXJIP8Li1lzqLJi` — `Wander Mobile`

Rule counts from snapshot:
- `wander.com`: 12 rules
- `Wander Mobile`: 23 rules

## Sources

Found 11 sources:
- Wander Server-Side API Production (DO NOT USE, GOING TO BE DELETED)
- wander.com staging
- Wander API Production
- Wander API Production (WanderOS users)
- Wander App Production
- app.wander.com production
- Wander App Dev
- app.wander.com staging
- Wander API Dev
- Backfill HTTP API
- wander.com production

## Impact.com Destinations

Found 3 Impact destinations:

1. `67aa7fe4752a7f754ba140d2` — `Impact`
- Source: `Wander Server-Side API Production (DO NOT USE, GOING TO BE DELETED)`
- Enabled: `true`
- Action Event Names: `User Signed Up`, `Checkout Started`, `Order Completed`
- Custom Parameter Mapping:
  - `CustomProfileId <- properties.id_anonymous`
  - `OrderSubTotalPostDiscount <- properties.total_normalized`

2. `67b674dd31ff3d8563690ef9` — `Impact - Web Production`
- Source: `wander.com production`
- Enabled: `false`
- `enablePageEvents: true`, `enableIdentifyEvents: true`
- No custom parameter mappings currently set

3. `689a6f6afb996ffd59300080` — `Impact - Server-side`
- Source: `Wander API Production`
- Enabled: `true`
- Action Event Names: `Order Completed`
- Custom Parameter Mapping:
  - `CustomProfileId <- userId`
  - `OrderSubTotalPostDiscount <- properties.revenue`
  - `ClickId <- properties.im_ref`
  - `IpAddress <- properties.ipAddress`
  - `UserAgent <- properties.userAgent`
- Custom Mapping For Products:
  - `ItemPrice <- price`
  - `ItemQuantity <- nights`
  - `ItemName <- name`
  - `ItemBrand <- brand`

## Notable Risks / Drift

- Impact is still enabled on deprecated source `Wander Server-Side API Production (DO NOT USE...)`.
- Impact mapping differs between deprecated server-side destination and canonical `Impact - Server-side` destination.
- `Impact - Web Production` exists but is disabled, so web attribution context is currently limited by configuration.

## Recommended Cleanup Sequence

1. Disable/remove Impact destination on deprecated source.
2. Keep `Impact - Server-side` as canonical payable conversion sender.
3. Decide whether to enable `Impact - Web Production` for context-only (`Page`/`Identify`) while preserving server-only conversion ownership.
4. Re-snapshot after changes and diff against this file.

## How this snapshot was generated

From `tracking/`:

```bash
./scripts/pull-segment-state.sh
./scripts/pull-segment-connections-state.sh
```
