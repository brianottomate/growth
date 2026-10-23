> Status update, 23 October 2026: the additive Meta workflow is implemented in
> [the completion release](ads-sync-release-audit.md). The original analysis below
> describes the pre-change blockers; it is not a claim that every later roadmap
> item, such as arbitrary drift acceptance, is implemented.

# Ads: plan, mirror, and the sync between them

Where the ads model is going, what blocks it today, and the order of work.
Extends [ads-idea-projection-model.md](ads-idea-projection-model.md) (plan →
projection → mirror) with the part that was never built: the arrow runs both
ways, and "push" is one direction of a sync.

## The model

Three layers, one owner each, joined by links that are the identity between
them.

- **Plan** (our words, source of truth for intent): `campaign → audience, ad`.
  An ad is an idea, frozen when approved. Per-platform differences live on
  the ad as small overrides (`ad.placements`), never as copies.
- **Compile**: a pure function from the plan to the state a platform should
  hold. One adapter per platform owns its compile, declares what it can render
  (text, creative, video, carousel, placements), and refuses what it cannot
  rather than coercing it. This is the `tracking` repo's provider pattern:
  one canonical vocabulary, one interface, one file per destination that owns
  its own mapping, unmapped means not sent.
- **Mirror** (their words): `platform_campaign → platform_delivery_group →
  platform_ad`, written only by sync, run on demand (before a reconcile, or
  from the campaign page), never on a schedule.
- **Links**: `platform_campaign.campaign_id`, `platform_ad.ad_id`, the ad set
  ↔ audience link. Today only a push sets them. Adoption from a platform must
  set them too; that is what makes a campaign built in Ads Manager a plan
  Growth can compile to Google.
- **Sync**: compare compiled plan with mirror and produce operations. Forward
  operations ("create this ad in ad set X, paused", "pause Y") are the push;
  reverse differences ("Meta changed the body") are drift the operator either
  accepts into the plan or re-applies. The operator approves the list; the
  adapters apply it; the mirror records the result. Nothing is overwritten
  silently.

## What blocks it today

- **One push per campaign, ever.** `pushToMeta` always creates a new campaign
  and its ad sets; a draft with an `externalId` is refused. Three guards keep
  an approved ad out of a campaign that is already on a platform
  (`campaignFor`, the campaign picker, the push itself). The Zernio client can
  target an existing ad set; nothing calls it that way.
- **Import copies instead of linking.** `importMetaCampaign` creates a new
  local draft; pushing it makes a second Meta campaign. `attachPlatformCampaign`
  does link, and its adopt path creates approved `ad` rows, but the adopted
  campaign is then blocked by the guards above.
- **Sync was lossy.** An ad whose platform copies disappeared was deleted
  from Studio (fixed: the Studio record stays, the mirror carries the removed
  status). It also took minutes per large account, one round trip per row
  (fixed: bulk upserts).
  Edits made in Ads Manager are mirrored but never compared with
  `pushed_creative`.
- **Compile lives inside `ads-write.service.ts`** (4,000+ lines), with Meta
  knowledge spread through it; `ad.placements` is never read at push time.
- **Google creative formats depend on Zernio**, which does not yet support
  Performance Max, Video or Demand Gen.

## Order of work

1. **Safety** (this branch): sync keeps Studio ads and is fast enough to run
   on demand before every reconcile.
2. **Sync v1 for Meta**: adapter interface with the Meta compile pulled out of
   the push service; operations list for create-ad-in-live-ad-set (paused) and
   pause/resume, approved by the operator; the three guards removed. Unique
   indexes on `platform_ad (ad_id, platform_delivery_group_id)` and
   `platform_campaign (campaign_id, platform)` so a retried operation lands
   once. Budget edits proven separately: Meta refuses rewriting published ad
   sets (subcode 3260011) and the same may apply.
3. **Adoption cleanup**: unmatched ads from adopted campaigns surfaced for
   review; `ad.placements` read at compile time.
4. **Google**: decide Zernio vs the Google Ads API, then creative parity.
5. **TikTok, Reddit** as adapters on the same interface.

## Decisions still open

- **One ad, one campaign.** `ad.campaign_id` stays a single column
  (recommended, see below). The same approved video in a prospecting and a
  retargeting campaign is two Studio ads made by "duplicate into campaign",
  sharing the media asset and related through `replaces_ad_id`. Freeze,
  placement overrides and `pushed_creative` are per ad, so one row serving two
  campaigns would share one freeze between contexts that diverge.
- ~~Adopted ads arrive approved.~~ Decided 2026-10-14: an ad that came from
  Meta, live or not, is approved on arrival. Return to Studio reopens it like
  any other approved ad. The approval lifecycle doc's "needs local approval"
  rule applies to the copy-style import only, which this model retires.
- **Meta rate tier.** Pushes upload through our own app on development access
  (60 points per account, 3 per write). A list of ten creates can trip the
  300 s block. Request Full Access before step 2 ships.
