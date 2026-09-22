# Legacy RnR campaign comparison — September 22, 2026

Both comparison campaigns were created in Meta paused. No launch or spending was requested or performed.

| Source | Growth campaign | Meta campaign |
| --- | --- | --- |
| Supplied Drive artwork | camp_CBDmFE9HzQXxfjkd | 120248497615070701 |
| WanderOS starter workflow | camp_dQ4CFrCnFhFbeGQQ | 120248497662990701 |

Each has nine approved creatives: one four-home hero carousel, four home statics, and four home carousels. The WanderOS version uses home photography, generated copy, and rendered brand compositions. Both use R&R Ranch, Ross Ranch and Vineyards, Sonoma Estate, and Sonoma Glass House.

Shared configuration:

- Wander ad account `act_885632589057558`; Legacy RnR Page `1247371591803872`.
- One broad California/Washington audience. Country is lookup context, not an additional delivery location.
- $33/day on the single ad set, accurately represented as ABO. The former single-audience compiler ignored the CBO setting; future CBO pushes now create an explicit budget-owning campaign shell.
- Segment pixel/dataset `340252052212435`; custom conversion `2507264646442315` scopes PURCHASE to `legacy-rnr.wanderos.com`.
- Facebook/Instagram Feed and Stories. Statics use dedicated vertical artwork. Carousels reuse their canonical cards across placements; alternate Story carousel exports are not sent. Local previews preserve the complete actual asset rather than inventing a crop.
- Learn More CTA. Meta rejected BOOK_NOW with the Sales/placement-asset configuration (error 1885396).

## Verified provider workaround

Zernio's `/ads/creatives` endpoint ignored `pageId` in the live test and returned Wander's Page. `/ads/create` correctly applied Legacy RnR's Page. For shared-Page carousel attachments, Growth now creates a temporary PAUSED carousel campaign through that route, reads the creative back to verify `object_story_spec.page_id`, attaches `existingCreativeId` to the intended ad set, then removes its temporary campaign. No shared connection is switched. Identity mismatch fails before attachment; tests cover identity and cleanup on failure.

Provider validation succeeded for both campaigns. The first attempted Drive push was rolled back after the Page mismatch; the subsequent Drive and WanderOS pushes each reported one ad set and nine ads created. Temporary preparation campaigns were removed.

Local platform previews use approved frozen assets and the publishing placement resolver. Meta's platform controls and final rendering may vary; use the created ads in Ads Manager for the final platform rendering. Approval freezes creative assets; it does not launch an ad.
