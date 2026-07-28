# Lead Routing Tiers — BDR embrace vs. automated lifecycle

**Status:** Draft proposal (2026-07-28). Not yet aligned with BDR/RevOps.
**Owner:** Kristian
**Related:** `docs/funnel-abandonment.md`, `cio-abandoned-cart/README.md`, Snowball ICP playbook (141-row ground truth)

## Problem

Today **every wander.com signup** is synced into Outreach at stage "Demand New" with a BDR assigned, via the `amplitude-user-signed-up` webhook → `cio-to-outreach` → `sync.service`. The only gate is "skip @wander.com emails". Enrichment (BigQuery, CIO, Minerva income) runs on every lead but is used to *decorate* the prospect, never to *route* it.

Consequences, measured 2026-07-28 on signups since 4/27 (7,107 profiles):

- **89% (6,289) had been human-touched in Outreach** (moved past "Demand New"), putting them permanently in the CIO "Don't Reach - Outreach" segment (id 752).
- The **marketing-blastable pool collapsed to ~790 of 7,107** — a broadcast to "all recent signups" is structurally impossible without overriding BDR exclusions (see Kyle's July BDR sprint copy, newsletter 1539).
- BDR attention is spread across ~2,000 signups/month regardless of lead value; the median signup (browsing, no checkout, unknown income) gets the same manual embrace as a verified high-net-worth repeat booker.
- "Don't Reach - Outreach" is **sticky forever** — its conditions are historical attribute-change events, so leads never return to marketing even after the BDR closes them out.

## Principle

BDR capacity is the scarcest, most expensive channel we have. Spend it on leads where a human touch plausibly changes the outcome. Everyone else gets a high-quality **automated lifecycle** (onboarding, education, offers) in Customer.io — and stays reachable for broadcasts.

## Proposal

### Tiers

| Tier | Who | Channel |
|------|-----|---------|
| `bdr` | High-net-worth / ICP-fit / high-intent | Outreach prospect + BDR assignment (as today) |
| `lifecycle` | Everyone else | CIO onboarding flow; **no Outreach prospect**; stays blastable |

Tier is written to CIO as a profile attribute (`lead_tier`), so segments, flows, and broadcasts can all key off it.

### Routing signal v1 (cheap, already available in the sync)

All of this data is already fetched in `sync.service` Step 1 before the prospect is created:

1. **Minerva `estimated_income_range`** — the core HNW gate. Threshold TBD after a distribution analysis (see Open Questions).
2. **Booking history (BQ)** — past confirmed bookers → `bdr` regardless of income.
3. **Event escalations** — regardless of initial tier, these upgrade to `bdr`:
   - `order_completed` (already maps to stage "Demand Booked Direct")
   - Hot-lead abandoned cart (2+ checkouts in 5 days — already defined in the CIO "Abandoned cart rebuild" workflow)
   - First abandoned *checkout* (not search — searches stay dark in `funnel_state`)
4. **ICP playbook features** — calibrate the threshold against the Snowball 141-row ground truth before launch; iterate later (e.g. Minerva `ai_score_highest` when available).

Missing enrichment (Minerva down / no match) → default `lifecycle`, upgradeable later by the escalation events. Fail open to automation, not to human attention.

### Where the gate lives

`sync.service.syncLeadToOutreach`, immediately after Step 1 enrichment settles:

```
enrich (BQ ∥ CIO ∥ Minerva)
  → computeLeadTier(leadData, eventType)
  → tier === "bdr"  → create/update Outreach prospect (existing path)
  → tier === "lifecycle" → update CIO attributes only (lead_tier, enrichment backfill); skip Outreach
```

No new services, no orchestrator — one pure function (`computeLeadTier`) plus a branch, mirroring the existing internal-email skip.

### CIO side

- **Onboarding lifecycle flow** for `lead_tier = lifecycle`: the existing Welcome Sequence (campaign 29) is the seed; extend into a proper onboarding/education drip. Owned by lifecycle/marketing, not BDRs.
- **Broadcast recipe fix**: marketing blasts target `lead_tier = lifecycle` (or "not in Don't Reach"), which stays ~90% of signups instead of ~10%.

### Hand-back (fixes the sticky exclusion)

Add an exit path from BDR ownership so leads eventually return to marketing:

- New CIO segment condition or attribute (`outreach_status = closed` / no Outreach activity in N days) that removes leads from "Don't Reach - Outreach" scope, OR
- Rebuild the exclusion segment on current state (`outreach_stage_id` in active-stage set) instead of historical attribute-change events.

Requires agreeing the states with the BDR team; the Outreach→CIO webhook already syncs stage changes, so no new plumbing.

## Rollout

1. **Shadow mode** — compute and log `lead_tier` on every signup for ~2 weeks; write the attribute to CIO but don't gate the Outreach sync. Zero behavior change.
2. **Measure** — tier split, income distribution, would-have-been BDR queue size vs. today, overlap with actual BDR conversions (did BDR-touched `lifecycle`-tier leads ever book?).
3. **Align** — review with Serrelle/BDR team + Kyle: threshold, escalation rules, hand-back policy. Frame: *smaller, richer queue* — not less work, better leads.
4. **Flip the gate** — new signups only; existing Outreach prospects untouched.
5. **Lifecycle build-out** — onboarding drip for the `lifecycle` tier (separate project).

## Open questions

- Income threshold: need the distribution of `estimated_income_range` across recent signups (BQ backfill table from the `minerva_income_backfill_daily` cron is a starting point) and Minerva match-rate (what % of signups even get income data?).
- Does abandoned-*search* (vs. checkout) ever justify BDR escalation, or is that strictly lifecycle territory? (Today searches never reach Outreach — proposal keeps it that way.)
- BDR-tier volume target: what daily queue size does the BDR team actually want? Pick the threshold to hit it.
- What happens to the ~6.3k already-touched signups — bulk hand-back after N days of Outreach inactivity, or grandfather them?
