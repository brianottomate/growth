# Ad lifecycle and campaign ownership

Ad Studio is the pool of unassigned ads. A campaign consumes approved ads by
assigning their existing IDs; ads cannot belong to two campaigns. Generation,
including generation requested from a campaign, creates unassigned Studio drafts.
There is no copy, replacement, lineage, or versioning workflow.

## Review and approved output

- Draft (`drawn`) is editable. Ready records who marked it ready and when.
- Ready is a manual human mark that survives edits. Approval supersedes Ready; its
  provenance remains available until Return to Studio clears both review marks.
- Image approval captures the recipe, copy, included sizes and drawing brand settings
  in `ad.content.ideaStudio`. It locks editing immediately without rendering.
- Send to campaign in Studio and Add approved ads in a campaign both call
  `adsWrite.attachAdSet`. Consumption renders compositions into `ad.content`
  before assigning the selected ad IDs. Supplied artwork
  at the required dimensions passes through with its existing asset. Other sizes
  use the normal artwork fitting. The editable recipe remains for reopening.
- Studio supports single and multiple selection, sending to an existing campaign,
  and creating a campaign from the selection. Chat/MCP use the same action with
  `campaignId` or `newCampaignName` plus `adIds`. The new campaign and assignment
  commit together after export succeeds. No previous campaign relationship is saved.
- Publishers consume the approved `ad.content` and its saved size exports. Platform
  ads capture their delivery copy in `pushed_creative` when exported.
- Text/video approval locks the existing output in `ad.content`.

Campaign cards show previews and delivery. Review controls and internal discussion
live in Studio, not on campaign cards. Only approved, unassigned ads may be added.

## Return to Studio

`adsWrite.returnToStudio` / `ads.returnToStudio` requires the current `updatedAt`.
It atomically detaches the same ad, clears approval/Ready, restores its
editable recipe, and records a return event with an optional comment. Its ID and
previous comments remain. Concurrent changes reject the return instead of
silently overwriting them.

Platform ads keep their independent `pushed_creative` snapshot, observed fields,
and delivery state. Returning/reapproving an ad never pauses, rewrites, or updates
an existing platform ad. The dialog and event explain that it may still run.
Reopen and delete purge generated exports after clearing their owner references.
Source artwork and files referenced by retained platform records or other content
stay available. Chat history does not retain export files. There is no protection
for in-flight pushes. Cleanup errors are reported alongside the completed action. Existing platform
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
using their existing ad ID and source version. Returning an ad retains exports that platform history or other content still references and purges the rest.

## Meta delivery workspace

A Meta platform draft can be created before ads or audiences. Its card shows a
compact delivery setup and a placement inspection dialog. Setup is display-only
with one settings dialog, which exposes
allowlisted account/Page selection and goal for the current push, plus persisted
budget, budget allocation, schedule, and conversion settings. Inspection shows the routed approved creatives, using their prepared media and copy.
Facebook and Instagram previews reuse the shared AdMock components. Inspection
starts with a compact list and one selected placement per expanded creative;
Compare all placements opens the full grid. Each creative is shared across the
campaign's audience ad sets. Feed, Stories and Reels use the prepared size exports
that the publisher reads from `ad.content`.

The preview illustrates layout. Push compiles the current prepared ads, audiences
and delivery setup into a paused Meta campaign; its platform records retain the
pushed creative and compiled targeting. Launch remains a separate action.

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
Image carousels use their prepared Story cards when every card has one; otherwise
Meta receives the canonical feed cards for those placements.

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

## Campaign geography

Campaign audiences retain their brand persona link and campaign-specific reasoning. US Performance plans use whole-state codes in `geography.states`; export resolves their names to Zernio region keys in the US. `regions` holds named international subdivisions and requires one country for lookup. US region names normalize into state codes when audiences are saved.

`originCities` keeps feeder-city planning context without adding delivery locations. Suggestions default to states for US campaigns. `cities` is reserved for explicit city delivery targets. State, region and city targets combine as a union. The Performance card shows states first, followed by other targets, with feeder cities in a separate context section. Location lookup requires an unambiguous result of the requested type; unresolved geography stops export before provider writes.
