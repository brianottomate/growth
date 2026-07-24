# Leads Convergence Plan

**Status:** working plan, 2026-07-08. Companion: `leads-status-quo.md` (the full
inventory this plan acts on). Amends `hubspot-gateway-plan.md` Phase 5 (the sync
design below replaces the webhook-receiver-only approach).
**Decision owners:** Kristian (growth), Danny (RevOps/HubSpot), Nathan (census
wind-down).
**Authors:** Kristian + Claude.

## The decisions

1. **HubSpot stays the system of record** for companies, contacts, deals, owners,
   and status. Nothing below revisits this; Nathan's parallel database and the
   consultant engagement both independently validated the two-layer shape
   (CRM as collaboration surface, own store as intelligence layer).
2. **Neon `leads.*` is the system of intelligence and the app's read model.**
   Enrichment evidence, provenance, review state, and anything that joins CRM data
   against growth's own tables (lifecycle, outreach, content) lives here. It stays
   rebuildable from zero.
3. **The growth gateway (`/api/hubspot/v1`) becomes the only sanctioned write path
   to HubSpot** as existing writers migrate (wander.com router in Phase 3 of the
   gateway plan; monolith opportunistically; Adapt's successor job from day one).
4. **Two-way sync = gateway writes + write-through + HubSpot webhooks into Neon.**
   Webhook-first, not BigQuery-first (design below; alternatives ensconced).
5. **Nathan's census stops** (agreed by Nathan), with a defined salvage.
6. **The Adapt automation runs its course on list 3729 and is not expanded.** If
   the capability is wanted afterwards, it is rebuilt as a growth batch-analyst job
   writing through the gateway.
7. **The Snowball playbook's assets get adopted** (ground truth, unit counter,
   candidate list, ICP tiering) rather than left in the repo.
8. **The forward posture is agentic**, per `overview-operator-agent-plan.md` and
   `agent-runtime-options.md`: AI SDK loops in the foreground, batch-analyst jobs
   for enrichment queues, an operator layer watching the whole estate.

## Target architecture

```
sources (permit list, PMS footprints, referrals, census salvage, future sourcing)
        │  enrichment: agentic verify/fit + deterministic counters (batch-analyst jobs)
        ▼
   Neon leads.*  ── system of intelligence: evidence, provenance, scores, review state
        │  projection of learnings (growth_* namespace, fill-blank on theirs)
        ▼
   /api/hubspot/v1 gateway ── the only writer; write-through stamps Neon at write time
        ▼
      HubSpot  ── system of record; sales works here; sequences run here
        │  webhooks (contact/company create, propertyChange, merge)
        ▼
   Neon leads.*  ── hydrated continuously; rep edits flow back within seconds
```

## Sync design (amends gateway plan Phase 5)

### Decision: webhook-first

HubSpot private-app webhooks (creation, propertyChange, associationChange, merge)
point at a growth route and upsert into Neon. Rationale:

- Growth's production and development database are the same Neon instance — there is
  exactly one database to point HubSpot at, which removes the classic
  webhook-environment-fanout headache.
- Near-real-time: a rep changing lead status in HubSpot is reflected in `/leads`
  within seconds, not at the next batch sync.
- No dependency on infrastructure growth doesn't own (the BQ sync's cadence,
  coverage, and ownership are unconfirmed; see status quo open fact #1).
- Avoids polling entirely, preserving the shared 5 req/s search budget for the
  inbound revenue path.

### The freshness loop (two-way, closed)

1. Growth writes through the gateway to HubSpot.
2. The gateway **write-through** stamps the same change into Neon in the same
   request — our own writes are visible immediately.
3. HubSpot fires the webhook echo for our own write; the Neon upsert is idempotent,
   so the echo is a harmless no-op confirming the round trip.
4. Rep-side edits in HubSpot arrive by the same webhook path — the part no amount of
   write-through can give us, and the actual point of two-way sync.

### Webhook-loss hedging (kept honest)

Webhooks can drop. The hedge is a **periodic healing sweep** that reconciles Neon
against HubSpot and repairs drift. Options, in preference order:

- rerun of the existing link pass (`link-leads-hubspot.ts`) on a schedule — already
  written, already proven at 58.9k domains;
- a BQ-diff sweep, if the existing HubSpot→BQ sync turns out to be reliable and
  well-covered (open fact #1);
- an API paged sweep (last resort; eats the shared rate budget).

Start without any sweep; add the cheapest one if drift is ever observed. Do not
build a reconciliation system for a problem we have not yet measured.

### The one-time backfill (the ~200k seed) — completed 2026-07-24

Neon was seeded from the July 9 full HubSpot CSV export with the streaming,
idempotent `scripts/import-hubspot-company-export.ts` importer:

- 215,844 source companies
- 215,037 distinct normalized domains
- 647 blank-domain records retained in the audit count but not inventively keyed
- 160 duplicate records across 76 shared domains, resolved newest-modified-first
- all stored webhook events replayed on top of the snapshot

The importer fingerprints the source archive, streams quoted multiline CSV
without loading the 512 MB file into memory, preserves Growth-owned enrichment,
and refuses to let an older snapshot overwrite a row advanced by a newer
snapshot or webhook.

### What BigQuery remains for

Ad-hoc analytics and cross-warehouse joins (Minerva, product data) where a warehouse
genuinely wins — and possibly the healing sweep above. It is **not** the app read
model (per-request latency, per-scan cost, no Drizzle, cannot join growth's own
tables) and not a required dependency of the sync.

## Wind-downs (footnotes — not the focus of this plan)

**Nathan's census** (agreed with Nathan): snapshot the SQLite DB, one salvage export
of the ~141 CRM-ready operators through the gateway
(`growth_source=census_salvage`; coordinate with Danny on non-US representation
first), disable the systemd timer, archive the repo. Adopt the ideas, not the code —
the hosted-booking/PMS tenant-footprint discovery channel is worth reimplementing if
international sourcing becomes a priority.

**Adapt automation**: runs its course on list 3729, not expanded. If wanted
long-term, rebuild as a growth batch-analyst job through the gateway. Lessons carry
over regardless: filter `- Mainline` pseudo-contacts and `{id}@fake-email.com` from
contact-based lists/syncs, and make the personal-cell/TCPA posture an explicit,
owned decision.

## Adoption: the Snowball playbook assets

1. **Ground truth becomes the shared validation set.** Import
   `wander-icp-playbook/data/ground-truth.csv` (141 graded rows, 33 exact counts)
   into growth (fixtures or a `leads.ground_truth` table). Every enrichment change —
   ours or anyone's — validates against it before it's trusted. Keep Andreas's
   grading habit: every future spot-check appends rows, reasons and unit counts
   attached.
2. **Port the v2 unit counter** (playbook doc 04 is a near-build-spec): PMS-aware
   booking-engine counting as the deterministic first pass in
   `lead-unit-estimate.service.ts`, with the existing AI triangulation demoted to
   fallback for JS-only residue. Cheaper and more accurate (90.2% threshold-side,
   MAE 1.13 on the graded counts).
3. **Cross-reference the 429 candidates against HubSpot** with the link-pass
   tooling (Andreas never could — no CRM access), then route survivors through
   send-review.
4. **Write the ICP definition file.** One markdown file (`docs/icp-definition.md`),
   one definition, shared with sales, iterated in the open — Andreas's strongest
   advice and the cheapest fix on this list. It must settle the 10-vs-20 threshold;
   the playbook's tiering (FIT ≥ 20 / BORDERLINE 10–19 / NOT_FIT < 10 / UNKNOWN
   never guessed) is the recommended starting point, pending Torger + Danny.
5. **Reconcile the fit taxonomies** (ours / census / playbook) into the ICP file's
   vocabulary so converged leads in HubSpot mean the same thing regardless of
   origin.

## The agentic path forward

The runtime reasoning lives in `agent-runtime-options.md`; the operator product
shape lives in `overview-operator-agent-plan.md`. This plan just places the leads
work inside that frame:

- **Batch analyst** (exists, harden it): the permit-list enrichment pattern —
  model loop + web tools + structured verdicts + human promotion gates — becomes the
  reusable job shape for all enrichment queues: permit promotion, the 429, census
  salvage triage, and the Adapt successor. Explicit states, retries, and gates per
  the runtime doc's experiment #3.
- **Operator layer** (build next): the `/overview` operator watches the leads estate
  as part of its beat — enriched-but-unrouted leads, send-review backlog, webhook
  sync health, gateway failures, segment staleness. Findings route to `/leads` and
  send-review. Deterministic checks first; model judgment after.
- **Write boundary**: agents write through app services and the gateway, never
  directly to HubSpot — the same rule the operator plan already states, now with a
  concrete reason (rate budget + policy A + provenance live in one place).
- **Runtime**: stay on the AI SDK loop until the decision signals in
  `agent-runtime-options.md` fire; Mastra when enrichment promotion needs resumable
  approval gates; Eve only if the operator moves into Slack/email as its primary
  surface.

## Build order

| # | Work | Depends on |
|---|---|---|
| 1 | ICP definition file + threshold decision | Torger + Danny (open fact #5) |
| 2 | ✅ Neon seed: full company backfill + freshness columns | Completed 2026-07-24 |
| 3 | ✅ Webhook receiver + idempotent company projection | Completed 2026-07-24 |
| 4 | Ground-truth import + validation harness; v2 unit-counter port | — (parallel) |
| 5 | 429 cross-reference → send-review | 2, 4 |
| 6 | Census salvage export → gateway import | Nathan (open fact #4), 2 |
| 7 | Gateway plan Phase 2 (enrichment → projection, `growth_*` properties) | Danny's naming nod (already pending) |
| 8 | Gateway plan Phase 3 (inbound router port, accept-then-process) | quiet week (gateway plan §7 Q6) |
| 9 | Adapt sunset → batch-analyst successor job | list 3729 drained (open fact #3) |
| 10 | Operator layer leads checks in `/overview` | 3 (sync health needs a sync) |

Items 1–4 are the foundation and are deliberately boring. Per the note that came
with the playbook handoff: slow is smooth and smooth is fast — the failure mode in
AI GTM is not the tech, it's picking the wrong problems and not seeing them through.
This plan optimizes for impact over urgency, keeps one ICP definition everyone
shares, and writes every decision down where it becomes permanent context (this
file, its companion, and the gateway plan are that record).

## Success criteria

- One write path: every HubSpot mutation flows through the gateway with provenance.
- Neon reflects HubSpot within seconds (webhooks) and survives a full rebuild
  (seed + sweep).
- One ICP definition, in a file, that sales and every pipeline agree on.
- Every enrichment method — current and future — is validated against the shared
  ground truth before it writes anywhere.
- Nathan's and Andreas's best work survives inside the converged system; nothing
  else keeps running unowned.
- The estate has one owner per layer and no system nobody can name.
