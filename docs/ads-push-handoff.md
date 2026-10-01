# Ads push handoff, September 2026

State of the campaign push chain after v1.0.39, written for whoever picks this
up next. Covers what now works, what is verified against live platforms, and
what is still drifting.

## The headline

**LinkedIn push works end to end.** It had never completed before 3 September.
The Booking Burglar campaign now exists in LinkedIn Campaign Manager under ad
account `515601419`:

| Layer | Growth | LinkedIn |
|---|---|---|
| Campaign | `pcamp_hDLCTAKpMawxTKF8` | Campaign group `1195639026` |
| Ad set | `pas_DjFMtd8xQv4RrzV5` "Broad USA" | Campaign `874530076`, Sponsored Content |
| Ads | 5 | `1594079566`, `1594098646`, `1594108296`, `1596223636`, `1596270626` |

Objective is Website Visits, from the `traffic` goal. Spend is $0.00 and every
ad is off. Nothing delivers until someone sets delivery explicitly, which is
the intended shape: a push writes the structure and stops.

Meta's mirror of the same plan is campaign `120248138583850701` on act
`885632589057558`, also paused with 5 ads.

## Why it kept failing

Five separate bugs sat between a draft and a live LinkedIn campaign, and they
were all the same bug wearing different clothes: **two halves of a contract
that disagreed with each other.**

- The push read `input.platform ?? "meta_ads"`, so a LinkedIn push authenticated
  against LinkedIn and then wrote to Meta's shape.
- Zernio's 201 is a documented `oneOf`. We read one arm of it. The other arm
  returned real ids that we dropped on the floor, so the campaign existed
  upstream while our mirror showed no external id.
- Push idempotency keys were scoped to the campaign forever, so a second attempt
  after a failure was treated as a replay and did nothing.
- A failed push left a created campaign group orphaned upstream with no record
  here. One of those, `1195488596`, was deleted by hand after confirming $0.00
  spend.
- The writer handled video and the reader did not. Four separate times, on four
  separate surfaces.

That last shape is worth internalising. It is most of what went wrong across
the media library too, and it is why `posterForMedia` now exists as the single
rule for whether an `<img>` can render a given item. When you add a media
surface, use it rather than re-deriving the rule locally.

## Verified drift, still open

**The ad set status disagrees with LinkedIn.** Our mirror says `paused`.
LinkedIn says `Draft`, because a LinkedIn campaign stays in draft until
delivery is configured. Nothing breaks today, and a status sync that trusts our
own value will be wrong the moment someone reads it.

**Zernio names the LinkedIn objects itself.** We send `campaignName` and
`adSetName`, and Campaign Manager shows "Booking Burglar - Campaign Group" and
"Booking Burglar - Campaign". Those fields are Meta-only in practice. They are
still sent to LinkedIn, where they are ignored.

**`multiCreativeAdSet` is dead.** Declared in `src/lib/ad-platforms.ts:60` and
assigned per platform on three rows. Nothing reads it. Either wire it into the
one-ad-per-push decision or delete it.

## Conversion tracking

`conversion_mapping` was corrected in prod on 3 September after reading
wander.com's `src/features/tracking/lib/analytics.ts`. Its `LINKEDIN_CONVERSIONS`
map wires only the two Clicked rules. The two Submitted rules were retired along
with the `/os` and `/list` lead-capture modals and had been sitting at
`verified` since June.

| Rule | Event | Status |
|---|---|---|
| 26084452 | Lead | verified |
| 26084468 | Sign up | verified |
| 26084460 | Submit Application | not_implemented |
| 26084476 | Qualified Lead | not_implemented |

The practical consequence: **there is no conversion event either platform can
optimise for**, which is why `traffic` is the honest goal right now rather than
a compromise. Getting off traffic means wiring a real `/os` conversion first.

Not started, roughly in the order I would do them:

1. A `/os` conversion event, so Meta can optimise for conversions.
2. Persist `li_fat_id` on leads. It is already captured in wander.com's
   tracking, and it goes nowhere.
3. LinkedIn CAPI from growth, once there is an event worth sending.
4. Google Ads campaign type. `pcamp_ueNJbkkvVBfBUGsW` is a draft with nothing
   behind it.
5. Delete Brooke and Wanda's HubSpot workflow `1877939505`.

## Operational notes

**Release notes will keep coming out near-empty.** v1.0.39 shipped 19 commits
and release-drafter listed one, because only #131 arrived as a merged PR and the
rest were direct pushes to `dev`. The draft body was rewritten by hand before
publishing. `AGENTS.md:70` still documents branch, PR, one approving review, so
the docs and the practice have parted ways. Pick one.

**The pitch and properties routes now make a model call** and run at
`maxDuration: 800` on Fluid. `resolveGeography` falls back to the deterministic
lookup when Anthropic fails, so a slow model makes a slow page rather than a
broken one. Watch the first pitch loads after any deploy.

**Geography is model-resolved now.** The old lookup table could only fix cases
it already knew, and our own listing feed states one place several ways, which
is how a pitch page came to read "OH, OHIO". The schema plus a precise field
description is the entire guard. There is deliberately no second check
downstream, because a duplicated rule is just somewhere for the two copies to
disagree. Resist adding one back.

**Whisper gets a vocabulary prompt.** Without it, transcription renders WanderOS
as "Wander West". `WANDER_TERMS` in `audio-transcription.service.ts` is the
place to add product names.

**Rollback** is a re-run of the Deploy workflow run for the previous release,
which triggers a Vercel instant rollback. Production actions need Kristian's
explicit go.

## Running as a client's Page (2026-09-09)

A Performance client grants Wander access through Leadsie, which puts their
Facebook Page in Wander's Business Portfolio. Wander's existing Zernio Meta
connection can then see the Page, and Verify access on the intake records it
on `brand.meta_page_id`.

**Zernio creates every ad as the Page its connection is bound to.** There is
no per-ad Page override on `/ads/create` (only `instagramAccountId` for the
IG actor), so a Leadsie grant alone cannot run ads as the client. The client
brand needs a Zernio connection of its own, bound to its Page. Growth's own
connect link (`/connect/[token]`, on the brand page) makes that in two clicks
for anyone whose Meta login can manage the Page, which after Leadsie includes
Wander staff: connect Facebook, pick the client's Page, then connect Meta Ads.

What the code guarantees around that:

- **Auto-select.** After a connect callback, `syncBrandConnect` moves the
  brand's Facebook connection to `meta_page_id` when it landed on another Page
  (the Meta Ads flow binds the first Page the login can manage).
- **Refusal.** `requireAdDestination` refuses a Meta connection bound to any
  Page other than the brand's. A client's campaign never runs as Wander by
  accident. Destinations carry `pageId` and `runsAsBrandPage` so the push
  dialog and the agent can see the mismatch before trying.
- **Shared ad accounts.** `ad_account` is one row per (account, brand). A
  client borrowing Wander's account has `is_shared = true`; sync attributes it
  only the campaigns this app pushed for it, and never re-attributes a
  campaign another brand's row already claims. Wander keeps everything
  unclaimed, including campaigns made by hand in Ads Manager.
- **Facebook posting without a profile.** Zernio takes `pageId` per post on
  Facebook, so a brand with no profile but a bound Page posts through any
  connected Facebook channel in the organisation. Instagram, LinkedIn and X
  have no such switch and still need the brand's own connection.

Winter Park Escapes is the first brand on this path: Page 410431762630458,
Wander's `act_885632589057558` allowed as shared, intake verified 2026-09-09.

## Conversion scoping for client brands (2026-09-14)

Wander's pixel `340252052212435` fires `Purchase` on wander.com and on every
WanderOS storefront (fleet rollout 2026-09-10). Winter Park Escapes' first ad
set optimised on that raw event, so Meta credited it with nine purchases in
four days while the pixel saw two on winterparkescapes.com: any viewer who
booked anywhere in the fleet inside the 1-day view window counted.

The push now pins a client ad set to a Custom Conversion scoped to the brand's
host (`META_PERF+<BRAND>_<EVENT>`, rule `url i_contains <host>`), provisioned
through Zernio's `POST /accounts/{id}/custom-conversions`, which reuses by name
and pixel. The ad set carries the conversion id alone: Meta rejects a pixel sent
beside it (subcode 1885014). Wander's own brands keep the raw event. A client brand with no
`website` falls back to the event and the push warns. `settings.meta.customConversionId`
pins one by hand. Existing ad sets cannot be rewritten at all: Meta refuses any
change to pixel, conversion event, custom conversion or optimisation goal on a
published ad set (subcode 3260011), so a mis-scoped ad set is replaced by a new
one and paused. The scoping has to be right at push time.

## Meta placements: one image per placement shape (2026-09-30)

Our ads are designed artwork: headline at the top, a pill at the bottom. Meta
shows each placement at its own shape and crops what does not fit, so an ad
sized for one shape loses its text in another. Rule since the Chalets redo:
**no placement gets a crop of an image made for another shape.**

| Meta placements | Shape shown | What the push sends |
| --- | --- | --- |
| Facebook feed, marketplace, right column, profile feed, notifications | 4:5 on mobile feed, **square** on desktop feed, marketplace and right column | the **1:1** export |
| Instagram feed, explore, profile feed (mobile only) | 4:5 | the 4:5 export |
| Stories and Reels, both apps | 9:16 | the 9:16 export |

Meta's placement rules (`asset_customization_rules.customization_spec`) split
by app and position but **not by device**, so "square on desktop only" is not
expressible: all of Facebook gets the square.

**How each format gets there**

- **Statics** go out in one Zernio call with `placementAssets`: the 4:5 as the
  default, a rule pinning the 9:16 to stories and reels, a rule pinning the
  1:1 to Facebook's feed placements. Nothing runs after the push.
  `metaPlacementAssetsFor` in `ads-write.service.ts`.
- **Carousels** go out as Zernio `carouselCards`, one set of cards, which
  Zernio will not combine with `placementAssets`. When the carousel has other
  sizes than its feed cards, the push rebuilds its creative on the Graph API
  with one card set per group (square on Facebook, 4:5 on Instagram, 9:16 in
  stories and reels) and swaps it onto the same ad
  (`setMetaCarouselPlacementCards`, called from `placeCarouselCards`). A
  square-only carousel with no 9:16 needs nothing and makes no calls.
- **Starter shells.** "Add starter ad ideas → Empty shells" creates empty ads
  per featured home sized by `ZERNIO_NATIVE_SHAPES` (statics 4:5 + 1:1 + 9:16,
  carousels 1:1): the sizes a push can deliver with nothing to fix after.
  Zernio's docs give no ratio advice, so these follow the shape of its API
  and Meta's specs as of 2026-09-30; revisit when Zernio adds per-placement
  carousels or ratio guidance.

**Facebook video feeds** is gone from `META_PLACEMENTS`: Meta's API refuses it
(code 100, subcode 2490562), so "all placements" is 14.

**Rate limits.** Our app is on Meta's *development* access tier for the
Marketing API (`ads_api_access_tier` in the `X-Business-Use-Case-Usage`
header): a score of 60 per ad account, reads 1 point, writes 3, regained over
300 s, with a 300 s block when exceeded (code 17, subcode 2446079). Each
carousel swap uploads every card image per set, so a campaign of 9 carousels
hit the limit on 2026-09-30 and 3 swaps failed with a push warning; they were
re-run by script once it cleared. Standard access (9,000 points, 60 s block)
is requested in the Meta app dashboard by an app admin. Until then, big
carousel campaigns can need a re-run of `setMetaCarouselPlacementCards` for
the ads the push warned about.

**Local previews.** The placement review (`MetaPlatformCard`) draws every
placement locally: feed, stories and reels as before, plus Marketplace, the
right column, notifications and Explore, each in its own small frame
(`AdMockFrame` in `components/ad-mock.tsx`, set per placement as `frame` in
`META_PLACEMENTS`). The frames crop the image square the way Meta does, so a
4:5 card visibly loses its edges. They are approximations; Meta's own
renders (below) are the reference.

**Checking a push before and after**

- Before: a validate-only push (`pushDraftToPlatform` with
  `validateOnly: true`) makes Meta check every node and creates nothing. It
  caught the video feeds refusal. It cannot check the carousel swap, which
  only runs after a real push.
- After: read the ads' `creative{asset_feed_spec}` for their rules, and Meta's
  own renders with `GET /{ad_id}/previews?ad_format=DESKTOP_FEED_STANDARD`
  (also `MOBILE_FEED_STANDARD`, `MARKETPLACE_MOBILE`, `INSTAGRAM_STANDARD`,
  `INSTAGRAM_STORY`). Previews can lag a creative swap by a minute. Ads
  Manager's hover thumbnails zoom and are not what runs; the full ad preview
  is.
- Zernio sometimes creates the first ad of an ad set ACTIVE although the push
  asked for paused. Check every ad is paused after a push.
