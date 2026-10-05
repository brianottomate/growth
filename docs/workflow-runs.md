# Workflow runs

The live runtime uses `workflow_run` for WanderOS import, starter ads, catalog preparation, catalog export, and creative-document production (image, article, email, video planning, Dato transfer). The client layout mounts one activity panel below the brand tabs. The lab fixture imports the same presentation component.

## Persistence

`workflow_run` belongs to an organization and brand. Optional foreign keys identify its campaign, creative document (`packet_id` → `production_packet`), content post, assistant thread, parent run, and prior failed run. `workflow_type` identifies the handler; `provider` identifies the external adapter. They are independent.

Lifecycle: `queued → running → succeeded | failed | cancelled`. There is no partial status. A job with failed or remaining work is failed; already-saved outputs remain available in their normal UI.

- `input` holds the requested work and captured source choices.
- `progress` contains counts/messages/steps; provider-native output remains in `provider_output`.
- `lock_key` plus a partial unique index prevents concurrent jobs on the same resource. Document production has its own partial unique document index and edit lock.
- Atomic queued-to-running claims assign `claim_token`, `started_at`, and an expiry. Workers cannot claim twice. Progress writes require the same token, an active status, and an unexpired lease.
- `completed_at`, `error`, and `dismissed_at` support terminal state and acknowledgement.
- Provider-specific model, prompt, request ID, webhook hash, candidate outputs and accepted media reference support existing creative adapters. Accepting a candidate remains separate from producing one.

`catalog_export` holds a permanent frozen `input` and `output` snapshot, including feed rows, rendered media references, folder and format. Its optional `source_run_id` uses ON DELETE SET NULL. Removing run history cannot remove an export. Export deletion is an explicit artifact action.

## Execution and UI

Normal requests dispatch immediately through the existing after-response or provider paths. An hourly cron on the existing Neon wake mark recovers never-started queued jobs. It does not replay running provider requests. Interrupted/expired work becomes failed; start another batch deliberately after inspecting saved outputs. Dato and image-provider submission are not automatically retried. Import continuation carries successful steps into a new run.

The activity API checks live workspace membership and brand scope, and returns an explicit presentation projection. It does not return input, prompts, webhook tokens or provider payloads. Parent import activity contains steps; its catalog child uses the same table without a duplicate top-level card.

The layout polls every 2 seconds during active work and every 15 seconds while idle, only while the page is visible. Changes invalidate relevant queries and refresh server components. An observed active-to-success transition emits a toast and removes the activity row. Initial page loads do not replay old completion toasts. Failed rows remain until dismissed. Buttons retain their specialized status queries where they need operation-specific state.

## Cutover

`scripts/apply-workflow-run-cutover.ts --apply` is the one-time additive cutover, generated from the actual Drizzle schema. It copies completed creative results and all saved exports, classifies old active jobs as interrupted, and leaves the old table available while the old application is deployed. After the new release is Ready, the explicit forced schema push retires `creative_run` and its enum. Build itself no longer modifies the database.

The earlier `workflow-run-proposal.sql` is a design draft, not the applied schema. Current table definitions in `src/server/db/creative-work-schema.ts` are authoritative.

Validation: normal check/test/AI-contract gates, `scripts/smoke-workflow-runs.ts --run`, and `scripts/smoke-creative-documents.ts --run`. Both smoke scripts use temporary rows, call no providers, and clean up. They cover duplicate claims, workspace boundaries, edit locks, cancellation/expiry fencing, preservation of the last good document, and export independence.
