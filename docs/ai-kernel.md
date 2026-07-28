# Growth AI kernel

Growth's executable contract is an ordinary AI SDK 7 `ToolSet`. It has no
parallel atomic registry and no post-hoc grouping layer.

## Canonical capabilities

- `src/server/ai/capabilities/domains.ts` directly constructs coherent domain
  tools from typed service actions. Those actions are plain handlers, not hidden
  AI tools.
- Specialized `workspaceOverview`, `navigateWorkspace`, and
  `prepareProductionPacket` tools sit beside the domain tools.
- `src/lib/growth-capabilities.ts` is the client-safe ID/action catalog used by
  UI progress and retired-result handling.
- `src/server/ai/kernel/policy.ts` defines consequence, approval, idempotency,
  reversibility, undo metadata, and allowed surfaces once per advertised action.
- Every capability uses a provider-compatible root object with an `action`
  field. A strict action-discriminated schema validates the actual call.
- Outputs use `{ ok: true, action, data }` or
  `{ ok: false, action?, error: { code, message, retryable, suggestedAction } }`.

`OVERVIEW_TOOLS` contains the 34 canonical in-app capabilities. `MCP_TOOLS` is
the same catalog projected by action policy; it contains 32 capabilities because
open-world `researchRead` and in-app `driveRead` stay with the host. The optional `invoke_growth`
facade receives only that MCP-safe projection, cannot invoke itself, and stops
after eight steps.

The older `/plan` product surface does not own another registry. `PLAN_TOOLS`
is a deterministic three-capability, read-only projection (`brandRead`,
`researchRead`, and `planningRead`) of the same definitions and uses the same
runtime. It exists only for the focused Form|Chat moment planner. It does not
limit the global assistant or the MCP surface.

The global assistant receives current-page context but keeps the full canonical
catalog available. Location guides which state to inspect first; it is not an
authorization or capability boundary. `navigateWorkspace` returns canonical
named destinations and also accepts a validated internal `/app` path for a new
route that has not yet been named.

## Runtime guarantees

The runtime passes organization and user scope through AI SDK `toolsContext`,
rechecks live membership and allowed-surface policy for every execution,
normalizes portable JSON, and writes one receipt per domain tool call. The
receipt input includes the action, so no schema migration is needed. Replayed
tool-call IDs return the prior output instead of repeating effects.

Action policy drives in-app approvals and MCP read-only, destructive, and
idempotency hints. Local reversible changes may run after a clear conversational
instruction. Any future external send/publish, destructive deletion, or
irreversible provider mutation must declare that consequence and approval.

## Contract checks

`bun run ai:contracts` verifies registry/catalog/policy parity, root-object model
and MCP schemas, strict action coverage, connector projection, and consequence
guards. `bun run ai:gauntlet` additionally uses configured organization data to
verify a real domain read, receipt replay, and execute-time membership denial.
