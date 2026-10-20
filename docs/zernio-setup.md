# Zernio setup for the growth workspace

Use the Wander Zernio workspace and one API key in `ZERNIO_API_KEY` (Doppler).
A growth `brand` maps to one Zernio profile through `brand.zernioProfileId`; a
growth `channel` maps to one connected account through its `externalId`.

Connected today: Meta Ads (`metaads`), X Ads (`xads`). Google Ads
(`googleads`) is being added — see the Google Ads section below.

## Connection procedure

1. In Zernio, create or confirm the profile inside the Wander workspace.
2. On `/app/brands`, choose **Import from Zernio** and select the profiles to
   create as owned brands. Existing assignments are shown and cannot be chosen
   twice.
3. The importer saves the profile ID to `zernioProfileId` and imports each
   connected account as one channel:
   - `kind`: `social` for social profiles, `ad` for `*_ads` platforms.
   - `platform`: the actual network (`meta_ads`, `google_ads`, `x_ads`, …).
   - `externalId`: the Zernio connected-account ID.
   - `defaultProvider`: `zernio`.
   - `connectionStatus`: `connected` only after a successful read.
4. Reopen **Zernio connected** on a brand to refresh accounts after changing
   connections in Zernio.
5. Verify a content-sync call with an explicit brand slug. It must never infer
   a default brand or resolve an account by platform alone.

## Ad platforms: the allowlist is the boundary

Aggregators connect through a HUMAN's OAuth, so the token sees every ad
account that person manages, and Zernio's `/ads/tree` ignores its own scope
filter (2026-07-10 probe). All aggregator ad reads are filtered through the
default-DENY `ad_account` allowlist (`ad-account-allowlist.service.ts`).

**Rule for every new ad connection (Google included): probe the account scope
first, register every enumerated account in the allowlist (allowed or
denied), THEN start reading.** Seed via `bun run scripts/seed-ad-accounts.ts`
or Drizzle Studio.

## Google Ads (per docs.zernio.com/platforms/google-ads)

- Dedicated OAuth connection (scopes `adwords` + `datamanager`); Zernio uses
  its own approved developer token — no MCC/Standard Access application.
- The OAuth user's _accessible customers_ are all visible → with the Wander
  MCC (Demand + Supply sub-accounts) the allowlist step above is mandatory.
- Reads: campaign > ad group > ad tree, spend/CPC/CPM, tracking-URL tags,
  conversion-action discovery.
- Writes: Search campaigns (RSAs, keywords, geo/language), Display campaigns
  (RDAs — need BOTH 1.91:1 and 1:1 images), tracking-tag updates, Customer
  Match audiences + member upload, offline/enhanced conversion upload +
  adjust.
- Not yet: Performance Max, Shopping, Video, Demand Gen; conversion-goal
  campaigns (use `traffic`). EEA/UK uploads need consent signals
  (`adUserData`, `adPersonalization`). Conversions lag up to ~3h in reports.

## Governed campaign creation

Growth exposes a narrow Zernio campaign surface through the canonical AI
kernel:

- `adsRead.listDestinations` resolves an owned brand to its active Zernio
  connection and intersects Zernio's live ad-account enumeration with the
  brand-scoped `ad_account` allowlist.
- Standard campaigns use `adsWrite.draftCampaign`, `planPlatform`,
  `setPlatformDraft`, then approval-gated `push`. Meta creates paused.
- `adsWrite.createSpecializedMetaDraft` covers lead generation, lead conversion,
  app promotion and catalog sales, which the local draft compiler does not yet
  support. It forces `status: PAUSED`. Its validate-only mode still uploads
  referenced media, so validation also requires approval.
- Google Search and Display use the same draft workflow. Set `google.images`
  in `setPlatformDraft` to preserve separate landscape and square crops.
  Google creates then pauses in a second call; a failed pause leaves a
  spend-capable campaign and returns an explicit warning.
- `adsWrite.boostMetaPost` preserves the existing post engagement. Zernio
  launches boosts active, which makes the approval card the final spend gate.
- `adsWrite.duplicateCampaign` copies a campaign inside Growth (ads, audiences
  and platform drafts, nothing on the platform); the ordinary push then creates
  the copy paused. Zernio's campaign duplicate endpoint is not used.

Create and boost calls send Zernio's `Idempotency-Key` header. The key is stable
for one assistant run and exact payload, which makes provider retries safe for
24 hours. The direct OAuth MCP projection excludes spend-capable actions because
that route does not yet implement the in-app approval continuation.

## Guardrails

- API key lives only in the workspace environment; never per brand/channel.
- A profile is organizational context; a connected account is the publishable
  destination and stays unique to its brand (DB constraints enforce both).
- Sync requests include both the profile ID and exact account ID; results
  attach only when `channel.externalId` matches. Platform-only matching is
  forbidden.
- Spend numbers do NOT come from Zernio (rejected 2026-07-10: timeline
  ignores filters). Spend tracker keeps Meta API direct + BigQuery; Zernio is
  for ads analytics, structure, and (Google) writes.
