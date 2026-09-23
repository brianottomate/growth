# Meta CAPI + typed tracking: handoff

State as of 2026-09-23. Resume from here on any machine.

## What this is

Server-side Meta Conversions API (CAPI) Purchase on pixel `340252052212435`, deduplicated against the browser pixel by a shared `event_id` (`Purchase:<booking.id>`), on top of the typed tracking refactor (providers take one `{ event, properties }` payload, per-source server trackers).

Tracking versions: **11.0.0** (our refactor, #172) and **11.1.0** (CPA's sites calendar events, #184) are published. Our next minor, #182, will publish as **11.2.0**.

## PRs, in merge order

| # | PR | State | What it is |
|---|---|---|---|
| 1 | https://github.com/wandercom/wander/pull/22065 | Ready once CI is green; synced with `dev` | Backend: `@wos/tracking` on 11.0.0, per-source trackers, Meta CAPI for **wander.com website bookings**. |
| 2 | https://github.com/wandercom/wander.com/pull/3502 | Ready (CI green, threads resolved) | Browser: payload boundary, Meta Purchase aligned with the server (same event id, gross total, hotel ids). Independent of #1. |
| 3 | https://github.com/wandercom/tracking/pull/183 | Ready, low priority | GA4 `select_content` regression from 11.0.0 (CTA `source` hardcoded to `cta`). Patch. |
| 4 | https://github.com/wandercom/tracking/pull/182 | Draft | Sites Meta provider (`sitesMetaConversionsProvider`), `PayloadProperties` core type, context `clickIds.fbc/fbp` + `traits.email`. Publishes 11.2.0. |
| 5 | https://github.com/wandercom/wander/pull/22137 | Draft, stacked on #1 | Backend: sites CAPI on the sites tracker; checkout stores UA/IP/fbp/fbc. Pinned to 11.2.0, so CI is red until #4 publishes. |
| 6 | https://github.com/wandercom/wander-sites-website/pull/1286 | Draft, on `dev` | Storefront sends `_fbp`/`_fbc` with the inquiry. Needs #5 deployed first. |

#1 and #2 can merge in either order and do not need #3 to #6. wander.com ships through a release off `dev`, so merging #2 does not reach prod by itself.

Tracking publish is two merges: the feature PR, then the "Version Packages" PR. Then repin consumers and regenerate lockfiles with a real install.

## Configuration

- Meta CAPI turns on when `META_CAPI_PRIMARY_ACCESS_TOKEN` is set in Doppler `wander-os`. No enable flag. Graph API version is pinned in code (`v26.0`, `packages/libraries/tracking/src/meta.ts`).
- **To verify:** is the token set in `wander-os/prd`? Without it #1 deploys but sends nothing to Meta.

## Done outside the code

- Segment "Facebook Ads Conversion Prod API - Primary" (pixel 340): the **Purchase mapping is disabled**. It sent the bare `order_id`, which never deduplicated with the browser's prefixed id and double counted.
- Consequence: **native-app and manual bookings no longer reach pixel 340 server-side.** The native app still logs Purchase through the Facebook SDK (`mobile/src/screens/BookingSuccess/BookingSuccess.screen.tsx`). No Meta spend at the time.

## Behaviour held at `dev`'s status quo in #1

- **Consent:** tracking-server 11 derives a consent realm per source, which would make stored `Consent` rows start gating Segment/Amplitude/identify. `loadConsentOrAssumeGranted` therefore always returns `ASSUMED_CONSENT` without reading the DB, exactly what `dev` does today. A spec counts DB lookups to pin it. Do not change consent without an explicit decision.
- **Event time:** Order Completed keeps dispatch time (no `confirmedAt` timestamp).

## Open decisions

1. **Website context leaks to all providers (#1).** `marketplaceWebsiteContext` is spread into the context every provider sees, so Amplitude's server Order Completed reports `platform: 'web'` instead of `'server'` for wander.com bookings, and Segment starts getting `context.page`. Recommendation: scope it to the Meta provider only so Amplitude/Segment match `dev`. Not done yet.
2. **Native + manual Meta coverage.** First check in Events Manager whether the app SDK's Purchase lands in the same dataset/ad account as 340. If not: direct app CAPI (`action_source: app`) or re-enable Segment for non-web bookings only. Manual bookings: probably leave out of Meta.
3. **Sites `stay_dates_selected`.** Sites `dev` still spreads the nested `stay_dates_selected` into Property Viewed (`apps/website/src/pages/property/[id]/[slug].astro:835`), which 11.x no longer types. Recommendation: small PR to remove it, then delete the superseded remote branch `feat/tracking-engine-providers` (everything else on it is already in `dev`).
4. **Segment FB Secondary (catalog pixel `383859744455206`):** still enabled. Keep or retire.

## Cleanup still owed in #4

- Remove the `nonBlank` helper in `packages/server/src/providers/meta-capi.ts`; truthiness checks already drop null/empty, and email only needs `?.trim().toLowerCase()`.

## Local setup notes

- Monolith: Node 22.14.0 via mise, Yarn 4. Lefthook needs `yarn` on PATH (corepack shim). The `check-guidelines` cast check only runs correctly with GNU bash/grep (CI), not macOS.
- Installs from GitHub Packages: token from Doppler `wander-os/dev` `GH_PACKAGES_READ_TOKEN`. wander.com's `.npmrc` reads `GH_PACKAGES_TOKEN`, sites-website reads `GITHUB_TOKEN`. pnpm may need `npm_config_prefer_online=true` for fresh metadata.
- Unset `GITHUB_TOKEN` before `git push` / `gh`, or pushes 403.
