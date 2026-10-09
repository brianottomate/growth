# Model-first simplification audit

Audited and implemented in PR #653 on 2026-10-09. The evidence below records
the pre-change behavior. This is a source-level audit of Growth's cadence, media,
home photo ordering, Performance delivery attribution and billing, and blog
artifact loading. A production-derived disposable Neon branch was inventoried and migrated;
production itself was not changed. This is not an exhaustive review of every domain. Findings below describe reachable code behavior or structural
risks; they do not establish that a particular customer encountered them.

The question is: **what missing identity, relationship, ownership boundary or
state distinction makes this compensating code necessary?** Fix that cause,
then remove the extra code. A short handler is not an improvement if it changes
the meaning of the data or hides failures.

## 1. Cadence target identity and scope

Evidence:

- `src/server/api/routers/cadence.router.ts`, `setCadenceTarget`, reads a row by
  channel, archetype, template and period, then updates or inserts it. Its lookup
  omits `seriesId` and `deletedAt`.
- `src/server/db/cadence-schema.ts` and `drizzle/0000_initial.sql` give
  `cadence_target` ordinary indexes, but no unique key for a target's domain
  identity. The handler's comment about a nullable unique index is stale.
- `src/server/services/cadence-target.service.ts` distinguishes channel baseline
  targets from series targets. Its replacement writer excludes series rows.
- Both `BrandStrategyClient.tsx` and `SuggestTargetsDialog.tsx` use the individual
  target setter, while AI strategy saves use the replacement service.

Consequence: editing a channel baseline can select a matching series target or
a deleted row. Concurrent first saves can insert two targets rather than leave
one target containing the latest value. The two writer paths disagree on scope.

Simpler model: explicitly define target identity across channel, archetype,
template, series and period, and decide how deleted targets participate. Make
the baseline setter target only baseline rows. Enforce that identity in the
database and use an atomic last-write-wins upsert for individual edits. Keep the
complete-set replacement operation when the operator submits a whole strategy.

Before changing: inspect duplicates and existing series/template rows; resolve
which row survives deliberately, handle nullable keys explicitly, and rehearse
the migration on a disposable Neon branch. Then delete the read/update/insert
branching and stale comment. A focused regression should protect baseline edits
from modifying series targets; this is lost operator work, not a helper test.

## 2. Source image identity has two representations

Evidence:

- `src/server/services/media.service.ts`, `importRemoteImage`, records an imported
  image's source in `metadata.sourceUrl`; it does not populate
  `discoveredSourceUrl`.
- `src/server/services/media-review.service.ts`, website discovery, first looks
  up `metadata.sourceUrl`, then inserts a suggestion with both metadata and
  `discoveredSourceUrl` and uses `onConflictDoNothing`.
- `src/server/db/media-schema.ts` enforces uniqueness on brand plus
  `discoveredSourceUrl`, not on the metadata field. `findImportedImage` also
  looks in metadata, with ready/approved/non-deleted filters.

Consequence: the preflight lookup and unique constraint are not redundant. They
cover different record shapes. Removing the lookup alone would allow discovery
to suggest an image already imported into the library.

Simpler model: choose a canonical typed field for source provenance and a clear
reuse rule. A source URL is not automatically the identity of immutable bytes:
remote content can change, and operators may intentionally import a fresh copy.
Keep raw provider metadata as provenance, not a competing lookup authority.

Before changing: inventory existing imports/suggestions and URL collisions;
decide whether reuse applies only to discoveries or also to ready library assets,
and how deletion/rejection affects it. Backfill the chosen representation, move
readers to it, then remove the JSON lookup and redundant writes. Do not apply
source-asset uniqueness to carousel occurrences.

## 3. Home photo identity also owns carousel placement

Evidence:

- `src/server/db/home-schema.ts`, `home_media`, gives one row per home/asset or
  home/source URL, and puts `role` and `sortOrder` on that same row.
- `src/server/services/homes.service.ts`, `setHomeCarousel`, loops through the
  submitted list and calls `setHomeMedia`. Repeating a photo updates the same
  row's position twice. The returned count counts submitted entries, not the
  number of stored placements.
- The list replacement performs multiple writes without one transaction.

Consequence: `[A, B, A]` cannot be represented by this model; A retains only its
last position. A photo's role also conflates gallery/exclusion decisions with
membership in a specific ordered carousel. A failure partway through replacement
can leave partial ordering.

Simpler model: keep per-home photo decisions separate from ordered placements.
Store the carousel as an ordered list that permits repeated asset references, or
as occurrence rows identified by carousel and position. Replace it atomically.
Retain brand/home access checks and photo decisions independently.

Before changing: trace gallery, hero, exclusion and renderer consumers; preserve
existing decisions while migrating order. Remove the per-photo placement upsert
loop after readers use occurrences. A regression for `[A, B, A]` is justified
because the current representation loses submitted operator work.

## 4. Billing-cycle membership creates synthetic campaigns

Evidence:

- `src/server/services/performance.service.ts`, `attachCampaignToCycle`, creates
  a `Performance · <period>` campaign when a platform campaign has no planned
  campaign, solely to carry `performanceCycleId`.
- The code recognizes these synthetic campaigns using a generated slug, reuses
  them, checks sibling platform campaigns on detach, and archives empty wrappers.
- Attaching a platform campaign that already has a planned campaign assigns the
  cycle to its parent campaign, so the relationship is parent-wide rather than
  specific to the selected platform campaign.

Consequence: a reporting relationship needs unrelated campaign creation and
cleanup. Selecting one delivery can affect its siblings through their parent.
The model makes campaign strategy and report membership share one relationship.

Simpler model: model delivery-to-cycle membership directly, using a scoped FK
or relationship table according to whether one delivery can span cycles. Derive
report groupings without creating a campaign that has no strategic purpose.

Before changing: establish intended period/overlap behavior and spend ownership,
inventory wrappers and real campaigns, and prevent double attribution during
backfill. Delete slug classification, wrapper lifecycle and sibling cleanup only
after reports read direct memberships. Provider campaigns must remain untouched.

## 5. Payment facts have two writable owners

Evidence:

- `src/server/services/performance-settings.service.ts` saves brand JSON first,
  then calls `markCycleLinePaid` when a card payment state changes.
- `src/server/services/performance-billing.service.ts`, `markCycleLinePaid`, saves
  cycle payment timestamps and writes the brand JSON back without invoking the
  settings service, explicitly to avoid calling back into itself.
- `src/server/services/performance.service.ts`, `updatePerformanceCycle`, can
  also change those payment timestamps. It does not use the same card sync path.
- These settings/cycle writes are separate operations. A failed later write can
  leave an earlier one saved. An unchanged card value skips the write-through,
  so repeating that save is not a guaranteed repair.

Consequence: the same apparent payment fact has multiple writers and a manual
two-way synchronization protocol. Brand-level card state also lacks the month
that gives a cycle payment its meaning.

Simpler model: let the billing cycle own payment facts and derive the card's paid
state for an explicit current period. Keep independently meaningful workflow
states, such as not invoiced, explicit rather than conflating them with payment.
Use one payment command for writes; preserve recorded business-stage progression
as a separate decision if it intentionally does not reverse with payment undo.

Before changing: map all UI/report consumers, define period rollover, and reconcile
conflicting values using business meaning rather than whichever timestamp looks
newest. Remove duplicate payment flags and reverse synchronization after readers
derive their views from the canonical owner. Historical cycle amounts are valid
snapshots, not automatically redundant copies of current account terms.

## Related cleanup: failed artifact loading looks like absence

`src/server/services/blog-workbench/artifacts.ts` catches all filesystem and JSON
errors and returns null. `run.ts` also treats every grounding-cache read/parse
error as a cache miss and crawls again. Missing, malformed and operationally
unreadable records have different meanings. Catch expected absence explicitly;
surface the other failures. This does not require another table or framework.

## Implemented model and removed code

- **Cadence:** a `UNIQUE NULLS NOT DISTINCT` key covers channel, archetype,
  template, series, period and deleted timestamp. Individual baseline saves use
  an atomic upsert with null series/template/deleted fields. Series targets stay
  separate. The migration keeps the latest updated duplicate before adding the
  key; complete strategy replacement remains an intentional separate operation.
- **Media:** `mediaAsset.sourceUrl` is the typed source authority. The physical
  `discovered_source_url` column is retained so existing deployed queries remain
  valid during rollout. The migration backfills imported provenance and removes
  the duplicate JSON key. Website suggestions are unique by brand/source; fresh
  remote imports may share a URL. Discovery can still reuse an existing approved
  library asset. JSON lookup fallback and redundant source writes are gone.
- **Homes:** `home.carousel` owns an ordered list of occurrences, replaced in one
  write. `home_media` still owns gallery/exclusion decisions. Existing positions
  are migrated in order. UI, home reads and starter-ad reads preserve `[A, B, A]`.
  Asset references must belong to the home's brand. The per-photo placement loop
  and its conflicting role ownership are gone.
- **Delivery:** `platform_campaign.performance_cycle_id` owns each delivery's
  report membership. Attaching one delivery updates that row and recomputes old
  and new cycle spend atomically, without moving its parent or siblings.
  `campaign.performance_cycle_id` remains the default for new planned deliveries
  and the explicit bulk-assignment command; it is not the reporting authority.
  Reports derive campaign groupings from member deliveries. Synthetic wrapper
  creation, slug recognition and detach cleanup are removed from runtime. The
  migration detaches and archives only wrappers matching both their exact slug
  and historical description. It makes no provider changes.
- **Payments:** cycles own paid timestamps plus explicit Open/Not invoiced
  states. Cards derive these facts for their selected `billingPeriod`, defaulting
  to the UTC current month. A card payment edit updates that cycle; brand JSON
  stores the other workflow states. Reverse synchronization is gone. Existing
  cycle receipts take precedence in migration; an explicit legacy Paid value
  lacking a receipt carries its recorded brand edit timestamp. Business-stage
  advancement remains a separate monotonic decision. The writer resolves one
  cycle and updates its payment fields once within the settings transaction,
  without recursive dispatch or an internal cycle ID in the public input.
  Commercial settings on the brand and billing account remain independently
  editable; automatic term synchronization and the card's account overlay are removed.
- **Artifacts:** only ENOENT means absence. Malformed JSON, permission and other
  operational errors surface instead of becoming cache misses or empty success.

## Data rehearsal and validation

The initial production-derived inventory contained 18 cadence targets (3 series,
no duplicate identities), 548 metadata source URLs, 6 discovery URLs, 3 stored
carousel placements, no synthetic wrappers, and 4 JSON payment records. All four
payment records had a matching account/month; all three Paid records already
had cycle receipts. These are a point-in-time rehearsal inventory, not permanent
assumptions about production data.

`drizzle/0023_model_first_identity.sql` was applied to a fresh copied Neon branch,
`experiment/verify-model-first-653-final`. All migrations were also tested on a
fresh disposable local PostgreSQL database, including repeat no-op execution
and rollback on failure. Normal check, unit and AI contract gates apply.

Run the consequential live boundary checks only on a migrated experiment:

```sh
bun run db:experiment verify-model-first-653-final -- bun --conditions=react-server scripts/database/verify-model-first.ts
```

The script rejects ordinary connections. It checks concurrent baseline saves
without overwriting series, repeated carousel placements and foreign-brand
asset rejection, independent platform delivery attachment and its wire contract,
and shared card/cycle payment ownership. Its local-only campaign fixtures remain
in the disposable copy. No provider campaigns or sends are touched.

Automatic GitHub previews use the unchanged production schema. Review these
changes through an explicit experiment deployment:

```sh
bun run preview:experiment verify-model-first-653-final --migrate
```

Permissions, approved delivery snapshots, provider send/job replay protection,
and legitimate immutable history remain purposeful boundaries. Nullable fields
for genuinely unknown intake data, platform mirrors separate from authored
intent, and per-cycle financial snapshots are not evidence of an awkward model
by themselves.

## Related work merged in PR #655

### Dashboard billing and the Creative / Delivery handoff

Management fee and agreed monthly ad spend remain contract facts on Performance
settings. A receipt belongs to a specific account and billing period on
`performance_cycle`: management and client media charges have separate paid dates.
The dashboard derives Current and Upcoming payment indicators from those records.
It does not create cycles or infer payment from an unscoped card-state flag.

Removed periodless payment indicators from card status chips and the expanded
commercial sections. PR #653 consolidates payment edits on the selected billing cycle. An absent cycle, an unknown
charge, a zero charge, an open charge, and a recorded payment stay distinguishable.

The existing `launch_prep` stage keeps its stored identity and is renamed Creative.
Delivery is a new stage. Existing clients stay in Creative until an operator moves
them; creative approval and campaign readiness are not guessed from other facts.

### Shared manual pipeline ordering

Each brand's Performance settings owns its stage and one string fractional rank
within that stage. Alphabetical order is a view, not a second writable order.
The move API takes a destination neighbor and computes a rank against the full
organization-scoped column, including cards hidden by search or Mine. Existing
unranked columns start alphabetically and receive initial ranks on the first move.
Moves atomically save stage and rank; row locks serialize simultaneous insertions
without rejecting an operator's edit. Ordinary settings edits now merge only the
submitted JSON fields, preserving concurrent moves and unrelated card-state edits.
A stage changed through the settings editor clears its previous column rank.
No database migration is required: the rank lives in the existing settings JSONB.

## Archetype-owned voice (2026-10-09)

The previous direction stored an archetype key without prompt behavior and asked
generation to independently select voice dials. The archetype dictionary now owns
role instructions and default voice. Saved `voice` values are explicit overrides;
null derives the three axes from the selected archetype. Generation preserves
existing overrides rather than silently replacing operator choices.

Read-only inventory found 15 saved directions, all with two-axis voice objects:
4 Guide, 2 Caretaker, 1 Expert and 8 with no archetype. Existing choices remain
valid; a missing warmth value derives from the selected archetype, or Balanced
when none is selected. No global backfill is needed and no schema migration is
required for the expanded JSON contract. The owning formatter resolves defaults
for both UI and prompts. New generated revisions drop obsolete archetypeReason
text; existing text is retained only for compatibility with saved briefs.

## Compact persona prompt context (2026-10-09)

Personas do not need independently meaningful needs, decision-criteria and
objection arrays to supply creative context. The owning profile now stores
`icon`, `motivation` and `pills`; the UI and prompt consumers receive that shape.
Generation combines the strongest concerns and priorities into 2–5 natural
phrases and picks a visual icon. Evidence notes have been removed as requested.

The read-only production audit found 22 non-null legacy profiles, none compact,
with at most 15 combined phrases. Migration 0024 preserves all phrases in order
and removes the old fields without changing IDs or audience references. A
temporary compatibility reader lives at the JSONB database boundary, rather
than adding fallback chains to each UI or prompt consumer. Remove it after the
cutover and retirement of old writers. Existing unstructured persona prose and
null profiles remain valid; no synthetic profile is created for them.
