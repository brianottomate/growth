# Chat turn control

The assistant accepts follow-ups while a response runs. Queue entries live in
`assistant_input`, carry their original page/brand/work context, and remain
visible until the server confirms their outcome. Operators can edit or remove
queued entries, pause the queue, and retry failed work after reviewing the
conversation. Each entry belongs to the person who submitted it.

## Execution and recovery

A transaction locks the conversation row before claiming its active turn. Every
model step and tool execution checks that ownership. A six-minute lease exceeds
the chat route's five-minute execution limit. Expired turns pause the queue and
retain failed input for review; late completion cannot overwrite a newer run.

The open assistant panel dispatches the submitting operator's queued inputs in
order. Closing the panel retains pending input; reopening resumes dispatch.
An already running response continues through the server's drained UI stream,
including final message persistence, when the browser disconnects. This is not
a background job scheduler. Shared-session input from another operator waits
for that operator's panel to dispatch it under their identity.

Queue dispatch waits while the latest assistant message requests approval.
Existing approval validation still checks the exact stored action and expiry.
A queued message never stands in for approval of a provider write.

Steer submits text against the observed active turn. The next model step reads
and records the correction, after the current tool finishes. A correction that
arrives after the final step becomes a normal queued follow-up. Stop asks the
server to stop at the next execution boundary and pauses pending input. Work
already executing can finish; completed provider effects are not rolled back.

Retries keep the conversation and subsequent corrections rather than deleting
its tail. Review existing results before retrying a run that performed writes.

## Suggested next steps and MCP

`presentNextOptions` presents up to three operator-voiced answers, supported
requests, or editable details. Native chat renders the latest assistant's
options outside the transcript. Detail options populate the composer; sending
still requires an explicit action. Pending approvals take precedence.

MCP advertises the same contract and an inline Apps widget with editable detail
drafts. The widget sends an ordinary host user message; it cannot execute a
workspace mutation. Hosts without the widget can read the structured result.

Every action and standalone tool declares a result contract. The kernel validates
JSON-normalized output before returning it or storing its receipt, and MCP
advertises the same schema. Provider extension metadata has an explicit JSON
schema; product results have named nested fields. See
[output contracts](ai-output-contracts.md) for coverage, credential projection,
and post-execution failure recovery.

## Schema and release

Run `bun --conditions=react-server scripts/apply-chat-turn-control.ts` against
the selected database before running this version. It performs only additive
DDL in a transaction: turn-control fields on `assistant_thread` and the new
`assistant_input` table/index. It is safe to run again. Never apply a broad
schema push from this branch to the shared production database.

The feature PR preview uses a dedicated Neon branch. Applying the migration to
the shared database and releasing production remain separate release steps.
The additive fields can stay in place if the application is rolled back.

## Verification

- `bun run check`
- `bun test`
- `bun run ai:contracts`
- `CHAT_QA_HOST=<isolated-host> bun --conditions=react-server scripts/test-chat-turn-control.ts`

The live script refuses a database whose hostname differs from `CHAT_QA_HOST`.
It creates and removes its own organization, users, conversation, and queue
entries. Its concurrency checks use real PostgreSQL row locks.

Browser checks cover queue editing after reload, resuming a paused queue,
steering during a model loop, editable next-step suggestions, and a narrow
viewport. Run model checks with read-only prompts and no provider mutations.
