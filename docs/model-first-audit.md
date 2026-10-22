# Model-first simplification audit

## Performance acquisition form identity (2026-10-22)

WanderOS and Performance acquisition share Wander's Facebook Page, so Page or
brand identity alone cannot select their sales workflow. The two existing
Performance beta form ids now select a separate normalization and delivery path;
form names and the model's guesses never choose the funnel. Graph and Zernio
share the Meta leadgen id and its delivery ledger, rather than manufacturing a
second Performance application or brand for the same submission. The website
continues to own its separate application receipt. HubSpot remains the contact
projection, with Jenny explicitly assigned; no duplicate lifecycle/rota is added.
No database identity or schema change is needed.

## Newsletter forwarding identity (2026-10-19)

The brand owns its opaque, case-sensitive ID. The newsletter recipient embeds
that ID verbatim, but `parseInspirationToken` lowercased it before lookup. A
real Indie Campers forward was received by Resend and silently skipped because
the changed ID matched no brand. Preserve the token at the inbound boundary;
do not add fuzzy sender matching or case-insensitive ID fallback queries. The
address builder and parser now share `src/lib/inbound-email.ts`, with a
round-trip regression test for mixed-case IDs. Existing addresses and stored
identities require no migration.

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


## Campaign Search keyword ownership

Search keywords belong to configured Google delivery groups. Removed the campaign-level fallback input and synthetic fallback group from the compiler and preview. Every configured Search group must have keywords before push; missing groups are surfaced rather than silently omitted. Legacy JSON keyword values remain readable in stored settings but no longer affect compilation.

Google standalone campaign creation accepts daily budgets through the current provider integration. Lifetime drafts must be edited explicitly; never silently convert a total to a daily spend amount. Meta retains its supported lifetime budget option.

### Google conversion bidding contract

Verified 2026-10-09 against https://docs.zernio.com/ad-campaigns/create-standalone-ad and https://docs.zernio.com/platforms/google-ads/conversions. Google Search/Display create accepts traffic, engagement and awareness as provider goals, but explicitly supports campaign bidStrategy LOWEST_COST_WITHOUT_CAP for Maximize Conversions. Local conversions intent maps to provider goal traffic plus that explicit strategy on campaign creation only. Attached groups/ads inherit bidding and do not resend bidStrategy. Campaigns retain Google account-default conversion goals; selecting a specific booking action is a separate integration, and tracking readiness is not yet verified.

### Geographic presence versus destination interest

Verified 2026-10-09 against https://docs.zernio.com/platforms/google-ads/create-ads#location-targeting-type.
Audience geography means the intended location of people; descriptions/personas own
interests in destinations. Google campaign geography is the executable restriction,
shared by all its ad groups. We previously omitted locationTargetingType, allowing
Google's presence_or_interest default to reach people outside those locations.
New Google campaign creation now explicitly sends presence (in or regularly in the
selected places); attached groups/ads inherit it and never resend this create-only
field. Existing provider campaigns require a separately authorized targeting update.
No competing interest-location field was found in the current audience or delivery
schemas, so no data deletion or new selector is needed. Countries/states/regions/cities
remain supported; ZIP and coordinate-radius extensions are documented at the schema
and provider boundaries for future implementation.
## Archetype-owned voice (2026-10-09)

The previous direction stored an archetype key without prompt behavior and asked
generation to independently select voice dials. The archetype dictionary now owns
role instructions and default voice. Saved `voice` values are explicit overrides;
null derives the three axes from the selected archetype. Generation preserves
existing overrides rather than silently replacing operator choices.

Creative direction now accepts only the current strict schema: all three voice axes when voice is overridden, no obsolete archetypeReason. The operator requested purging invalid records; 15 outdated directions were cleared across 51 brands on 2026-10-09. Null direction remains an explicit unset state; archetype defaults remain valid when voice is null.

## Compact persona prompt context (2026-10-09)

Personas do not need independently meaningful needs, decision-criteria and
objection arrays to supply creative context. The owning profile now stores
`icon`, `motivation` and `pills`; the UI and prompt consumers receive that shape.
Generation combines the strongest concerns and priorities into 2–5 natural
phrases and picks a visual icon. Evidence notes have been removed as requested.

The initial migration audit found 22 old-format profiles. A subsequent audit found 26 non-null profiles: 4 compact, 6 old profiles accepted by the temporary reader, and 16 unreadable profiles with an additional icon on the old needs/criteria/objections shape. Those 16 affected Downtime Vacation, Zion Stays, Hollyhock Suites, Seasons 4, Porchlit Properties and Chalets Hocking Hills. The operator requested deleting all personas; all 29 records (including null profiles) were purged and persona references were cleared by database foreign keys. The compatibility parser was removed. Migration 0024 remains immutable historical SQL; its test verifies the migration without relying on a runtime compatibility parser.

The same strict-format audit inspected all 51 brands and 34 campaign audiences. No story text or campaign audience failed its current schema; those records were retained. Story is plain text, not an old structured variant. Audience geography already uses its current schema. No legacy format reader was found in either owning path.

## Brand operational tasks (2026-10-14)

The Performance tracker stored fixed operational statuses inside
`brand.performanceChecklist.values`. It had last-editor stamps but no independent
item identity, creator, assignee, deadline, ordering or client-specific additions.
Those statuses now belong to `brand_task`; the old status editor and writer keys
are retired. Commercial tracker values and the separate onboarding milestones
keep their existing owners. Historical JSON is retained as an archive, not a task
read fallback.

The only new table is `brand_task`. Category values and default task definitions
live in `src/lib/brand-task.ts`; tags are a normalized string array with suggested
values, open to additional operator-entered strings. Task people reference users;
organization membership supplies assignment eligibility through the same check as
brand staffing. Template instances have a unique brand/template key, including
removed rows, so repeated client initialization cannot overwrite edits or revive
removed items. Reads never initialize or reconcile tasks.

The migration initializes existing clients and brands with saved legacy task
statuses, preserving completion and last-editor attribution where known. Migration
creators remain unknown rather than treating the last editor as the creator.
A production-derived disposable branch audit found 14 active clients and no saved
legacy tracker values. Migration rehearsal produced 154 default tasks. New client
relationships and their tasks commit together. Templates are copied values;
ordinary client edits do not propagate later template changes.

Client tasks appear on the client Overview and brand Performance page. They support
inline titles, status, category, one assignee, date-only deadlines, notes, tags,
ordering, removal with Undo, and open/mine/overdue/tag filtering. Completing a task
never changes billing, access verification, or provider delivery state. The legacy
launch-checklist API still owns onboarding milestones; it does not manage tasks.

### Performance onboarding and stage handoffs (2026-10-15)

WanderOS import owns the initial preparation sequence: inventory, Featured homes,
destinations, missing personas, Ad Studio drafts, one standalone broadcast and
catalog preparation. A broadcast is a content post with one newsletter platform
post and no series. Existing persona and creative entities remain authoritative;
a workflow records their IDs and completion, rather than creating shadow copies.
Older completed imports advertise missing preparation steps and resume those only,
preserving completed catalog work and operator-corrected photos.

Connection cards derive profile ownership, explicit shared connection ownership,
allowlisted Meta destinations, tracking defaults (including manager inheritance)
and published WanderOS pixel configuration. No editable readiness booleans are
added. Unknown provider/site health stays unknown. Published pixel configuration
is installation evidence, not proof of event delivery to Meta.

Creative and Delivery entries enqueue a workflow receipt in the same transaction
as the stage write. A row lock makes the before/after comparison authoritative;
reorders and repeated saves do not create new handoffs, while re-entry does.
Only queued notifications can be recovered automatically; an ambiguous send is
never replayed. The existing workflow activity view exposes failures.

Public intake slugs remain readable without exposing private connection or DNS
credentials. Shared onboarding links now prefer the brand token; only token-based
prefill includes the private Growth Connect and active email/DNS links.

Ad billing readiness derives from Zernio's Meta-only billingStatus and payment
account states for the explicit allowlisted destination. Missing billing and
unreadable billing are distinct; an active connection never implies a payment
method exists. Unsettled, pending settlement, grace period and payment-risk
states override funding presence. Cards and stage handoffs share this view;
client-owned setup requires confirmed payment-method presence. This verifies
presence only, not whether Meta will accept a charge. No billing details or
editable readiness flags are stored.
Provider-declared unselectable accounts also block the Meta readiness line and
setup summary, independently of funding presence. Clients sharing an explicit
destination share its provider read within one load to avoid duplicate quota
usage; a later page load or handoff reads billing again.

### Sites Performance booking attribution (2026-10-15)

Amplitude owns event history; Growth owns the Performance booking projection.
The unshipped generic `amplitude_event` archive was replaced with one
`performance_booking` per backend booking ID. Existing website → brand → live
Performance-account relationships own customer assignment; replay cannot change
that ownership. Website IDs are not unique across brands today, so ambiguous
matches are explicitly discarded rather than selecting an arbitrary customer.
Only client bookings with Meta/email evidence are retained. Provider retries
reuse booking identity, and `after()` enriches the durable booking rather than
requiring an event inbox. Existing workflow authentication is reused. Current
name-based marketing tags support possible attribution; exact scoped campaign
or sent-message identifiers can confirm a matching touch. There is no automatic
backfill, lifecycle send or report publication in this change.

### Meta connection completion (2026-10-15)

Meta OAuth completion now owns the follow-through from a granted client profile
to an explicit destination and tracking defaults. A saved account choice or a
sole reachable account can be selected; a multi-account grant, deny record or
another brand's account becomes a CSM review task. Discovery is not reporting
permission. The allowlist entry is checked before pixel reads/writes. The
provider-selected Page is carried into Growth without a separate manual copy.
Billing remains a live provider fact, with missing/unknown states creating a
follow-up rather than a cached "confirmed" field.

Existing saved/site pixels are reused when available; a single available pixel
is selected, multiple pixels require review, and an empty successful list can
create one. A durable workflow receipt is committed before a non-idempotent
pixel create; an ambiguous/failed/previous attempt is never replayed. A later
successful provider list can recover an already-created pixel. The pixel ID is
recorded in the destination's existing tracking defaults. Installation remains
a CSM task assigned from the client's csLeadId, including the site and pixel
IDs. Stable task keys prevent repeated callbacks duplicating the handoff without
overwriting operator edits or completion. No site setting is changed automatically.


### Performance booking alerts (2026-10-15)

The booking remains the business record and Amplitude owns event history. ChatGPT
source/referrer evidence joins Meta/email as a retained candidate, without implying
Performance caused the referral. Slack delivery belongs to the existing workflow-run
model: a deterministic booking + confidence run identity covers both concurrent
webhook retries and replays after completion. No extra notification table or columns
are needed. Reuse the existing claim, failure visibility and queued-run recovery;
never automatically replay an ambiguous provider send. Notifications project the
stored booking and re-check its brand/workspace before dispatch.

### Private intake setup checks (2026-10-15)

The private intake token identifies the client; a public brand slug cannot read
setup evidence. The intake status projection now derives Meta account readiness,
billing and published-site pixel installation from the existing Performance
connection summary, Google authorization from the brand's exact Zernio profile,
and email authentication from the email/DNS service. It replaces workspace-wide
Page discovery and brand-name matching. Unknown provider evidence stays unknown;
no editable readiness flag or second verification authority is introduced. The
check does not select accounts, create pixels, stamp operator verification, or
send messages. Client responses omit provider IDs, tokens and DNS records.

### Client Meta account choice (2026-10-15)

The brand's existing Meta destination remains the authoritative account choice.
The private Connect link now lets the client select from its own live Zernio
profile grant. The account registry still denies explicitly blocked accounts
and accounts owned by another client; the same selection rule validates the
picker, callback and completion. No name/AI guess or duplicate choice column
is introduced. Saving continues the existing billing/pixel setup and closes
the account-choice task; unresolved Page, billing and tracking work stays visible.

Signed initial-ad-sync events route through the uniquely owned profile and a
durable workflow identified by provider event ID. The worker verifies the live
connection/profile relationship, preserves a saved client choice against delayed
events, and accepts a sole provider-scoped account only after live reachability
and registry checks. Multiple synced accounts never become a blanket allow.
Recovery dispatches only queued work; existing pixel-create receipts prevent
replayed asset creation. Callback channel aliases/duplicate query values are
handled so successful authorization cannot skip completion. Connect distinguishes
authorization from destination selection and installation readiness.

## Reusable seed audiences (2026-10-15)

The local Winter Park/30A/AR experiment exposed a missing identity: an audience seed
was either transient CSV rows or an email snapshot hanging from a campaign. A seed
now owns its reusable typed recipe; a snapshot owns frozen hashed membership and
source evidence; a platform asset points to that snapshot and a lookalike points
to its local parent. Provider destination belongs to the existing `ad_account`
registry, not mutable provider JSON. Generic audience create/sync normalize that
account relationship at their boundary. No synthetic campaigns or personas needed.

Existing email recipient snapshots and legacy assets are not backfilled into fake
seed histories. The old campaign upload UI remains a compatibility entry point;
new assistant/MCP/API work uses `seedRead`/`seedWrite`. Do not add another seed uploader
or duplicate the new snapshot FK in JSON. Follow-up UI adoption can retire that
campaign-only path once its consumers have moved. See [seed audiences](seed-audiences.md).

## 2026-10-18: report publications and creative references

Report authoring now distinguishes a mutable `performance_report` draft from
its immutable `performance_report_share` publications. Existing public links
were backfilled without changing their tokens or contents in migration 0039.
The legacy report token column remains for application rollback compatibility;
remove it in a later reviewed migration after the rollback window closes.
New readers resolve publications through the share table.

Reference boards add an explicit occurrence identity and a proposal acceptance
receipt. A reference points to its source through a typed FK, while notes belong
to the occurrence. Proposal acceptance creates its draft and records that link
atomically. This removes the need to deduplicate by title or overwrite a prior
ad when an acceptance is retried. Edits before acceptance remain last-write-wins.
Source previews resolve current visibility instead of storing private snapshots.
The shared visible-brand check now scopes tracking links in SQL, so a public
reference tracked by multiple organizations is visible to each valid tracker.

## 2026-10-18: article candidates and editorial decisions

The typed article writer replaced `production_packet.document` immediately on
completion, while ordinary saves retained no prior copy. A successful generation
and a reviewed working draft represented different facts in the same field.

`article_revision` now records immutable candidates and recovery snapshots.
The current draft remains in `production_packet`; `article_acceptance` links the
current editorial decision to its exact snapshot. Edits clear this relationship
while retaining the historical decision. Provider transfer receipts remain in
`workflow_run`. Applying a candidate and its decision happens atomically, and
retries cannot overwrite a later edit. Restoring prose preserves the current CMS
item identity. The shared document access check also verifies the live brand's
organization and deletion state.

## Content workbook source and application receipts

The prior workbook queue was retired in #213. Source ingestion remains a distinct operation from launch/initiative planning. A workbook now owns its source cells and editable mapping. The application receipt links each selected occurrence to native content and platform drafts, so retries cannot create duplicates or overwrite later edits. Ordinary mapping saves remain last-write-wins. Existing content is touched only through an explicitly selected empty slot; its occurrences and editorial work are checked within the apply transaction.

## Scheduled email broadcasts (2026-10-19)

Content identity remains `content_post` / `platform_post`, with `series` owning
editorial membership. Scheduling does not create a synthetic sequence or another
editable broadcast group. Existing prepared `message_send.snapshot.schedule`
owns absolute delivery intent, queue receipt, and pause state. The existing post
date owns tentative editorial planning; an approved post may have a date without
being queued. Only a queue receipt advances the post to Scheduled; pausing returns
it to Approved while preserving its calendar date. The sequence QStash transport/signature boundary is shared while the
broadcast audience/send ledger remains authoritative. Old snapshots need no
backfill: absence of schedule means existing on-demand delivery. Audience compilation was subsequently removed below; delivery reads live membership.
## Email creative review and client links (2026-10-19)

Email content remains the existing platform post plus canonical email document;
a newsletter series remains its editorial grouping. Rich connector previews and
the series reading dialog reuse the existing renderer, rather than approximating
email from a social caption. No duplicate series, preview document or approval
state is written. Interactive review and full-length PDF print documents share
the same rendering.

Client email links follow the existing ad preview's live signed-selection model,
with a separate purpose key. The signature binds an explicit email selection,
brand, organization and expiry to the brand's current connect token. Public reads
re-check ownership, deletion, expiry and signature and expose creative only.
These links are deliberately live, not publication snapshots; the UI states that
edits appear there and future editions are excluded. A frozen publication model
would be a separate product decision. Private PDF export does not mint a link.

## Live email audiences (2026-10-19)

Database-list membership belongs to `email.list_member`; delivery keeps a list
reference and reads current rows through existing pagination. Counts are derived
from those rows. Audience changes do not require membership materialization,
resolution timestamps or a lifetime delivery restriction on the platform post. Keep job claims and per-send recipient uniqueness for actual
repeated side effects; remove cross-send wave lookups and the generic eligibility
wrapper. A typed `metadata.emailDelivery` receipt on the email platform post records
accepted Postmark bulk IDs and counts, matching the typed pushed-creative pattern
used by platform ads. It adds no scheduling/status owner or new database column;
existing send/recipient records retain their execution and attribution roles.
Broadcasts now make one Bulk submission, rejecting payloads above 50 MB rather
than splitting. Removed broadcast queue retries, stale-claim recovery and send
cursor use. Database paging remains for reads/attribution only; Postmark owns
provider processing. The final cleanup drops the legacy cursor, audience revision
and cached list count. Membership rows own counts. A single `bulkRequest` receipt
replaces the array; link checks are optional preview feedback and the blanket
Customer.io cutover acknowledgement is removed.
See `docs/email-live-audiences.md`.

The redundant `email_audience_snapshot` table and compile/status UI/MCP actions
are removed. Sends and CSV exports reference `email_audience` directly; database
membership and existing warehouse queries resolve at read time. A forward
migration rewrites prior send/receipt references before dropping the table.
Verified on an isolated production-derived database; no production writes.
