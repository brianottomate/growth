# Ads: idea → projection → mirror

The model the ads builder is moving toward, and what has landed so far.

## The idea

An **ad is a message (an "idea")**, and each platform is a *rendering* of it.
"Our machine, now yours" is one idea; Meta renders it as an image card with a
caption, Google Search renders it as headline + description text, OpenAI as a
cited result. The copy lives **once** on the idea and the push fans it out.

This maps onto the split the schema already has:

- **PLAN (our words):** `campaign → audience, ad`. An ad is the idea.
- **MIRROR (their words):** `platform_campaign → platform_ad_set → platform_ad`.
- **PROJECTION** is the bridge: how an idea *should* render on a platform. The
  live/off toggle drives reconciliation from plan toward mirror.

## The real split is creative vs text, not platform-by-platform

- **Creative (visual) ads** (image/video cards, feed placements) generalize
  across Meta, LinkedIn, Reddit, Pinterest, TikTok, and Google Display.
- **Text ads** (headline + description, no image, search-result shape) are
  Google Search and OpenAI.
- This is exactly `features.textAds` vs `features.creativeAds` in
  `src/lib/ad-platforms.ts`. Google is the one platform that spans **both**
  (Display = creative, Search = text), so it is not "too different", it is the
  one that lives in both modes.

An idea is therefore **copy-first, with media optional**:

- `media: []` → text-only idea. Renders as a search card, pushes to Google
  Search / OpenAI, never to a feed placement.
- add a creative → also eligible for Meta / LinkedIn / Reddit / …
- **Format is declared at the idea level** (`content.format`: static / carousel
  / video). A carousel with one card is *flagged as needing more*, the count is
  validated against the declared format, never inferred from it.

## What landed (this PR)

- **Text ideas render.** `toWallAd` used to return `null` for anything without
  `media` (`src/lib/ad-wall.ts`), so Google Search ads were invisible in the
  builder. They now render as a copy-first **search-style card**.
- **Text-only toggle** per idea (`ads.setAdTextOnly` → `setAdTextOnly` in
  `ad-set.service.ts`). Flipping is reversible; copy is preserved, the creative
  is dropped/re-shelled.
- **Home is opt-in.** A home ad is one flavor of idea, not the default. The
  "About no home in particular" heading only shows when there *are* home ads to
  contrast against; "Name the home" is demoted to a quiet "+ Home"; the per-ad
  "About no home yet" nag is gone.
- **Ads list**: newest campaigns first, with an All / Live / Draft filter.
- **Projected view** (`Projected.tsx`, a "Projected" step in the builder): one
  block per planned platform, rendering the campaign's ideas in that platform's
  shape — a feed card (`AdMock`) on Meta/LinkedIn/Google-Display, a search
  result on Google Search / OpenAI. It reads the plan (ideas + each platform
  draft's settings, e.g. `google.campaignType` and keywords) and touches no
  platform. A text-only idea is flagged as not eligible on a feed platform; a
  shell as awaiting a creative. This is the alignment concept promoted to a
  first-class surface.

### The safe seam

The compile keys off the `type` column (`creativeAds` skips media-empty ads,
`textAds` reads the pool), so the **push is untouched**. The text-only toggle
just keeps `type` in sync with the idea's shape. No schema migration, no
backfill: creative and text content shapes coexist and both readers tolerate
them.

## Next (not in this PR)

- **Projected view, deeper**: the v1 above is read-only. Next is editing the
  small per-platform deltas inline (Google keywords + short-headline/description
  pool, Meta CTA + pixel, LinkedIn Page) via `adTable.placements` ("per platform
  × placement cells that differ from `content`"), and per-placement previews
  (feed vs story) rather than one feed mock.
- **One live toggle** on the campaign (intent), reconciled per platform
  (`campaign.status` + `platform_campaign.status`/`externalId` already model
  intent vs reality). Master switch + per-platform switches; "live" is intent,
  not instant (Google has no dry-run, Meta pushes paused first).
- **Import existing campaigns → ideas** from the mirrored rows via the nullable
  plan pointers (`platform_ad.adId`, `platform_campaign.campaignId`). Lossy /
  best-effort by nature.
- **Gen-AI "extract ideas"** from live campaigns + the landing page, and flag
  capability gaps against the `textAds`/`creativeAds` flags.
- **Two-way sync stays create/pause + read-only mirror + drift display**, never
  a silent overwrite of a live ad's copy.
- Optional later: collapse the two content shapes into one JSONB
  `AdIdeaContent` and promote `format`/`textOnly` to columns if we need to
  query on them. Not required, since `type` already discriminates.
