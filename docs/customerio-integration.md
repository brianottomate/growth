# Customer.io → Growth DB (strategic-layer mirror)

The growth app mirrors Customer.io (Wander workspace, env `142511`) as
**view-only strategic-layer data**. The import path remains read-only and links
out to CIO for external edits. Separately, an owned Growth email can now trigger
an explicitly approved API broadcast through a provider-managed segment.

## Source

- **API:** Customer.io **App API** (`https://api.customer.io/v1`), Bearer
  `CUSTOMER_IO_APP_KEY` (already in env). Repeatable — no service-account token needed.
- **UI ↔ API:** the "Broadcasts" tab = `newsletters`. Also `campaigns`, `transactional`.

## Script

`bun run scripts/import-cio.ts` — idempotent (wipes prior CIO-sourced rows for the
brand, re-inserts). **Scope: 2026 only.**

| CIO object                         | → DB                                                                                     | Notes                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `newsletters` (sent + 2026 drafts) | `platform_post` (`platform=newsletter`, `provider=customerio`, `externalKind=broadcast`) | sent → `status=published` + `publishedAt`; draft → `status=draft` (no ship time, so **excluded from the feed**). Metrics enriched for the **most recent 60 sends** only (bounded API calls). |
| `campaigns` (journeys)             | `lifecycle_campaign` + `lifecycle_touchpoint`                                            | touchpoints = the campaign's `actions` (email/push/sms/…). `event_name` → `triggerEvent`.                                                                                                    |
| `transactional`                    | `lifecycle_campaign` (`kind=transactional`)                                              | App API doesn't expose transactional run-state → inferred from name heuristic.                                                                                                               |

## Schema added (this work)

- `PostStats` (jsonb, **no migration**) gained email fields: `sent, delivered, opened, clicks, bounced, unsubscribed, spammed, converted`.
- `platform_post.externalKind` (text) + `platform_post.cleanupStatus`.
- `cleanup_status` enum: `keep | review | candidate | should_delete | deleted` — the triage flag for mirrored external assets.
- **`lifecycle-schema.ts`**: `lifecycle_campaign` (kind, **runState** = `planned|draft|running|paused|stopped|ended|needs_fixing`, externalKind, triggerEvent, provider, externalId/Url, cleanupStatus, metrics) + `lifecycle_touchpoint` (channel, position, externalId, metrics).

## What's in the DB after a run (2026 snapshot)

- **238 newsletters** (190 sent · 60 with full metrics · 48 drafts → 40 cleanup `candidate`, 8 `review`).
- **155 lifecycle automations** (90 campaigns + 65 transactional) · 295 touchpoints · 53 cleanup candidates. Run-state: ~89 running, 52 draft, 11 stopped, 3 planned.
- Real engagement, e.g. Saturday/Wednesday blasts ~327K sent, ~31% open.

## Surfaces

- `/app/feed` — sent newsletters appear as standalone cards on the Dispatch channel.
- `/app/lifecycle` — view-only, grouped by run-state (needs_fixing → running → … → ended), cleanup flags, links out to CIO.

## Owned broadcast delivery

The owned newsletter workspace keeps Markdown as the editorial source of truth
and renders its preview with `@wandercom/design-system-emails`. Delivery is a
separate, guarded workflow:

1. Save an immutable email revision.
2. Prepare a `message_send` against one Customer.io API-triggered broadcast ID
   and one provider-managed segment ID.
3. Approve that exact revision and audience reference.
4. Type `SEND` before Growth calls Customer.io.

The send ledger stores the approved revision, audience class, provider
references, design-system preview, status, approver, sender, and outcome. It
does **not** copy recipient lists, credentials, or suppression state into
Growth. Customer.io remains responsible for live segment membership, consent,
frequency/suppression rules, and the recipient-specific unsubscribe footer.

The trigger payload schema is `wander-growth.customerio-broadcast.v1`. The
configured Customer.io broadcast must read the structured `growth.email`
fields from the trigger data and own its delivery wrapper. `bodyHtml` is a
sanitized content fragment derived from the saved Markdown; the full rendered
preview stays in the ledger and is not injected into the provider payload.

Audience and template ownership stay explicit:

- WanderOS product updates are operator-facing marketing emails. The eventual
  design-system registry key is expected to live under an operator-marketing
  namespace; the generic Wander template is used as the honest fallback until
  that key is published.
- WanderOS lifecycle and announcement recipes are sent by operators to guests
  and remain in the existing `os.marketing.guest.*` design-system namespace.
- React Email source lives in the Wander design-system repository. Growth owns
  planning, editorial revisions, approval, provider orchestration, and the send
  ledger.

## Follow-ups (not done)

- Metrics enrichment is capped at 60 recent sends; older 2026 sends have no stats. A backfill pass (or a nightly cron) could fill the rest.
- `lifecycle_touchpoint` stores structure (channel/order/externalId) but not message content/copy or per-touchpoint metrics yet.
- Cleanup is **flagged**, not actioned. A cleanup view + `cio_delete_api` dry-run → delete flow (for `should_delete`) is the natural next step. (Kristian floated a todo-list layer — deferred.)
- `runState` for transactional is heuristic (App API gap); the fly/internal API has true state if we ever wire a service token.
