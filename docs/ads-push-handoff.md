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
