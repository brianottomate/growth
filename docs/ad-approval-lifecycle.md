# Ad lifecycle and campaign ownership

Ad Studio is the pool of unassigned ads. A campaign consumes approved ads by
assigning their existing IDs; ads cannot belong to two campaigns. Generation,
including generation requested from a campaign, creates unassigned Studio drafts.
There is no copy, replacement, lineage, or versioning workflow.

## Review and approved output

- Draft (`drawn`) is editable. Ready records who marked it ready and when.
- Editing Ready returns it to Draft. Approval supersedes the Ready state; its
  provenance remains available until Return to Studio clears both review marks.
- Approved captures `ad.approved_snapshot`: output content and placements plus
  approver/time. The editable composition stays on `ad.content` for reference.
- Image approval renders its included sizes in the background. Until rendering
  completes the card reports saving images. Attachment and publishing await those
  renders. Publishers consume the captured output, never a live composition.
- Text/video approval captures the output immediately.

Campaign cards show previews and delivery. Review controls and internal discussion
live in Studio, not on campaign cards. Only approved, unassigned ads may be added.

## Return to Studio

`adsWrite.returnToStudio` / `ads.returnToStudio` requires the current `updatedAt`.
It atomically detaches the same ad, clears approval/snapshot/Ready, restores its
editable recipe, and records a return event with an optional comment. Its ID and
previous comments remain. Concurrent changes reject the return instead of
silently overwriting them.

Platform ads keep their independent `pushed_creative` snapshot, observed fields,
and delivery state. Returning/reapproving an ad never pauses, rewrites, or updates
an existing platform ad. The dialog and event explain that it may still run.
Render assets remain available, including for in-flight pushes. Existing platform
rows are backfilled from the last known observed creative, not a claim to recover
an exact historical push. Imported platform ads may lack a human approver and
must return to Studio and receive local approval before another push.

## Internal discussion

The existing `content_comment` table supports exactly one target: a parent content
post, platform post (legacy), ad, or Catalog home. New UI discussion belongs to the
parent content post, Studio ad, or full-width Catalog list row. Organization
ownership is checked on every operation. Users can soft-delete their own comments;
return events remain.

App comments use the signed-in human. `reviewWrite.addComment` defaults to
`as=agent`, displayed as Growth assistant for that authenticated human. Explicit
`as=user` is shown as the human via Growth assistant. Author IDs and workspace are
server-derived, never caller-supplied. This does not notify or post externally.

Catalog approval/export and content-post approval retain their domain behavior;
this migration does not add a Catalog Ready state or freeze social publishing.

## Media library export bundles

The media library displays one expandable card per ad approval, identified by
ad ID and source version with campaign context. Opening it reveals exports grouped
by size in slide order, with the existing individual asset actions. Source photos
remain ordinary library items. Search, folder, and tag filters apply before
grouping, so a filtered bundle shows only matching exports. New exports record
ad and campaign names in their approval provenance; older exports still group
using their existing ad ID and source version. Returning an ad preserves its prior render assets for platform history.

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

Studio supports home-photo and brand-concept generation, uploaded media, the shared image/composition editor, video/catalog tiles, and complete text headline/description pools. Text drafts can contain partial copy; approval requires 3–15 headlines (30 characters each) and 2–4 descriptions (90 characters each). Approved text ads return to Studio for correction, like every other ad. Text editing and approval require the current `updatedAt` version, preventing a stale browser from approving or overwriting newer copy. Creative-set rebuilds preserve text drafts and approved ads.

The existing `draftAd` and `writeGoogleTextAds` capabilities, and the app's From home group generation, accept exactly one of `brandId` (standalone Studio) or `campaignId`. Brand-scoped generation uses the same services as campaign authoring. `writeGoogleTextAds` optionally accepts a landing URL and search themes. `setAdCopy` accepts a complete `text` pool with `expectedUpdatedAt`. Approved standalone ads can subsequently be attached to a campaign using the existing attachment flow; the current relationship still assigns each ad to one campaign.
