# Growth AI kernel

Growth's kernel is a product pattern, not a second framework and not a shared
package. The executable source of truth is an ordinary AI SDK 7 `ToolSet`.
Growth adds only the product-specific behavior that every execution needs.

## Shape

- `src/server/ai/capabilities/*.ts` exports native AI SDK tools. `growthTool`
  injects typed execution context and adds a small `run(input, context)` method
  for composing product logic without manufacturing AI SDK call metadata.
- `src/server/ai/kernel/group.ts` combines related implementations behind one
  read or write tool with an `action`-discriminated Zod union. The original
  implementations remain independently composable through `run`; grouping only
  reduces the model-facing surface.
- `src/server/ai/capabilities/index.ts` composes surfaces with object spreads.
  `OVERVIEW_TOOLS` is the full in-app set; `MCP_TOOLS` is the policy-filtered
  OAuth connector projection.
- `src/server/ai/kernel/policy.ts` is a separate keyed map for access,
  consequences, approval, idempotency, reversibility, and MCP exposure. Policy
  never wraps or replaces a tool's typed input/output contract.
- `src/server/ai/kernel/runtime.ts` rechecks live organization membership at
  execution time, normalizes JSON output, returns compact actionable errors,
  and writes one durable receipt for each tool call.
- `src/server/ai/kernel/context.ts` composes named prompt sections with explicit
  budgets and optional Anthropic session caching. It fails rather than silently
  truncating context.
- `assistant_run` stores one bounded agent execution; `assistant_tool_receipt`
  stores its child tool calls and deduplicates `(run, toolCallId)` so a replay
  returns the prior result instead of repeating the side effect.

The Overview route starts one parent run, passes typed per-tool context through
AI SDK 7's `toolsContext`, and persists its messages as before. The OAuth MCP starts a
one-tool parent run and executes the same wrapped native tool. It also exposes
`invoke_growth`, a coarse agent-as-tool facade over the 20 detailed MCP tools;
delegated child calls still receive the same receipts. Both surfaces therefore
get the same access checks, policy, errors, and lineage.

## Consequences and approval

Policy is resolved from both the model-facing tool name and, for grouped tools,
the selected `action`. This keeps one read/write pair per coherent capability
without flattening idempotency, reversibility, consequence, or approval into a
single least-common-denominator rule.

The policy is action-first for Growth's current tools: reads, drafts, plans,
reversible workspace changes, and background analysis execute when the request
is explicit or the conversational intent is already clear. The assistant then
reports the resulting object or route so the operator can correct or redo it.

This is not permission to auto-publish. A future external send, publish,
destructive deletion, or irreversible provider mutation must be classified
explicitly and normally use `approval: "user"`. The in-app route derives AI SDK
7 `toolApproval` behavior from policy; the MCP projection derives standard read-only,
destructive, and idempotency annotations from the same entry.

## Contract gauntlet

`bun run ai:gauntlet` checks the kernel against a real, isolated Neon branch:

1. exactly one policy for each of the 21 Overview tools;
2. Zod-to-JSON-Schema conversion for every tool input;
3. the 20-tool MCP projection and omission of grouped open-world research;
4. named context composition and budgeting;
5. a real organization-scoped brand read;
6. receipt persistence and idempotent replay of a repeated tool-call id;
7. execute-time denial after membership context is invalidated.

The gauntlet requires the normal Growth environment pointed at a non-production
database branch with the current Drizzle schema applied.

## Porting the pattern

Other applications should share these invariants, not identical source:
native typed tools, coherent read/write capability pairs, explicit context, separate policy,
execute-time authorization, compact errors, and durable run/receipt lineage.
Each repo should keep its own domain semantics, approval boundaries, and
orchestration. That is the portable kernel.
