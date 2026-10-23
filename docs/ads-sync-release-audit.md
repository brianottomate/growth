# Meta campaign sync completion — 23 October 2026

## Repository audit

Compared open PRs, local/remote branches, worktrees, the latest production release
and related Growth chats. Old branch commit SHAs alone are not evidence of missing
work: this repository squash-merges PRs.

| Work | Finding | Disposition |
| --- | --- | --- |
| #680 / `feat/ads-sync` | Open: on-demand bulk sync; preserve approved Studio ads when their platform copies disappear | Included |
| #774 / `feat/push-ad` | Open: duplicate one ad, send approved ads into existing Meta ad sets paused, remove one platform copy | Included, with campaign serialization and live account/ad-set ownership checks |
| #672 / `fix/meta-broad-states` | Merged into dev during this audit: default Broad targeting starts with intended audience states | Included through current dev |
| `feat/ads-reconcile` / `71915a3c` | Unshipped uniqueness proposal only; no incremental publisher | Reworked as migration 0051; current delivery slots are unique, removed history is retained |
| New ad sets in an existing campaign | Not implemented by any of the above | Added with reviewed, paused publishing |
| #712, #717, #719, #720, #732, #734, #739, #751 | Seed UI, connection follow-ups, pixel recommendations, lead forms, attribution, audienceInclude, OAuth scope | Already merged; do not cherry-pick stale branch copies |
| #683 / backend `wander#22405` | Both open: manually configuring a WanderOS website's pixel | Separate setup work, not included in campaign-sync release; backend must ship first |
| `carousel-feed-only-adset` | Abandoned alternative placement architecture | Not adopted; retain current explicit placement plan and shared creative compiler |

## Delivered workflow

A campaign has one platform plan per platform. A delivery group can be unpublished
inside a campaign that already has a Meta campaign ID. Its draft targeting can be
edited; published targeting remains owned by Meta.

1. **Refresh Meta** updates mirrors on demand, preserving local intent, plan links,
   pushed creative snapshots and unpublished ad sets. There is no scheduled sync.
2. **Add ad set** saves a local delivery group inside the existing campaign.
3. **Review additions** reads current campaign/account/ad-set ownership and status,
   then lists approved ads absent from that set and reports blockers. Unmatched
   platform ads require adoption/linking; they are never silently duplicated.
4. **Publish additions paused** applies that reviewed selection. A missing platform
   ad set is opened through Zernio's `existingCampaignId`; the rest of its ads use
   `adSetId`. A changed delivery review requires reviewing again. This is a delivery
   approval snapshot, not optimistic locking on ordinary edits.
5. Every new provider ID is recorded as it arrives. A partial run leaves a reviewable
   result; the next review skips copies already present. Full pushes, individual
   sends and additions share the campaign's provider-write lock.

A CBO campaign keeps its existing campaign budget. An ABO ad set requires its own
explicit budget; the campaign's total is never reused as an ad-set allocation.
Neither operation activates existing or new delivery. Meta's paused status is
verified; provider errors include recorded partial IDs.

A custom/lookalike audience without a ready linked Meta asset is blocked. Publishing
never substitutes Broad. New groups require explicit locations; source geography is
not guessed. A lookalike cannot be satisfied by linking only its customer-list seed.

## Validation and limits

Migration 0051 was rehearsed on a fresh production-derived Neon experiment branch.
Production duplicate checks found no conflicting plan/platform or active ad-slot
identities. Regression tests exercise CBO budget preservation, explicit ABO budgets,
paused controls, active uniqueness and removed history.

The normal checks, unit suite, capability contracts, isolated DB gauntlet, blocked
publishing verification script and campaign UI review are the release gates.
The gauntlet's old expectation of a receipt for a revoked user was corrected to
match the existing runtime and unit test: authorization precedes receipt access.

No customer Meta objects were created, deleted, activated or edited during validation.
The new ad-set endpoint uses the same Zernio create shape already used when a full
campaign push fills its empty shell. Its incremental orchestration has not been
exercised against a real customer ad set; account/billing/rate-limit errors can still
surface on the first approved publish.

This is additive reconciliation, not arbitrary two-way editing. Drift acceptance,
creative replacement, published targeting/budget editing, and incremental publishing
for Google/LinkedIn/OpenAI remain outside this release. Sets with more than 100 live
ads require Meta-side review; the complete live list must be verifiable before
additions. Existing live objects are never rewritten to make a local plan win.

Porchlit's control has all 11 ads. Its lookalike draft has no platform ID and is
blocked until a valid lookalike and explicit matching geography are selected.
A fresh direct read also verified the control's eight states (AL, FL, GA, LA, MS,
NC, SC, TN), ages 18–65, and 13 explicit placements. Pending groups can store their
own placement plan; individual ad additions normalize the destination set's actual
placements instead of rebuilding creative against a different default. These facts
can be applied to the internal comparison draft without editing the live control.
The existing $83/day budget and live Broad delivery remain unchanged.
