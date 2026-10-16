# Reusable seed audiences

A seed is a reusable brand-owned selection, not a campaign audience, email send
permission or a Meta object. The first implementation is API-first: oRPC `seed.*`
and the same canonical `seedRead` / `seedWrite` actions over assistant/MCP.
It does not introduce a separate audience uploader or another delivery engine.

## Existing versus new

| Existing | New in this change |
| --- | --- |
| `email.list` / `email.list_member`: immutable client uploads | Reuse them as source inputs; no second raw contact store |
| `email_audience` / `email_audience_snapshot`: email-oriented warehouse rules and recipient tables | `seed_list`: typed, reusable advertising seed recipe, independent of campaigns |
| A campaign-only past-bookers preparation path and transient CSV uploads | `seed_snapshot`: frozen definition, cutoff, source/query receipts, expansion diagnostics and count |
| Zernio customer-list creation, additive member uploads, lookalike creation and provider reads | `seed_member`: exact SHA-256 email membership and observed evidence per frozen snapshot |
| `platform_audience`: mirrored provider assets, legacy JSON source metadata | Typed FKs to the seed snapshot, parent platform audience and existing `ad_account` registry |
| Campaign audience asset links and persona asset assignments | Reuse those relationships to attach a ready seed or lookalike; no fake campaign/persona required |
| New Performance booking attribution ingestion | Next build reads new identified warehouse booking contacts; attribution rows themselves contain no guest email |

The old campaign UI and email audiences remain supported. They are not silently
reinterpreted as reproducible seed snapshots. Historical assets without exact
membership retain unknown seed lineage; we do not manufacture snapshot records.
Existing provider sync stamps a known ad-account FK at the owning boundary.
Lookalike readers require that typed destination (refresh historical assets
once to record known ownership) instead of guessing from
provider JSON. Old email consent and sending protections remain email-specific.

## Database model

- `seed_list`: brand FK, name, typed definition, timestamps. Edits are last-write-wins.
- `seed_snapshot`: list FK, copied definition, `as_of`, member count, diagnostics.
  A refresh creates a new snapshot; neither old membership nor Meta is updated.
- `seed_member`: primary key `(snapshot_id, email_hash)`, ordinal evidence score,
  source/search evidence. Same email across searches/sources is one member.
- `platform_audience.seed_snapshot_id`: exact membership uploaded for a seed.
- `platform_audience.parent_platform_audience_id`: local parent of a lookalike.
- `platform_audience.ad_account_id`: FK to the existing brand-scoped allowlist row.
  API destination arguments remain external IDs (`act_…`); this FK is `adacct_…`.

An uploaded seed can serve several campaigns through the existing asset link table.
A lookalike derives membership from its parent, rather than copying a second seed
snapshot FK. `source_id` remains external provider provenance for existing readers.
Legacy `seed_metadata.snapshotId` is email-snapshot metadata, not this new FK.
For the new path, `seed_metadata` records upload progress only, including the count
of acknowledged uploads. Provider approximate/matched size is separate.

## Selection and size

There is no minimum of 1,000, 500 or any other application-level source count, and
no random sample-size default. Size is not evidence of conversion quality.
`minScore` is an explicit, adjustable evidence floor:

| Observed evidence | Score |
| --- | ---: |
| Uploaded client contact or confirmed direct booker | 100 |
| Checkout activity | 80 |
| Selected/updated travel dates | 65 |
| At least two canonical property views | 45 |
| One canonical property view | 25 |

These are ordinal heuristics, not learned probabilities. A member's score is the
strongest qualifying source/search evidence, not a sum of overlapping searches.
The recipe selects `wanderSignals: ["bookers"]`, `["intent"]` or their union,
independently of the score floor, so bookers and dates/checkout can stay separate
experiments.

Property filters combine states, cities, landscapes, literal name/description/
activity terms, bedroom/group capacity, pets and optional distance. Values within
a filter dimension are OR; different dimensions are AND. Searches union contacts.
A negative search removes anyone with observed activity in that search, regardless
of inclusion score/radius. Explicit hashed exclusions also apply across all sources.

A geographic center uses observed coordinates and increasing `radiiKm`, for example
50, 150, 300, 600. Each ring accumulates evidence before scoring, so one view in each
of two rings can qualify as repeated views. With `targetCount: null`, return every
qualified contact within declared bounds. With a target, stop at the first ring
that reaches it; do not truncate an overshoot, weaken evidence or fabricate contacts.
If the last ring is too small, return `goalMet: false` and the actual membership.
A radius request still respects other declared property filters.

Countries filter Wander profile countries, not uploaded-list/own-guest coverage.
Destination state/city/radius describe where people showed travel interest, not
where they live. Unknown landscapes do not satisfy a landscape constraint.

The initial 1,000 number came from the starting brief, not evidence that it was an
optimum. A 500-contact or smaller cohort is a legitimate candidate. Meta's eventual
matching, processing and eligibility remain provider facts; source count never
stands in for matched people. No presumed match rate or hard-coded lookalike floor.

## AI proposals

`seedRead.suggest` uses structured object generation through the existing AI stack.
It first proposes literal activity/setting vocabulary, retrieves observed inventory
groups for those terms, then constructs typed search hypotheses. It sees brand
story, personas, representative client inventory and an observed
property catalog vocabulary, never guest identities. It proposes narrow,
comparable-interest and broader behavioral searches. Examples: lake/forest trips,
pet-friendly stays or large-group capacity. Inferred transfer of interests is labeled
as a hypothesis. It produces typed filters, never SQL or arbitrary warehouse access.

Use `propertyOptions` to inspect observed geography/landscape vocabulary and inventory
coordinate centroids, then preview and refine hypotheses. Literal keyword matching
is not semantic embeddings. A hypothesis is not accepted merely because it sounds
plausible: preview counts, source evidence, exclusions and expansion before freezing.
No AI judgment can grant account access or authorize a provider write.

## API workflow

The authenticated app uses `seed.list/get/preview/save/compile/members/propertyOptions/
suggest/upload/assetStatus/lookalike/attach`. MCP/assistant expose those same actions:

1. `seedRead.suggest({ brandId, steer? })` or construct a typed definition.
2. `seedRead.preview({ brandId, definition })`; iterate criteria and optional radius.
3. `seedWrite.save({ brandId, name, definition })` returns `seed_…`.
4. `seedWrite.compile({ seedListId })` returns `ssnap_…`, receipts, count and CSV URL.
5. `seedRead.members({ snapshotId, limit?, afterHash? })` pages hashes/evidence.
   Signed-in CSV download: `GET /api/seeds/{snapshotId}`. Always `EMAIL_SHA256`.
6. `seedWrite.upload({ snapshotId, approved: true, adAccountId? })` creates the seed
   in exactly one selected/allowlisted destination. With an ambiguous destination,
   choose explicitly; the API does not select the first available account.
7. `seedRead.assetStatus({ snapshotId, platformAudienceId })` checks fresh provider
   processing/matching. Known pending/processing seeds wait before lookalike creation.
8. `seedWrite.lookalike({ snapshotId, seedPlatformAudienceId, country: 'US',
   ratio: 0.01, approved: true })`. Provider eligibility/failure is authoritative.
9. `seedWrite.attach({ snapshotId, platformAudienceId,
   target: { type: 'campaign_audience', id: 'aud_…' } })`, or target a `persona`.
   Attaching changes local targeting relationships; it does not launch a campaign.

Uploads/lookalikes use the existing operator-approval policy over app/MCP; no spend.
Creation is not idempotent: never auto-retry an uncertain creation. An interrupted
member upload reports its known local asset and confirmed progress; resume by
passing `platformAudienceId` with the same snapshot/account. Keep the partial asset
rather than deleting it and hiding the recovery state. Provider-add acknowledgments
are not matched counts. No lookalike or attachment is automatic on upload failure.

The seed store and export contain email hashes only. Zernio's documented upload API
accepts plaintext and hashes server-side; delivery resolves only the snapshot's
identities from their approved sources transiently, then sends batches of 10,000.
Never pass an exported hash through that plaintext endpoint and hash it twice.
If source identities can no longer be resolved, stop and refresh instead of silently
changing membership. Source changes after upload do not remove provider members;
a new snapshot/upload is a separate version, not silent in-place replacement.

## Validation and current limits

Migration rehearsed on a fresh production-derived Neon experiment. Real source/API
verification reproduced Winter Park's 27,584 own contacts, 30A's 14, AR's 17 and the
3,253-person AR regional lake/forest seed. Radius expansion at dates/checkout quality
yielded 18 / 18 / 268 / 469 across 50 / 150 / 300 / 600 km and honestly missed a 500 goal.

The refined AI experiment also produced 18-contact direct-interest, 26-contact
regional and 17,375-contact broader activity/setting hypotheses. Larger is not a
recommendation: keep the previously validated 246-booker / 2,114-dates-checkout
regional alternatives separate and assess actual provider/performance results.

Client bookers are confirmed non-cancelled direct website bookings, not the full
PMS/OTA guest population. Warehouse source latency still applies. New identified
bookings enter a subsequent build; no extra ingestion table or recurring cron added.
Builds run on demand, with a 20GB-per-query warehouse scan ceiling; no source row cap.
The current seed identity is normalized email, not phone-only records. Provider
member removal, replacing a live audience in place and scheduled refresh are not
implemented in this iteration. Create/upload, status, lookalike and targeting
attachment are implemented; live provider mutations were not exercised by the
experiment. Existing provider clients/allowlists remain in force.

References: [Zernio audience API](https://docs.zernio.com/platforms/meta-ads/audiences)
for non-idempotent creation, 10k plaintext uploads/server hashing, additive membership,
provider IDs and lookalike seeds. Meta's help/developer pages were inaccessible to
automated reads during this audit, so numeric provider eligibility is deliberately
not encoded as a verified current contract.
