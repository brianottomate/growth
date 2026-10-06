# Campaign ad workspace

The campaign page has one Ads workspace, an optional shared Campaign assets pool,
and Delivery (audiences, platform settings, budgets, push, and live results).
Image ads offer Overview, Details, and an approximate Platform preview. Details
keeps copy and composition edits in dialogs; slide ordering uses explicit buttons.
Other formats reuse their existing editors in this workspace.

## Review lifecycle

An ad moves draft → ready → approved, and approved is final.

- **Draft** (`status = drawn`): editable from the campaign or the Ad studio.
- **Ready** (`ready_at`, `ready_by`): its author marked it done for review. Any
  edit to its content, placements, name, home, booking target or platforms sends
  it back to draft. A database trigger (`growth_ad_ready_clears_on_edit`) does
  this, so every write path obeys it.
- **Approved** (`approved_at`, `approved_by`): the sign-off. The ad never changes
  again. For image ads the images every included size needs are rendered and saved
  in the background (`freezeApprovedAd`); the push and previews call it too, so
  they never send live renders. The card reads "Approved · saving images…" until
  they land.

`ads.setAdStatus` is the one status operation (`drawn | ready | approved`) for the
app, chat and MCP. `drawn` only takes a ready mark back; an approved ad cannot
return to draft.

To change an approved ad, `ads.editApprovedAd` makes the draft that replaces it
(same name, home, campaign, routing and creative; `replaces_ad_id` points at the
original). The original keeps running until the draft is approved. Approving the
draft retires it: an original that never ran is deleted with the images its
approval saved; one that ran keeps its `platform_ad` rows and stats and keeps
running until someone pauses it on the platform.

The push sends a campaign's approved ads and leaves drafts in the campaign.

Deleting an ad that is live on a platform deletes it there first (Zernio
`DELETE /v1/ads/{adId}`, which takes the platform's ad id), then here. Its
`platform_ad` rows stay, marked deleted, as the record of what ran. An ad deleted
on the platform outside the app is deleted here by the next sync, unless it still
runs elsewhere. Nothing blocks deletion.

## Media library export bundles

The media library displays one expandable card per ad approval, identified by
ad ID and source version with campaign context. Opening it reveals exports grouped
by size in slide order, with the existing individual asset actions. Source photos
remain ordinary library items. Search, folder, and tag filters apply before
grouping, so a filtered bundle shows only matching exports. New exports record
ad and campaign names in their approval provenance; older exports still group
using their existing ad ID and source version. Retiring a replaced ad that never ran removes its unused exports through the
existing soft-delete lifecycle, so their bundle disappears too.

## Meta delivery workspace

A planned Meta platform card opens expanded with stacked Setup and Projection
sections. Setup is display-only with one edit dialog, which exposes
allowlisted account/Page selection and goal for the current push, plus persisted
budget, budget allocation, schedule, and conversion settings. Projection shows
the local campaign → audience ad sets → creative ads, using saved media and copy.
Facebook and Instagram previews reuse the shared AdMock display components with
independent carousel navigation. It is a planning preview, not a provider validation receipt. Carousel delivery
currently uses base images; alternate size exports are not routed to placements.

Validate uses the existing provider dry run, which currently supports only the
single-audience path. Push requires its own confirmation, creates paused delivery,
and refreshes the campaign workspace. Launch remains a separate action.

Projection shows compact audience summaries and each creative once, shared across
the ad sets. Everything is the default; platform and placement filters narrow the
responsive preview grid. Feed and Stories/Reels use shared mocks. Carousel previews
use base media for every surface, explicitly labeling Story crops. Static ads use
the dedicated story image when present, matching the existing push mapping.

Story previews now separate Facebook and Instagram chrome and use progress bars
and floating CTA stickers without default primary-copy overlays. Reels use a
separate illustrative layout. Optional caption/business-card states are simulations,
not predictions of enabled Meta enhancements. Full-asset inspection contains the
image and shows conservative composition guides, not verified Meta safe zones.

A read-only Zernio audit on 2026-09-21 found the active WPE September campaign
120248269013780701 with 12 active ads, one ad set, and an $83 daily ad-set budget.
Roam River Mansion static ad 120248270990320701 (creative 1480891127430102)
returns a landscape thumbnail matching the property/headline in the operator's
vertical Story capture but with different text layout. The tree payload does not
expose asset customization rules; do not infer the served Story from that thumbnail.

## Planned placements and live Meta reconstruction

Ad ideas can carry `intendedPlacements`: creative goals, editable through the same
`saveAdIdea` contract in the UI, chat and MCP. They expose missing exports without
introducing individual placement approvals. Approval still freezes one ad revision.
The Meta draft separately carries `settings.meta.placements`, the actual manual
placement plan sent to Zernio. Both projection and push use the same readiness
resolver: no feed-image crop substitutes for an absent vertical export. The
projection defaults to one selected placement with an optional Compare grid.
Vertical carousel delivery remains unsupported by our current publisher, even
when the idea contains a separately composed Story carousel.

`adsWrite.importMetaCampaign` (also available from the brand's Import from Meta
button) reads an allowlisted campaign and verifies each creative's Page. It creates
an independent local draft, copies original image files into a named library folder,
recovers ordered carousel variants and single-image placement variants, and retains
raw creative and ad-set settings for review. Source provider IDs are provenance;
they are never assigned as the new draft's delivery IDs. A repeated import returns
the existing working copy. Imported assets are supplied artwork, not reconstructed
composition layers. Dynamic copy, catalog/video sources, unresolved originals and
unsupported delivery settings remain explicit review gaps. Import does not push,
launch, or modify the source campaign.

### Generative starter ideas

The featured-home starter dialog defaults to AI copy, photo selection and editable
compositions. Each generation creates a fresh set: a static and carousel per home,
plus one shared hero carousel. A home's two formats share copy. Feed layouts are
always included; Stories layouts can be included with their own composition recipes.
These are intended creative placements, not a change to Meta delivery settings.

The server builds numbered photo contact sheets from the homes' galleries and uses
listing facts and brand voice in structured generation. It does not cache photo
analysis. Drafts are saved as each home finishes and remain unapproved. Next `after()`
runs the job after the start response; a `creative_run` record stores progress and
errors, and the campaign polls every two seconds while it is active. Completed drafts
remain available if generation fails. There is no automatic retry or reconciliation.

## Standalone Ad Studio

Performance clients can create ads before choosing a campaign. The All ads, Text-first and Creative-first filters describe the authoring approach; they do not change platform compilation eligibility. Search still compiles text ads and feed placements compile supported creative formats.

Studio supports home-photo and brand-concept generation, uploaded media, the shared image/composition editor, video/catalog tiles, and complete text headline/description pools. Text drafts can contain partial copy; approval requires 3–15 headlines (30 characters each) and 2–4 descriptions (90 characters each). Approved text ads change through a replacement draft, like every other ad. Text editing and approval require the current `updatedAt` version, preventing a stale browser from approving or overwriting newer copy. Creative-set rebuilds preserve text drafts and approved ads.

The existing `draftAd` and `writeGoogleTextAds` capabilities, and the app's From home group generation, accept exactly one of `brandId` (standalone Studio) or `campaignId`. Brand-scoped generation uses the same services as campaign authoring. `writeGoogleTextAds` optionally accepts a landing URL and search themes. `setAdCopy` accepts a complete `text` pool with `expectedUpdatedAt`. Approved standalone ads can subsequently be attached to a campaign using the existing attachment flow; the current relationship still assigns each ad to one campaign.
