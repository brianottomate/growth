# Performance+ ads playbook

How Growth builds a sponsored-placement campaign, and why each default is what
it is. Codified in `src/lib/performance-ads.ts` (tested in
`performance-ads.test.ts`) so a generated build matches the house style rather
than inventing its own.

The source material is the first live Performance+ campaign — Away & Stay,
August 2026, `OSPERF+AWAY+STAY_PROSPECTING_PURCHASES` — built by hand in Ads
Manager, plus the walkthrough recordings made alongside it. Where the manual
build and our own data disagreed, the disagreement is written down rather than
silently resolved.

## Adopted from the manual build

**Naming (Brooke, 2026-09-09): platform, brand, then the level's own facts.**
Every level of a build starts `META_PERF+<BRAND>` for a client and `META_<BRAND>`
for one of Wander's own brands, because finance filters client spend on `PERF+`.

- Campaign: `META_PERF+<BRAND>_SALES_PURCHASE_<YYYYMM>`. The month is in the
  name; a Performance client is a monthly product.
- Ad set: `META_PERF+<BRAND>_<AUDIENCE>_<GEOS>`. Audience is `BROAD`,
  `LOOKALIKE` or `RETARGETING`; geos are the states most likely to book as
  two-letter codes joined with `+`, or `US`.
- Ad: `META_PERF+<BRAND>_<FORMAT>_<Property name>`. Format is `STATIC`,
  `CAROUSEL`, `VIDEO` or `INFLUENCER_VIDEO`, read off the ad's media; the
  property name stays human-readable because it is matched back to the
  onboarding list, not parsed.

The first live build (Away & Stay, August 2026) used `OSPERF+<CUSTOMER>_
<STRATEGY>_<OBJECTIVE>` and `Property<Slot>_<Format>_<Name>`; those names stay
on that campaign, and everything drafted since follows the convention above.

**Ten ads for four properties, not nine.** A static and a carousel per property,
then *both* a hand-built portfolio carousel and an Advantage+ catalog ad. These
last two are not interchangeable: the carousel fixes the order and the story, the
catalog ad lets Meta rank the same homes per viewer. Growth's first proposal
folded the portfolio copy into the catalog ad and was wrong to.

**Ad-set budgets, never campaign budgets.** A Performance+ campaign gains
audiences as the customer's spend grows, and CBO would reallocate a customer's
money across them without asking.

**`SEE_DETAILS`, not `BOOK_NOW` or `LEARN_MORE`.** Meta removed `BOOK_NOW`;
`LEARN_MORE` undersells a property page.

**`VALUE` optimization.** Nightly rates across a portfolio span hundreds of
dollars, so optimizing for conversion *count* buys the cheapest booking instead
of the best one.

**Advantage/AI creative enhancements off, every time.** Meta enables them by
default and they crop and filter property photography into something the
customer did not approve.

**Tracking on every ad.** Pixel tracking lives on the ad object and is *not*
inherited from the ad set, so it must be sent per ad — including when attaching
a new ad to an existing ad set.

**Audience count follows the budget.** Three audiences were scoped for Away &
Stay and one shipped, deliberately: splitting a few hundred dollars three ways
starves all three and none leaves the learning phase. The tiers in
`audiencePlanFor` encode that. The lookalike goes first because a seed of real
bookers beats a seed of viewers.

## Kept from Growth's own defaults

**Daily budget derives from the cycle's `mediaBudget`, never `billedAmount`.**
The gap between the two is the take rate. Away & Stay bills $500/month against
$400 of media; dividing the billed amount across 30 days overspends the media
plan by exactly the margin. `dailyBudgetFromMedia` floors rather than rounds, so
a rounding error never comes out of the customer's plan.

For the record, the live build ran one ad set at **$50/day**, which is $1,500 a
month against a $400 media budget — the month's budget in eight days. This is
the single most valuable thing the cycle model catches.

**The prospecting list should be used.** The 151k T1–T4 custom audience was
uploaded to the ad account and is delivery-active, but no ad set targets it. An
uploaded, unused audience is invisible in Ads Manager and obvious in Growth.

## Open questions

- **Period in the campaign name.** The live name has none. For a monthly
  recurring product, August and September campaigns for the same customer will
  collide in any name-based report. `performanceCampaignName` takes an optional
  `period` and defaults it off to match the live build. Worth settling.
- **Age targeting.** The live ad set runs 18–65; the tier analysis behind the
  audience showed volume concentrated in 35–54. Narrowing an already-small
  lookalike can hurt delivery, so this is a real trade-off rather than a
  correction. Not encoded either way.
- **Story-size creative.** Flagged during the build as wanted for statics
  ("it will look better") and not yet produced. Vertical renditions are not in
  the plan builder.

## Does this need its own board?

Short answer: yes, but not over `campaign`, and the columns already exist.

`campaign.status` (`draft → scheduled → live → paused → ended`) mirrors the *ad
platform's* lifecycle. A board over it is Ads Manager with worse data. The
lifecycle that actually needs tracking is *production*: brief received, audience
built, creative gathered, copy written, ads built paused, QA'd, launched,
reported. That is a different axis, and it is the axis the manual build spends
its time on.

The natural card is the **cycle**, not the ad. One customer-month per card keeps
the board at roughly ten cards instead of two hundred, and the columns are
already specified — they are the columns of the spreadsheet this whole model
replaced: Onboarded, Creative, Live, Report. Per-card, the ten ads are a
checklist, not ten cards; they move together and nothing is ever "in QA" while
its sibling is "in creative".

Two things would have to change before building it:

1. `ad_spot` is currently a read-only mirror of what the platform reports
   (`campaign.adSpots` is a count, per the note in `ads-schema.ts`). A checklist
   needs ad rows Growth authors *before* they exist on the platform.
2. `performance_cycle.status` is currently commercial (`planned → live →
   reporting → closed`). Production state is a second axis and should not be
   crammed into it.

Neither is large. Both are out of scope for the schema PR that introduced
`performance_account`.

## Verified against the platform

- Meta's minimum daily budget on the Wander USD ad account is **$1**, which is
  what `createMetaAdDraft` validates against. Media spend is billed by Meta to
  the ad account's funding source (monthly invoicing); Zernio meters only its
  own API product.
- Carousel and single-image drafts both pass Meta's `validateOnly` check through
  Zernio's `carouselCards` path — campaign and creative nodes validate, ad sets
  cannot be validated before a campaign exists (Meta subcode 1487604).
- The four Away & Stay homes were already products in catalog
  `Catalog_2026_Listed_NewHomes`, and their `retailer_id`s are the monolith
  property ids — so the catalog is the wander.com-URL-to-property-id resolver.

## The wall (2026-09-15)

The Ads tab under a Performance brand is the set as it will run: every drafted
ad filed under the home it is about, the portfolio and catalog ads as the slice
at the foot, each tile a real `ad` row with no campaign yet.

Two ways onto the wall, and they meet in the middle:

- **Build.** From the homes picked, or from a count when none are: the homes on
  the client's Performance record come first, their site's order fills the
  rest, and the homes chosen become the pick. `adsWrite.buildAdSet` takes
  `propertyIds` or `count`.
- **By hand.** *Add ad* makes an empty ad of a declared format (static,
  carousel, video), bound to a home or not. *Drop finished creatives* puts
  files in the library and asks one question: one static each, or one
  carousel. The home is read off the filename when it follows the export
  convention (`Brand_Home_Format_…`) and matches a home on their site.

The home is the unit an ad is bound to, not a gate. An ad can be made first
and bound afterwards (*Bind a home* on the tile, `adsWrite.setAdHome`); the
link, the house name and the tile's place on the wall follow the binding. An
ad about no home is allowed and says so on its tile.

Cards are edited on the tile: drop a file onto an empty slot, replace or
remove a card, add one from the library (`adsWrite.editAdCards`). A static
holds one card, a carousel two to ten and one while it is being filled.

`AdCreativeContent.format` declares what an ad is. Ads drawn before the field
existed read their shape off `media`, as the push always has (`adFormatOf`).

Approved ads go to a campaign with *Attach* (`adsWrite.attachAdSet`); the push
refuses a campaign holding an ad with no creative, so a forgotten shell cannot
ship a set with a hole in it.
