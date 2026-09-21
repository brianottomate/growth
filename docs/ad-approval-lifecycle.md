# Campaign ad workspace

The campaign page has one Ads workspace, an optional shared Campaign assets pool,
and Delivery (audiences, platform settings, budgets, push, and live results).
Image ads offer Overview, Details, and an approximate Platform preview. Details
keeps copy and composition edits in dialogs; slide ordering uses explicit buttons.
Other formats reuse their existing editors in this workspace.

## Image approval

`ads.saveIdea` remains the shared UI/assistant edit operation. It checks ownership
and `expectedUpdatedAt`, retains the editable document, and saves a draft.
`ads.setAdStatus` is the shared approval/reopen operation. For studio-compatible
image ads, it requires `expectedUpdatedAt` and renders every card in every included
shape to a new media asset. Only after all renders succeed does a compare-and-swap
update store the approval and projected content/placements together. The approval
records the actor, time, source version, and exported assets. The editable document
retains the approved copy, card order, sources, and recipes.

Approved studio ads reject edits until reopened. Previews and delivery use the
saved exports, including size-specific overrides. A missing export never falls
back to a mutable preview URL. Push refuses unapproved ads and studio drafts
without an approval record. Approval does not send anything to an ad platform.

Reopen removes the local approval and rebuilds draft projections from the retained
document. Generated assets used by a platform ad, another ad, campaign, or content
post are retained. Other exports are soft-deleted from the media library; underlying
object bytes remain for recovery. Source photos and supplied artwork are untouched.
Failed or stale approval attempts soft-delete only the exports from that attempt.
Physical object garbage collection is deliberately separate from reopening.

Existing video, catalog, portfolio, and text editors remain available. Their
existing status operation remains in place; the render-and-freeze lifecycle above
applies to static/carousel image studio ads. No schema migration is needed: the
approval record is stored alongside the idea document in the ad content JSON.

## Media library export bundles

The media library displays one expandable card per ad approval, identified by
ad ID and source version with campaign context. Opening it reveals exports grouped
by size in slide order, with the existing individual asset actions. Source photos
remain ordinary library items. Search, folder, and tag filters apply before
grouping, so a filtered bundle shows only matching exports. New exports record
ad and campaign names in their approval provenance; older exports still group
using their existing ad ID and source version. Reopening removes unused exports
through the existing soft-delete lifecycle, so their bundle disappears too.

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
