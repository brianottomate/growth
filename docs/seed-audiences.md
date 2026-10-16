# Reusable seed audiences

A seed list is a brand's reusable list of people for paid seeds. It is not a
campaign audience, an email list, email send permission or a Meta object, and it
is not tied to Meta: a platform plan delivers it.

A seed list is made from a starting point (`SEED_TEMPLATES`) and built at once.
The list keeps only which starting point made it (`seed_list.origin`); each build
(`seed_snapshot`) keeps the exact filters and queries it ran. There is no separate
recipe to edit or approve.

| Template | Who | Lands in |
| --- | --- | --- |
| `past_bookers` | Confirmed direct bookings on the brand's WanderOS site | Brand's own account |
| `email_list` | A one-time copy of one of the brand's email lists | Brand's own account |
| `destinations` | Wander travelers with activity on homes in the brand's towns | Wander's account, lookalike shared |
| `similar_homes` | Wander travelers drawn to homes the size of the brand's | Wander's account, lookalike shared |
| `persona` | A persona turned into home filters once, with AI | Wander's account, lookalike shared |
| `described` | A description turned into home filters once, with AI | Wander's account, lookalike shared |

Rebuild makes a new build: fixed templates run on today's homes and data, persona
and described lists reuse the last build's filters so counts stay comparable, and
an email list copy copies again. An email list copy never follows later changes
to the email list by itself. Email lists and seed lists stay separate stores;
email consent and opt-outs stay with email. Personas stay general brand context:
a seed reads a persona, never the reverse.

Where the people go on Meta depends on whose data they are. A build with Wander
signals uploads to Wander's ad account, and only its lookalike reaches the client,
shared in Ads Manager: Wander's customers never land in a client account. Every
other build uploads straight to the brand's own pinned account, where its
lookalike is already the brand's.

"New seed list" uses the shared start-from dialog (`StartFromDialog`, also used by
email "From template"). It sits on the WanderOS tab's Seed lists card and in each
Meta ad set's **seed slot**, which shows the asset the ad set's campaign audience
targets and the next delivery step (upload, lookalike, share, use). The push
compiler sends that asset as the ad set's custom audience. Chat and MCP use the
same `seedWrite.build` action, so Shape can build too.

## Existing versus new

| Existing | New in this change |
| --- | --- |
| `email.list` / `email.list_member`: immutable client uploads | Copied explicitly into a seed list build; never read live |
| `email_audience` / `email_audience_snapshot`: email-oriented warehouse rules and recipient tables | `seed_list`: a brand's reusable advertising seed and the template that made it, independent of campaigns |
| A campaign-only past-bookers preparation path and transient CSV uploads | `seed_snapshot`: frozen definition, cutoff, source/query receipts, expansion diagnostics and count |
| Zernio customer-list creation, additive member uploads, lookalike creation and provider reads | `seed_member`: exact SHA-256 email membership, observed evidence and the contact fields uploaded, per frozen snapshot |
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

- `seed_list`: brand FK, name, `origin` (the template and its persona, description
  or email list), timestamps.
- `seed_snapshot`: list FK, copied definition, `as_of`, member count, diagnostics.
  A refresh creates a new snapshot; neither old membership nor Meta is updated.
- `seed_member`: primary key `(snapshot_id, email_hash)`, ordinal evidence score,
  source/search evidence. Same email across searches/sources is one member.
  Compile also stores email, E.164 phone, first/last name, city, state, postal
  code and country from the snapshot's own sources, so the upload sends what the
  operator reviewed rather than re-resolving identities later.
- `platform_audience.seed_snapshot_id`: exact membership uploaded for a seed.
- `platform_audience.parent_platform_audience_id`: local parent of a lookalike.
- `platform_audience.ad_account_id`: FK to the existing brand-scoped allowlist row.
  API destination arguments remain external IDs (`act_…`); this FK is `adacct_…`.
- `platform_audience.for_brand_id`: the client brand a Wander-side seed or
  lookalike was built for. The asset itself belongs to the Wander brand.

An uploaded seed can serve several campaigns through the existing asset link table.
A lookalike derives membership from its parent, rather than copying a second seed
snapshot FK. `source_id` remains external provider provenance for existing readers.
Legacy `seed_metadata.snapshotId` is email-snapshot metadata, not this new FK.
For the new path, `seed_metadata` records upload progress only, including the count
of acknowledged uploads. Provider approximate/matched size is separate.

## Selection and size

Selection has no minimum source count and no random sample-size default. Size is
not evidence of conversion quality. About 1,000 uploadable entries (members with
an email or phone) is a guideline for a useful lookalike
(`SEED_GUIDELINE_ENTRIES`): builds and uploads below it carry a `warning`, but
nothing is refused. Meta's own errors are authoritative.
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
A build's filters select `wanderSignals: ["bookers"]`, `["intent"]` or their union,
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

Do not lower the evidence floor or widen searches only to reach the guideline. Meta's
matching, processing and eligibility remain provider facts; `matchedSize` is
information only, and source count never stands in for matched people. No
presumed match rate or hard-coded lookalike floor.

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

App, chat and MCP share the same actions: `seedRead.list/get/members/assetStatus`
and `seedWrite.build/rebuild/upload/lookalike/share/attach`.

1. `seedWrite.build({ brandId, template, personaId?, steer?, emailListId?, name? })`
   creates the list and its first build. Check `warning` for small builds.
2. `seedWrite.rebuild({ seedListId })` adds a new build as described above.
3. `seedRead.members({ snapshotId, limit?, afterHash? })` pages hashes/evidence.
   Signed-in CSV download: `GET /api/seeds/{snapshotId}`. Always `EMAIL_SHA256`.
4. `seedWrite.upload({ snapshotId, approved: true, platformAudienceId?, name? })`
   creates a customer list in the owner's account (above) and uploads every
   member with an email or phone. There is no destination argument: the owner
   brand must pin exactly one allowlisted Meta destination. The asset is recorded
   under the owner brand with `for_brand_id` set to the seed's brand.
5. `seedRead.assetStatus({ snapshotId, platformAudienceId })` checks fresh provider
   processing/matching. Known pending/processing seeds wait before lookalike creation.
6. `seedWrite.lookalike({ snapshotId, seedPlatformAudienceId, country: 'US',
   ratio: 0.01, approved: true })` builds the lookalike in the same account.
   Provider eligibility/failure is authoritative. In Wander's account the
   result's `share` gives the lookalike name, Meta audience ID, the client's ad
   account ID and an Ads Manager link; in the brand's own account it is already
   shared.
7. Wander's account only: the operator shares the lookalike (never the seed) with
   the client's ad account in Ads Manager. `seedWrite.share({ snapshotId,
   platformAudienceId, confirmShared?, target? })` then reads the client account's
   audiences. When Meta lists the lookalike there, or the operator confirms with
   `confirmShared`, it records the client brand's own `platform_audience` copy.
   The client brand needs a pinned, allowlisted Meta destination and a Meta Ads
   channel. No provider writes.
8. `seedWrite.attach({ snapshotId, platformAudienceId,
   target: { type: 'campaign_audience', id: 'aud_…' } })`, or target a `persona`.
   A client brand attaches its own copy; a Wander-side seed or lookalike is not
   targetable for it. `share` can attach in the same call via `target`.
   Attaching changes local targeting relationships; it does not launch a campaign.

Uploads/lookalikes use the existing operator-approval policy over app/MCP; no spend.
Creation is not idempotent: never auto-retry an uncertain creation. An interrupted
member upload reports its known local asset and confirmed progress; resume by
passing `platformAudienceId` with the same snapshot/account. Keep the partial asset
rather than deleting it and hiding the recovery state. Provider-add acknowledgments
are not matched counts. No lookalike or attachment is automatic on upload failure.

The CSV export contains email hashes only. The seed store keeps the contact fields
captured at compile time, and delivery sends each member's stored email and phone
in batches of 10,000. Zernio's documented upload API accepts plaintext and hashes
server-side. Never pass an exported hash through that plaintext endpoint and hash
it twice. A resume is refused if the uploadable count no longer matches the count
the upload started with; compile a new snapshot instead. Source changes after
upload do not remove provider members; a new snapshot/upload is a separate
version, not silent in-place replacement.

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
The current seed identity is normalized email, not phone-only records; phone is an
extra uploaded identifier on an email member. Provider
member removal, replacing a live audience in place and scheduled refresh are not
implemented in this iteration. Create/upload, status, lookalike and targeting
attachment are implemented; live provider mutations were not exercised by the
experiment. Existing provider clients/allowlists remain in force.

References: [Zernio audience API](https://docs.zernio.com/platforms/meta-ads/audiences)
for non-idempotent creation, 10k plaintext uploads/server hashing, additive membership,
provider IDs and lookalike seeds. Meta's help/developer pages were inaccessible to
automated reads during this audit, so numeric provider eligibility is deliberately
not encoded as a verified current contract.
