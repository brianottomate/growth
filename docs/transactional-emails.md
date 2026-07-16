# Transactional emails in Growth — spec

> Status: proposal (2026-07-16), written after the Kristian × Lauren sync on PLAT-3703.
> Companion docs: `customerio-integration.md` (mirror + owned broadcast delivery),
> `funnel-abandonment.md` (marketing journey engine), data-model.md §9 (lifecycle).

## Context

PLAT-3703 ("wander.com login email uses the old template") surfaced the real state of
transactional email: ~21 `cio.api?.sendEmail` call sites in the wander monolith, ~30
CIO transactional message IDs env-indirected through Doppler, with email HTML authored
in the Customer.io UI years ago — plus a second, newer stream (WanderOS sites + new
dashboard) already sending via Postmark with React Email templates from
`@wandercom/design-system-emails`.

The direction agreed with Lauren: bring transactional content in-house as React Email
(design-system repo as template source of truth), deliver via Postmark (possibly
Resend later — the provider should be a swappable detail), and leave marketing
sends in CIO for now.

Growth's job in this is **not sending**. Doctrine (2026-07-13) stands: transactional
emails are product features, sent by the monolith. Growth's job is the thing nobody
has: the **registry** — one truthful inventory of every transactional email, what
triggers it, where its template lives, which pipe delivers it, and how far along the
migration it is. The same strategic-layer role `/app/lifecycle` plays for journeys,
but shaped differently, because transactional is a different animal.

## The boundary: transactional vs lifecycle

The classifier is **not** the trigger shape (both can be 1:1 event-triggered). It is
consent and obligation:

> **Would we still send this to someone who unsubscribed from all marketing?
> If yes (or legally must) → transactional. If no → lifecycle/marketing.**

|                       | Transactional                               | Lifecycle (marketing)                |
| --------------------- | ------------------------------------------- | ------------------------------------ |
| Trigger               | Product event, 1:1, immediate               | Behavior/segment + timing, journey   |
| Suppression           | Must NOT apply (auth, receipts)             | Must apply (consent, frequency caps) |
| Success metric        | Delivered, fast, correct                    | Opened, clicked, converted           |
| Content changes       | Rare (rebrand, product change)              | Constant (campaigns, experiments)    |
| Owner                 | Product engineering                         | Growth/marketing                     |
| Shape in Growth       | Flat **registry** (audit)                   | Programs + steps (strategy)          |
| Deliverability stream | Transactional (Postmark/`os-notifications`) | Marketing (CIO now; Resend later)    |

**Abandoned cart** is the canonical straddler and the ruling is: **lifecycle**. It is
behaviorally triggered and feels transactional, but it is promotional in intent — it
must respect unsubscribes and belongs on the marketing stream. It already has a home:
`lifecycle_kind = "abandoned_cart"` and the funnel-abandonment sweep. Do not put it in
the transactional registry; putting promotional mail on the transactional stream is
the classic way to burn transactional deliverability. (The current CIO
`price_refresh` webhook send is a lifecycle campaign that happens to be triggered by
backend code — the registry spec below deliberately excludes it.)

Grey-zone quick rulings, same test applied:

- Booking confirmation, receipt, payment failed, magic link / OTP, statement,
  agreement, task assigned → **transactional**.
- "Next time book direct", stay-again, past-guest offer, win-back, newsletter,
  product updates → **lifecycle/marketing**.
- Review request → borderline; default **lifecycle** (it survives being skipped;
  it doesn't survive being sent to an unsubscribed guest).

## Why not `lifecycle_program`

The lifecycle model answers "does the journey we want exist, and is it running?" —
intent (programs/steps with copy, delays, branching) reconciled against a mirror of
reality (campaigns/touchpoints), with coverage derived.

Transactional needs none of that machinery: there is no journey (one trigger → one
message), no audience, no branching, no cadence, and "coverage" means something
different — **is every send on-brand, code-owned, contract-stable, and observable?**
It is an audit + migration tracker, not a strategy board. Forcing it into
programs/steps would make both models worse. (Today's CIO import already jams
transactional templates into `lifecycle_campaign` with `kind = "transactional"` and a
name-heuristic run state — that awkwardness is the symptom this spec removes.)

## Data model: `transactional_message` registry

New domain file `src/server/db/transactional-schema.ts` (re-export via the
`schema.ts` barrel), one table, no children:

```
transactional_message
  id            text pk            createId("txm")
  brandId       → brand            (Wander; keeps multi-brand door open)
  key           text unique        stable slug, e.g. "auth.magic_link",
                                   "booking.receipt", "os.task_assigned"
  name          text               "Log in to your Wander account"
  subject       text nullable      exact current subject when source-visible;
                                   placeholders allowed for dynamic subjects
  description   text
  workspace     lifecycle_workspace  marketplace | os | shared  (reuse enum)
  domain        enum transactional_domain
                auth | booking | payments | invoicing | agreements |
                statements | os_tasks | os_notifications | org | other
  criticality   enum transactional_criticality
                auth_blocking | legal_financial | operational | informational

  -- where it fires (system of record is the CODE, we store the pointer)
  triggerEvent  text               human description of the product event
  codeRef       jsonb              { repo, path, line, role } — trigger, sender,
                                   template, or registry source reference

  -- how it's delivered today
  provider      delivery_provider  customerio | postmark | resend (extend enum)
  providerRef   jsonb              CIO: { envVar, defaultId } / Postmark: { template }

  -- template truth
  templateSource enum              cio_ui | design_system | none
  templateKey   text               design-system-emails registry key, when it exists
  dataContract  jsonb              ordered list of message_data / template vars —
                                   the backward-compat contract (keys, required?, example)

  -- migration + hygiene
  status        enum transactional_status
                live_legacy        (sending, off-brand CIO-UI template)
                live_rebranded     (sending, react-email HTML pushed into CIO)
                live_inhouse       (sending via Postmark/Resend from design-system)
                dead               (declared but never called — e.g.
                                    CIO_VERIFY_EMAIL_MESSAGE_ID)
                retired
  linearRef     text               e.g. PLAT-3703
  notes         text
  metrics       jsonb              LifecycleMetrics shape, filled later from ledger
  lastSeenAt    timestamptz        last observed send (ledger join, later)
  createdAt / updatedAt / deletedAt
```

Decisions folded in:

- **Extend `delivery_provider`** with `postmark` and `resend` (ALTER TYPE ADD VALUE)
  rather than minting a parallel provider enum — the lifecycle mirror and channel
  tables share the vocabulary. (`lifecycle_step_system` already knows both.)
- **`dataContract` is the crown jewel.** Migration safety = "message_data keys stay
  stable" (Camille's condition). Making the contract explicit per message is what
  lets anyone re-point templates or swap providers without reading 21 call sites.
- **No recipient data, ever.** Same posture as `message_send`: providers own
  recipients/suppression; the registry stores structure only.
- **`status` is the migration tracker.** `live_legacy → live_rebranded →
live_inhouse` is exactly Lauren's path: (1) render react-email with Liquid tokens
  into the existing CIO message (env-var flip, zero backend code), (2) later, move
  the send call to Postmark/Resend. Two independent hops, per message.

### Relationship to existing tables

- `lifecycle_campaign` rows with `kind = "transactional"` (from the CIO import):
  stop importing transactional into the lifecycle mirror once the registry exists;
  a one-time script migrates/links them (keep `externalId` continuity). `/app/lifecycle`
  then shows journeys only.
- `message_send` (owned-broadcast ledger): unchanged. Later, when provider webhooks
  (Postmark delivery webhooks, CIO reporting webhooks — secret already in env) feed a
  reported-confidence ledger, `transactional_message.key` is the join key that turns
  the registry from static audit into live observability (`lastSeenAt`, volume,
  bounce). That ingest is its own project (send-ledger doctrine), not part of v1.

## Seeding — v1 is an import, not data entry

Everything needed for the initial rows already exists:

1. **Adapt's PLAT-3703 inventory** — 21 call sites + ~30 CIO template IDs with env
   vars, defaults, and `message_data` variables. Script-parse into rows
   (`provider=customerio`, `status=live_legacy`, `dataContract` from the comment's
   variable lists; the two never-called env vars → `status=dead`).
2. **Design-system scan** — walk `packages/emails` registry keys
   (`marketplace/transactional/*`, `os/transactional/*`) and match to rows
   (`email-code` ↔ magic link, `verify-email`, `receipt`, `payment-failed`, …).
   Matches fill `templateKey`; Postmark-delivered WanderOS messages seed as
   `status=live_inhouse`.
3. **Gap report falls out for free**: rows with no `templateKey` = templates to
   build; design-system templates matching no row = candidates or dead code.

`scripts/import-transactional.ts`, idempotent, same style as `import-cio.ts`.

## UI: `/app/transactional`

Not a board — a **control table** (Lauren's migration dashboard):

- Rows grouped by `domain`, columns: name, workspace, provider chip, template-source
  chip, status chip, criticality, data-contract badge (n keys), Linear link.
- Header stats: n messages · n on legacy CIO templates · n code-owned · n dead.
- Detail drawer: code ref (link to GitHub at path:line), full data contract,
  provider refs (CIO message ID/env var ⇄ Doppler name), design-system template
  link, status history via notes.
- Row actions are **link-outs and status updates only** — no send, no test-send,
  no template editing. Growth never touches the transactional pipe.
- Nav: under Observe next to Lifecycle. The lifecycle page loses its
  `transactional` kind filter once the carve-out lands.

## Non-goals (v1)

- Sending or test-sending transactional email from growth.
- Storing template HTML/copy in growth (source of truth: design-system repo;
  legacy truth: CIO UI until each message is rebranded).
- Webhook ingest / live metrics (ledger project).
- Modeling operator→guest WanderOS product emails (that's the app.wander.com
  autopilot surface; its _system_ templates appear here only insofar as the
  monolith sends them).

## Build plan (~1 session each)

1. Schema + barrel + `import-transactional.ts` seed from the PLAT-3703 inventory +
   design-system scan. Push, verify rows in `/app/lifecycle`-style list stub.
2. `/app/transactional` control table + detail drawer + `transactional.router.ts`
   (list/overview/updateStatus/updateNotes).
3. Carve transactional out of the CIO import + migrate existing
   `lifecycle_campaign kind=transactional` rows.
4. (Later, separate project) provider webhook ingest → `lastSeenAt`/metrics.
