# Ad placements: the confidence matrix

Plan for the next iteration of the Performance ad workflow. Written
2026-09-15 after the chalets-hh reset and the setup page. The decisions here
were made in conversation; this is the record so the build does not have to
re-derive them.

## What we are building

One view, URL-driven like `Continue to Ads` (`?homes=`), where an operator
scrolls a brand's homes as rows and sees each home laid out as ads across
placements, edits copy globally or per cell, freezes the cells that are
right, and pushes when the grid reads green. The view exists to build
confidence before spend. It is not a wizard. Preview, refine and freeze are
states an ad carries, not pages.

## The model, decided

- **Base creative stays in `ad.content`** (`AdCreativeContent`: headline,
  body, CTA, link, `media: AdCard[]`). A global copy edit writes here and
  every undecided cell follows.
- **Per-cell differences live in `ad.placements`**, a new sparse jsonb column
  keyed `"<platform>:<placement>"` (`AdPlacements`, `AdPlacementCell`). A
  selective edit or a freeze writes one entry. Two columns, two write paths.
- **`platform_ad` stays a sync mirror.** It snapshots copy at push and holds
  Meta's `status`, `stats`, `externalId`, rewritten on every pull. Design
  intent never goes in it: the sync writer and the design writer would share
  a row and a pull could clobber a decision. Frozen cells are what the push
  compiles into `platform_ad` rows.
- **Render vs freeze.** A cell with no entry is a live render of the base
  into the placement's spec and stores nothing. Freezing a cell materializes
  its files and copy into its entry (`frozenAt`). Only frozen cells reach the
  library and the push. This is what keeps the library from filling with
  renders nobody chose.
- **Meta-first output, general spine.** `AD_PLACEMENT_SPECS` holds Meta's
  three placements today (FB feed, IG feed, Story). LinkedIn and Google add
  entries with their own crops and copy rules; no schema change.
- **Legacy.** `AdCard.story` was this map with exactly one key. The resolver
  reads it as the `meta_ads:story` cell until an ad is migrated, so nothing
  drawn so far changes appearance.
- **Why jsonb, and when to promote.** A table is the right end state; jsonb
  is the cheaper start and the entry shape is already table-shaped. Promote
  to an `ad_placement` table the first time either bites: a cross-ad cell
  query (fleet coverage, "every frozen story") or two people editing
  different cells of one ad and contending on the column.
- **`kept` on `ad_status`** is unused today. Leave it alone. Frozen-ness is
  per cell (`frozenAt`); ad-level `approved` remains the gate to push.

Read side is `src/lib/ad-placements.ts` (`resolveCell`, `resolveMatrix`,
`coverage`); precedence rules are pinned by `src/lib/ad-placements.test.ts`.

## Iteration plan

Each PR ships independently to `dev`, is verified as listed, and leaves the
existing wall working. Additive first, deletion last.

### PR 1. Model (this draft)

- `AdPlacementCell`, `AdPlacements`, the nullable `ad.placements` column.
- `lib/ad-placements.ts`: spec registry, key helpers, legacy adapter,
  resolver, copy-fit check, coverage.
- Tests for precedence, legacy mapping, fit, coverage.
- No UI, no writes. The types, the lib and the tests are in the tree now; the
  column definition is **not**, on purpose. See "Landing the column".

**Landing the column.** Drizzle's relational reads select every column in
the schema definition, so defining `placements` on `adTable` before the
database has it breaks every `ad` read with "column does not exist". Local
dev points at production Neon through `.env`, which is how this bit us on
2026-09-15: the column was defined, not pushed, and the Ads page failed
against prod. So:

- Add `placements: t.jsonb().$type<AdPlacements>()` to `adTable` only in the
  PR that ships, and merge it knowing the build's `drizzle-kit push --force`
  adds the column on the next production release. A nullable jsonb add has
  no enum prompt, so it is the safe kind; read the push log after release.
- To run that PR locally before release, do it against a Neon branch, or
  push to production only on an explicit go. Never leave the column defined
  in a working tree that talks to a database lacking it.
- Mind the documented race: an older release building after the push would
  drop a column its schema does not know. Merge, then release the same code,
  in that order.

Verify: `bun run check`, `bun test src/lib/ad-placements.test.ts`.

### PR 2. Verbs, singular and composable

Service functions in `ad-set.service.ts`, each idempotent, each one cell:

- `setPlacementCopy(adId, key, patch)` writes copy overrides; a `null` field
  clears one back to the base.
- `setPlacementCard(adId, key, index, { assetId } | { derive: how })` writes
  one card's file for one placement; `derive` generalizes `deriveStory` to
  `derivePlacement(card, spec)` (crop, extend, render).
- `clearPlacement(adId, key)` drops the entry, back to a pure render.
- `freezePlacement(adId, key, userId)` materializes any card still on
  `"base"` via `derivePlacement`, then sets `frozenAt`/`frozenBy`.
- `unfreezePlacement(adId, key)` clears the stamp, keeps the files.
- Global copy edit already exists (edit `content`); it stays.

Migrate `setStory` / `makeStory` / `clearStory` to thin aliases over the
`meta_ads:story` cell so the current wall keeps working, and add a one-shot
`migrateLegacyStories(brandId)` that copies `card.story` into the map.

Agent tools mirror the verbs 1:1 under `adsWrite`, singular (one cell per
call), registered in `domains.ts` and `policy.ts` with `write()`
consequences; run `bun run ai:contracts`. No batch tool.

Verify: unit tests on each verb's precedence effect through `resolveCell`;
existing wall still shows story variants; `ai:contracts` green.

### PR 3. The matrix view

`/app/performance/brands/[brandSlug]/ads` grows the matrix, or it becomes a
sibling route if the wall must stay as is. Behaviour:

- Loads homes from `?homes=` exactly like Continue to Ads; one row per home,
  one column per `AD_PLACEMENT_SPECS` entry, cells from `resolveMatrix`.
- Collapsed by default: one row per home showing `coverage` (frozen /
  overridden / rendered / unfit). Expand a row to its cells. Never render a
  hundred mocks flat.
- Each cell draws with the existing `AdMock` on the spec's `surface`, and
  carries a chip: rendered / overridden / frozen, plus a warning when
  `fit.ok` is false.
- Edit in place, no drawer. Copy on a cell is editable; the edit offers
  "this placement" (writes the cell) or "all placements" (writes the base).
  A card in a cell offers replace / derive. Freeze and unfreeze per cell;
  "freeze row" freezes every cell of a home.
- AI: a command bar over the grid for global edits (writes the base), and
  a per-cell "ask" for one placement (writes the cell). Both are the same
  verbs from PR 2; the model only chooses the target.
- Zero renders persisted by looking. Only freeze writes files.

Verify: browser walkthrough on chalets-hh, typecheck, format; a cell edited
"this placement" changes one column, "all placements" changes the row.

### PR 4. Push reads frozen cells

- The compile step per platform reads `resolveCell` for each of that
  platform's specs and takes only frozen cells. An unfrozen cell is skipped
  with a note, never silently pushed from the base; the operator can freeze
  and re-run.
- `businessKey` per (ad, platform, placement) so a relaunch tells a
  duplicate from a new cell.
- `platform_ad` rows are written from the frozen cell's copy and files.
- Keep (`addBrandAdPreview`) stops being how an ad gets frozen. It remains
  "save this card to the library" for reuse; freezing is `freezePlacement`.

Verify: dry-run push on a frozen set shows exactly the frozen cells;
`platform_ad.headline/body/media` match the resolved cell.

## Not in this iteration

- LinkedIn and Google placement entries. Add them only with real copy rules
  and crops; a placeholder entry would render a Meta card and call it
  LinkedIn.
- Promoting `placements` to a table. Triggers are listed above.
- Studio changes. The matrix reads renders; composition authoring stays
  where it is.
- Retiring `card.story`. It is read through the adapter until every ad is
  migrated and PR 2's aliases have carried a release.
