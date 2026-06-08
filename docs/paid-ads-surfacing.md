# Paid ads surfacing

How Meta ad data (via Zernio) flows into the growth app and how it should appear
across `/feed`, `/calendar`, `/studio`, and the brand ads page.

## Source of truth

Meta ads are **managed in Meta Ads Manager** and mirrored by Zernio. We read them
via `GET /v1/ads/tree?source=all` (`getZernioAdsTree`). The tree is
`campaign → adSet → ad → creative`, with a `metrics` object at every level.

Live shape (inspected 2026-06, account `act_885632589057558` "Wander"):

- **118 campaigns, 200 ad sets, 1,727 ads** — all `facebook` (Meta), all `isExternal`.
- Per-ad `metrics`: `spend, impressions, reach, clicks, ctr, cpc, cpm, conversions,
  costPerConversion, purchaseValue, roas, actions{}`.
- Metrics are a **point-in-time snapshot** (recent window), NOT a time series.
- Campaigns are **spans, not points** — derived from ads' `platformCreatedAt`.

## What the data told us (assumptions that broke)

Validation script (`scripts/zernio-ads-validate.ts`) against the live tree:

- **Span length does NOT classify engine-vs-moment.** 72/118 campaigns span ≤7d,
  91/118 ≤30d — but that's the *creative-upload window*, not run length. Use
  `status` (active/paused), not span, to tell what's live.
- **Name parsing is unreliable** — only 69% of names match a known funnel token,
  and they're inconsistent. Do not group on names.
- **`platformObjective` is the clean grouping axis** — 100% present, 3 real
  buckets: **Sales (45, ~$126k), Leads (23, ~$109k), Traffic (46, $0)**. All spend
  is Sales+Leads; Traffic is a large dormant tail.
- **Spend is concentrated** — only 21/118 campaigns spend at all; top 4 ≈ 68%,
  top 12 ≈ 94%. The "live" set is ~12–20 campaigns, not a firehose.
- **Hero creative is universal** — 118/118 have a thumbnail; 117/118 of top-spend
  ads do. "One creative as the campaign visual" is safe.
- **Junk outliers exist** — a 2014 boosted Norwegian organic post + two 2022
  $0/paused campaigns. Filtered by dropping pre-2024 campaigns.

## Model

Object grain rises with the surface:

| Grain | Count | Where it belongs |
|-------|-------|------------------|
| ad spot (creative) | 1,727 | drill-downs only (`/zernio/ads`, brand ads page) |
| **campaign** | 118 | feed/calendar cards (campaign-level, hero creative) |
| objective group | 3 | default rollup in overview surfaces |
| **initiative** | human-authored | the throughline (paid ↔ organic intent) |

Three representations, picked per surface:

| Representation | Anchored on | Surface |
|----------------|-------------|---------|
| **Event** — "N new creatives live" | creative `platformCreatedAt` | `/feed` river, `/calendar` markers |
| **State** — what's spending now | current snapshot | `/feed` live-rail, dashboard |
| **Span** — start→end arc | derived dates | `/studio` wheel, `/calendar` year lane |

### Grouping decision

**`platformObjective` is the floor; human-authored initiatives are the throughline.**

- Objective (Sales/Leads/Traffic) honestly describes the always-on performance
  bulk (~95% of the account), which has no organic counterpart. It is a *paid
  performance rollup*, not a content throughline.
- `initiative` is reserved for real shared intent (e.g. `FifaWorldCup`, the
  `GTM-{Property}` launches) where a paid push lines up with an organic series and
  splices into a studio pillar lane. Intent is the one thing Meta's payload lacks,
  so it must be authored, not parsed.

This means `objective` is a **campaign attribute** (drives default grouping); we do
NOT mint fake "Sales/Leads/Traffic" initiative rows.

## Per-surface plan

1. **Brand ads page** (`/app/brands/[slug]/ads`) — already renders campaigns
   (incl. "unlinked"). A flat campaign sync lights this up with **no UI change**.
   *This is the v1 target.*
2. **`/studio`** — the throughline home (chosen direction). Campaigns lane shows
   the objective rollup; human initiatives splice into the pillar lanes they back.
   Note: studio's wheel + feed-v4 spines/rail key off `initiativeTable`, so they
   stay empty until initiatives are authored — that's the deliberate throughline step.
3. **`/feed`** — replace the stubbed `paid` filter (`FeedClient.tsx`, currently
   `return false`) with creative-launch events + a pinned "live paid" rail
   (active + spending campaigns, grouped by objective).
4. **`/calendar`** — toggleable paid overlay: launch markers + current-state band.
   No daily spend-heat (snapshot isn't a time series; daily history is the
   account-level BigQuery Meta cron only).

## Sync

`syncZernioAds` (`src/server/services/ads-sync.service.ts`), modeled on
`content-sync.service.ts`. Idempotent upsert keyed on `platformCampaignId`.

- Resolve/create the Wander **`meta_ads`** channel (externalId = ad account id).
- One **campaign** row per Zernio campaign: `objective = platformObjective`,
  `status` (active→live, paused→paused), `startAt/endAt` from ad dates (endAt null
  while active), `spend` (rounded snapshot), `budget`, `adSpots` (count),
  `stats` (full metrics snapshot), `heroThumbnailUrl` (top-spend ad's thumbnail),
  `externalId`, `manageUrl` (deep-link into Ads Manager).
- Filter junk: drop campaigns whose latest ad predates 2024.
- `initiativeId` left null (human-authored later).
- Ad spots (the 1,727) are NOT synced in v1 — only needed for drill-downs.

Run: `bun --conditions react-server scripts/sync-ads.ts`.

## Audiences & the ad-set gap (design note, 2026-06-05)

Prompted by a Slack thread ("new 200+ Lead Lookalike audience live on Meta"). We
inspected the live tree to see how an *audience* actually appears, and it surfaced
a structural mismatch with our schema. **No change made yet — captured for when the
paid/audience surfaces are built.**

What the tree shows:

- An "audience" is **not a top-level object**. It lives at the **ad-set** level. The
  thread's audience appears as ad sets like `LeadForm_MinervaLookalike` /
  `LeadForm_HubspotLookalike` *inside* `WanderOS_MetaLeadForm_Conversions`
  (objective `OUTCOME_LEADS`) — two audiences A/B-tested in one campaign.
- The ad set's `promotedObject.custom_event_type` (e.g. `SUBMIT_APPLICATION`,
  `COMPLETE_REGISTRATION`) is the **executional goal**, finer than the campaign's
  `platformObjective` (`OUTCOME_LEADS`). Goal is effectively two-level.
- Audience names encode **seed lineage** — `Minerva*` / `Hubspot*` / `CombinedLookalikes`
  are seeded from our lead/CRM lists (→ `leads.*`, the leads back-office).

Where our model falls short:

1. **No run-state on `audience`.** The whole event is a state change ("now live"),
   but `audience` is exists-only. `/audiences` coverage treats *audience exists →
   covered*, so a paused audience reads as covered (false positive). Meta carries
   active/paused at the ad-set level.
2. **No `audience ↔ campaign` link.** `audience` is a free-floating per-channel row
   tied only to `audience_target` + `channel`. The deployment grain is the ad set
   (which we flatten to `adSetId`/`adSetName` strings on `ad_spot`), so "which
   campaigns is the Minerva lookalike running in?" is unanswerable today.
3. **No seed-source link.** `audience` → its origin list (`leads.*` / HubSpot /
   Minerva) has no FK; the "we turned our best 200+ leads into a lookalike" story
   only lives in free-text names / `audience.definition`.

**Full proposal written up in `docs/audiences-model.md`** (the `audience_placement`
layer, lookalike seed lineage, and prompt/free-text definitions for OpenAI).

Options when we pick this up (smallest → largest):

- **(A) Run-state + join.** Add `audience.status` (active/paused/draft) and an
  `audience ↔ campaign` link (join or `campaignId`); coverage becomes "target has an
  *active* audience on each intended channel." No new ad-set table.
- **(B) Promote ad-set to an entity.** Real `campaign → ad_set → ad_spot`; the
  ad-set holds the audience link + optimization event. Most faithful to Meta, most
  surface to sync.
- **(C) Seed lineage only.** Add `audience.seedSource` + a link back to the
  originating `leads.*` import — the strategic story, structure unchanged.

Ties to the open **`goal` table** question (`ads-schema.ts:89` — "promote to a
`goal` table when organic content links to the same axis"): the tree confirms goals
are multi-level (campaign objective vs. ad-set conversion event).

## Throwaway inspection scripts

- `scripts/zernio-ads-dump.ts` — raw tree shapes + time spread.
- `scripts/zernio-ads-validate.ts` — the assumption checks above.
