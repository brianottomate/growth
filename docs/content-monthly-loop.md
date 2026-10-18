# The monthly content loop

> Historical workflow below: the original `plan_import` queue was retired in #213. Current workbook ingestion, editable mapping and atomic application to native drafts are documented in [Content workbook import](content-workbooks.md). Initiatives and series own planning. The old import IDs and July state below are historical records.

How a month of social content goes from strategy to calendar in the growth
back-office — without anyone transcribing a spreadsheet. Built 2026-07-02/03;
first live month: August 2026.

## The loop, end to end

```
/channels                    /content · /calendar            Claude.ai                /content
cadence_target  ──generate──▶  slot content_posts  ◀──match── workbook paste ──review──▶ filled calendar
mix_target         slots        (empty, dashed)                (the team's              (approved ideas
(strategy)                                                      monthly plan)            + captions + dates)
```

1. **Set targets** — per-channel cadence (`cadence_target`: channel × archetype
   × count/period) and content mix (`mix_target`: pillar % — brand default with
   optional per-channel overrides via `channelId`). Baseline (2026-07-03) is
   the team's own sheet legend — platform guide + content-mix ratios — with
   reconciliations documented in `scripts/seed-strategy-targets.ts`; edit via
   /channels or the cadence router. `/channels` shows observed-vs-target, and
   its per-brand **"Suggest updates"** runs the AI proposal engine
   (`cadence-suggest.service.ts`): peer cadence (Airbnb/Rimowa-class) anchors
   volume targets, own Zernio engagement anchors format/mix — under-execution
   alone never lowers a target. Proposals are ephemeral; Apply writes through
   the normal target procedures.
2. **Generate the month** — "Generate slots" (on /content and /calendar, plus
   per-month **Generate/Evaluate CTAs** on the yearly calendar's month cards) expands
   targets into empty `status:"slot"` content_posts (`slotKind:"cadence"`, one
   owned spot each), pillars allocated from the mix, dates spread across the
   month. Preview-first; **idempotent top-up** — filled/claimed slots still
   count, so re-running after target edits only adds the difference.
   Service: `slot-generate.service.ts`; script: `scripts/generate-month-slots.ts`.
3. **The team plans in Claude** — unchanged workflow. They export the workbook
   (TSV with per-platform captions, series, ManyChat keywords, owners).
4. **Import** — "Import plan" on /content: paste → deterministic TSV parse
   (quote-aware tokenizer, fuzzy headers) → ONE AI call that **clusters rows
   into ideas** by row reference (the same concept posted to IG and TikTok on
   adjacent days is one idea, two spots; captions never round-trip through the
   model) → deterministic matcher scores ideas against open slots (0.60 date ·
   0.25 pillar · 0.15 archetype, global greedy) → persisted `plan_import` +
   `plan_import_item` rows. Services: `plan-import-parse.service.ts`,
   `plan-import-match.service.ts`.
5. **Review** — /app/content/import/[importId]: per-idea decisions
   (accept / accept-but-refine / reject), bulk accept ≥75% confidence, a live
   gaps rail (open slots struck through as decisions claim them). Decisions
   persist; **nothing writes to the calendar until "Apply N accepted"**.
6. **Apply** — accepted ideas fill their matched slots in place (multi-platform
   ideas consume several slot shells; siblings re-point to the primary and the
   empty shells soft-delete). `accepted` → status `approved`; `accepted_refine`
   → `draft` + an auto-comment. Ideas with no slot are created fresh. Sheet
   captions land per-spot as `platform_post.text`; ManyChat keyword → `ctaKeyword`;
   KPI → `kpi`; owners resolve by member-name match (never guessed).
   Service: `plan-import-apply.service.ts`.

The gaps rail after review is the strategy feedback: lanes the workbook never
covered (LinkedIn, Pinterest…) stay visibly open — either fill them, or change
the targets.

## Where things live

| Piece | Path |
|---|---|
| Targets schema | `src/server/db/cadence-schema.ts` (mix override = nullable `channelId`, partial unique indexes) |
| Import schema | `src/server/db/plan-import-schema.ts` (items = clustered ideas, payload jsonb) |
| Slot generator | `src/server/services/slot-generate.service.ts` + `cadence.generateMonthSlots` |
| Parse / match / apply | `src/server/services/plan-import-*.service.ts` |
| Router | `src/server/api/routers/planImport.router.ts` |
| UI | `src/app/app/content/GenerateSlotsDialog.tsx`, `ImportPlanDialog.tsx`, `import/[importId]/` |
| Fixture + probe | `fixtures/workbook-august-2026.tsv`, `scripts/probe-workbook-import.ts` (dry-run, zero writes) |

## Operational notes & gotchas

- **Probe before prompt changes**: `bun --conditions=react-server run
  scripts/probe-workbook-import.ts` replays the August fixture and prints
  parse/cluster/match/gap tables + invariants (no double-claimed rows, no lost
  rows, captions present). The acceptance case: Aug 6 IG + Aug 7 TikTok
  "Day vs night" must cluster into one idea.
- **Slot census drift**: filling a slot with a different archetype than it was
  minted for shifts the platform|archetype census — the next generate re-run
  tops the original archetype back up (+1). Intentional; check with
  `bun run scripts/generate-month-slots.ts <y> <m> --dry`.
- **Re-import**: a second paste of the same month matches only leftover slots
  and flags possible duplicates by title; full diff/merge is future work
  (`plan_import.rawText` keeps the paste verbatim to enable it).
- Rejected items are remembered; slots they matched stay open.
- Old slots minted by Reshuffle/moments are `slotKind: "anchored"|"freeflow"`
  and invisible to the cadence census — they coexist.

## Appendix: ManyChat keyword library (from the team's sheet legend)

The comment-trigger keywords the captions use (`content_post.ctaKeyword`):

| Keyword | Delivers | Funnel goal | Content type |
|---|---|---|---|
| ESCAPE | Curated seasonal property collection | Consideration | Timely Travel / Inspiration reels |
| GUIDE | Destination itinerary PDF/link | Lead capture + saves | Travel Discovery guides |
| WANDER | Featured property of the week | Booking intent | Property showcase reels |
| WORK | WFA-friendly home list | Mid-week booking | Remote Work Reset series |
| DRIVE | Road-trip route guide | Email capture | Worth the Drive series |
| PRICE | Weekend pricing breakdown | Objection removal | Luxury Travel, Real Budget |
| COMPARE | Wander vs hotel/Airbnb doc | Conversion | Wander vs. The World series |
| LOCAL | Locals' Edit guide for nearest property | Saves + loyalty | Locals' Edit series |
| FIRST | Early access to new property drop | Loyalty + booking | What's Launching Soon series |

Strategy baseline: the cadence/mix targets seeded by
`scripts/seed-strategy-targets.ts` follow the sheet's platform guide and
content-mix ratios (reconciliations documented in that script's header).

## Current state — 2026-07-03 (pre-weekend snapshot)

- **Targets**: 15 cadence rows + brand mix + 6 channel overrides live in the DB
  (sheet-legend baseline). All lanes slot-planned — the `NOT_SLOT_PLANNED`
  exclusion set is empty (X texts included per Kristian).
- **August 2026**: 61 original slots; import `imp_Jrsum7TzUpS8p6by` (the real
  August workbook) has **2 applied · 1 rejected · 18 pending review** at
  `/app/content/import/imp_Jrsum7TzUpS8p6by` (or Import plan → Recent imports).
  A Generate re-run would top August up +~40 for the newer lanes — deliberate
  decision pending.
- **September 2026**: NOT generated. Preview shows ~125 slots across 8
  channels. One click in Generate slots when ready.
- **Peer data**: fresh Instagram scrapes (2026-07-03) — Airbnb 12, Rimowa 12,
  Outsite 11, Vrbo 12 posts. "Suggest updates" hasn't been re-run since; the
  first fresh-data run is worth a look.
- **Known next builds**: peer pillar-classification pass (peer mix comparisons
  currently read as unsorted), re-import diff/merge, per-channel targets in
  the Evaluate month report.
