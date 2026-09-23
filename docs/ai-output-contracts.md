# AI output contracts

Every catalog action declares its successful wire result. Every native tool
has a complete result schema, including failures. Chat, delegated runs, and MCP
execute the same typed tool; MCP advertises that schema in `tools/list`.

## Coverage

The domain catalog contains 206 actions and seven standalone tools. Individual
operation projection and job status produce 214 native tools
and 199 MCP tools. All have output contracts. The additional MCP `invoke_growth` facade declares
both its report and compact-error shapes.

Action contracts live beside the capability's input and execution definition.
Larger result shapes live in `src/server/ai/capabilities/outputs/`, grouped by
product domain. Shared records and database enum definitions avoid repeating
common shapes. These are maintained source files. Update them when changing a
service's return value.

The contracts describe nested records, array elements, nullable fields,
platform-specific results, and operation-specific receipt fields. Open JSON is
limited to provider extension fields and stored metadata that is intentionally
schemaless. Those leaves use the named, documented `jsonValueSchema`; they do
not make an entire result unconstrained. Saved media analyses have explicit
product schemas even though their storage column is JSON.

Nested brand results omit connection-link tokens and their issuance details.
Product Atlas/storefront and intake-preview capabilities project those fields
out before returning data; their UI services retain their existing shape.
The contract gate rejects an advertised `connectToken` property.

## Wire boundary

Service actions remain usable as native service functions through `action.run`.
Native tool execution retains service types, including Dates. The receipt boundary
serializes results once with standard JSON semantics before returning them to a
model or MCP client. Dates become ISO strings and undefined object fields disappear.
A service's legacy `{ error: string }` response becomes the shared failure envelope.

Output contracts describe the wire format and remain checked against inferred
service results at compile time. Contract tests and MCP protocol validation catch
schema drift. The kernel does not re-parse trusted service results or authenticated
execution context on every call. Model inputs, membership and provider approvals
are still checked at their respective boundaries.

Product Atlas and storefront results reuse their canonical product schemas.
Individual operations invoke their typed action directly; grouped tools remain
available for saved approvals and explicit domain composition.

## Verification

- `bun run ai:contracts` rejects missing contracts, unconstrained root/nested
  schemas, and invalid JSON Schema exports across the entire catalog.
- `bun test` covers wire normalization, failure envelopes, provider extensions,
  platform-specific results, action/result correspondence, and both MCP protocol
  versions. Every advertised MCP tool must have an object-root output schema.
- `scripts/test-output-contracts.ts` checks real local-read results on an
  isolated database and verifies parsing preserves every returned field.
- `scripts/test-output-workflows.ts` exercises local create/edit/read-back
  workflows in a temporary organization and removes its fixtures in `finally`.
  It refuses provider, model, and background actions through policy checks.

Both live scripts require `OUTPUT_QA_HOST` to exactly match the selected
isolated database hostname. Run with `bun --conditions=react-server` and the
QA branch's `DATABASE_URL`. They must not be pointed at production.

Provider mutation payloads are validated with contract fixtures. The tests do
not publish campaigns, send messages, or spend ad budget to exercise schemas.

Background status carries the exact original operation result schema.
`scripts/test-operation-workflows.ts` checks accepted/running/completed/failed/
interrupted jobs, receipt replay, user and organization isolation, membership
revocation, and domain change notifications on the isolated database.
