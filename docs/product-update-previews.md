# WanderOS product-update previews

Product updates begin as a small, evidence-backed JSON proposal. A local Codex
or Claude session can inspect recent commits across the relevant WanderOS
repositories, select customer-facing changes, and produce a finished preview
without touching Customer.io.

The canonical approved body and evidence live in Growth's versioned
`email_document`. React Email is the deterministic presentation layer, and the
frozen `message_send` ledger owns the eventual Customer.io delivery attempt.

## Evidence rules

Each claim records an exact repository and commit or pull-request ref. Keep CI,
refactors, dependency changes, internal operations, and ambiguous changes out
unless there is a concrete operator impact.

`merged` is not the same as `shipped`. Mark evidence `shipped` only after
checking a production branch, release, or deployment and record `shippedAt`.
Growth will render merged-only proposals, but it refuses to prepare them for
Customer.io delivery.

WanderOS product updates are always operator communications. Growth refuses to
prepare an evidence-backed product update against guest or general-subscriber
audiences.

## Render locally

Create a `wander-growth.product-update-preview.v1` JSON proposal, then run:

```bash
bun run product-update:preview -- /path/to/proposal.json
```

The command validates the full body and evidence, then writes `preview.html`,
`preview.txt`, and the normalized proposal to
`runs/product-updates/<key>/`. The runs directory is ignored by Git.

## Move the preview into Growth

Use the assistant's approval-gated `createProductUpdateDraft` capability, or
the equivalent `newsletter.createProductUpdateDraft` oRPC mutation, with the
validated proposal fields and the correct Growth brand ID. This creates the
content slot, canonical document, and first immutable revision together.

The issue workspace shows every source ref beside the finished email. A later
refinement keeps the evidence attached to the new revision. Preparing delivery
freezes the exact rendered body, evidence, audience class, Customer.io
broadcast ID, and provider-managed segment ID in `message_send`.
Growth re-reads those provider objects before freezing the send. Product-update
segments must be dynamic; a historical manual CSV segment is rejected.

No local workflow exposes a send command. Customer.io delivery remains behind
Growth's admin approval plus explicit `SEND` confirmation.
