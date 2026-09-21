# WPE: homes-first MCP comparison

Local experiment, 2026-09-21. Nothing approved or pushed to Meta.

- Reference: `/app/brands/winter-park-escapes/ads/camp_XC3usKE6TXyNUWBZ`
- Fresh: `/app/brands/winter-park-escapes/ads/camp_4SUsVBRphTSMuHJr`

## What was built

The connected Wander Growth MCP created a new campaign, five home statics, five three-card home carousels, one five-home portfolio carousel, home bindings and a Meta platform draft. Sources are the homes' original Wander listing photos, not the recovered Meta artwork. No imported creative metadata was copied into these ads.

The deployed connector lacks the current `saveIdea` action. A local integration harness then invoked the repository's registered MCP handlers, under the same experiment identity with normal membership/policy checks, to save editable `hero-overlay` recipes and the local delivery setup. This verifies the current handler path, not deployment of that capability to the connected service.

Each of the 25 cards has portrait and Story compositions. The Story layout repositions text on a 9:16 canvas instead of cropping a flattened portrait. All 11 ads remain drawn/unapproved. The per-home ads have structural home bindings; the portfolio ad intentionally does not.

## Similarity and differences

| Area | Result |
| --- | --- |
| Campaign structure | Matches the reference's 11 image ads: 5 static, 5 home carousels, 1 portfolio carousel. Catalog reference intentionally excluded. |
| Homes | Same five homes, verified by exact listing destinations despite abbreviated live ad names. |
| Artwork treatment | Existing Hero overlay template recreates the full-bleed home photo, top headline and lower CTA treatment. Portrait and Story both rendered and visually checked. |
| Exact image/layout match | Not pixel-identical. Current listing photo selection, font scale, line breaks and framing can differ from the live artwork. |
| Copy | New copy grounded in listing bedrooms, bathrooms and capacity. It does not reproduce unverified amenity claims or all of Meta's dynamic copy variants. |
| Destinations | Exact clean listing links for homes; portfolio links to the brand homepage. Avoided the reference Roam URL's appended ` Copy:` text. |
| Audience | Same 28 region labels and ages 18–65, explicitly labeled as reference targeting. This is a controlled comparison, not an independently researched audience strategy. |
| Setup | Local $83/day ABO, purchase event and reference pixel. Source VALUE optimization and automatic placements are not claimed as exact round-trip matches. |
| Placements | Facebook and Instagram feeds planned. Instagram Stories designated as a creative goal and composed separately. Vertical carousel publishing remains unsupported. |

## Gaps closed

1. `mediaLibraryRead.listingPhotos` was capped to the first 48 homes with no traversal. Added query filtering across the whole feed, offset pagination, total and nextOffset. Verified a Wilds 360 search that was unreachable through the old first page.
2. MCP audience creation/update capped regions at 20 while the UI accepted 60. Aligned both actions to 60 and added 28-region schema examples to the contract gate. Successfully created the comparison's full reference audience through the local MCP handler.
3. Fresh raw-photo drafts now retain editable composition recipes and explicit intended placements through the existing local `saveIdea` capability.

## Remaining gaps

- Deploy the current tool catalog before expecting the connected MCP to perform the complete editable-recipe workflow unaided.
- Add vertical carousel asset routing before enabling Stories delivery for this whole campaign. Creating a Story export is not proof it will be sent to Meta.
- Catalog ads need their own authoring/delivery path; they are not missing-image static ads.
- Exact live reconstruction still cannot recover original composition layers, dynamic selection behavior or every provider enhancement.
- Current recipe controls do not offer fine typography adjustments to match live artwork exactly. Visual similarity is qualitative; no fabricated similarity percentage is assigned.

## Review UI and verification

Import metadata is behind a source-details dialog. Catalog references are separate. Placement review defaults to comparison; each creative appears once in an accordion, with expand/collapse-all and per-campaign/platform expansion persisted in localStorage.

Browser verification covered the imported campaign's accordion persistence and source dialog, and the fresh campaign's 11 ads, editable portrait/Story preview, planned feed comparison and unapproved state.

`bun run check` and `bun run ai:contracts` pass. Full suite after the UI cleanup: 656 passed, 2 existing failures in performance-ads catalog-count expectations (14/15 and 62/63).
