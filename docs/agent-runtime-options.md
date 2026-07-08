# Agent Runtime Options for Growth

**Status:** working plan, 2026-07-08.  
**Purpose:** preserve the runtime/framework reasoning for Growth agents so the
next implementation can choose deliberately instead of turning into a framework
debate.

## Recommendation

Keep the current AI SDK tool-loop agents as the foreground product interface.
Use the app's existing services as the first write boundary. Add a structured
operator layer before introducing a separate agent runtime.

For Growth, the useful distinction is not "which agent framework is best." It is:

- **interactive assistant:** user asks, agent answers or prepares a draft;
- **operator snapshot:** system checks the workspace and produces findings;
- **batch analyst:** agent enriches or verifies a queue of records;
- **external operator:** agent lives on a schedule or channel and brings work back
  to the team.

The first two should stay close to `/overview`. The batch analyst can remain a
background service/job. The external operator only needs Eve or a separate
deployment once schedules, channels, durable runs, or separate observability become
real requirements.

## Current Runtime Reality

Growth already has more than one agent shape:

- `/api/overview/chat` runs an AI SDK `streamText` loop with org-scoped tools,
  Anthropic model selection, and `stopWhen: stepCountIs(8)`.
- `/overview` is positioned as a broad back-office assistant for content, leads,
  listening, ads, lifecycle, and channel health.
- The capability registry already separates read-only capabilities from mutating
  ones, with approval-oriented comments for future write tools.
- The permit-list work already proved a batch analyst pattern: a model loop with
  web/search/read tools, structured final verdicts, and human-safe promotion rules.

That means the app does not need an agent framework just to "have agents." It
already has agents. The question is whether a new runtime removes operational
friction the current shape cannot handle.

## Runtime Decision Matrix

| Runtime | Best fit in Growth | Avoid when |
| --- | --- | --- |
| AI SDK tool loop | Interactive chat, small tool registries, draft actions, product-native streaming | The work needs durable multi-run state, long pauses, or many scheduled branches |
| AI SDK 7 upgrade | Strengthening the existing chat/tool path with typed context, approvals, timeouts, telemetry, and durable agent options | The problem is mostly workflow state, queue orchestration, or cross-channel operation |
| In-app deterministic workflow | Readiness checks, sync health, due dates, stale queues, operator findings | The workflow needs to leave the app or run independently of the product deployment |
| Mastra | Explicit multi-step workflows: gather -> check -> judge -> create finding -> wait for approval -> execute | The work is mostly a user-facing chat loop or a simple cron/check |
| Eve | Separately deployed operator with schedules, channels, durable sessions, sandboxing, and its own operational identity | The first version can live as an in-product snapshot or app service |

## AI SDK 7 Fit

AI SDK 7 is the natural near-term upgrade path for the existing chat agents. It is
especially relevant to Growth because the current `/overview` loop already uses
AI SDK primitives.

Useful AI SDK 7 capabilities for Growth:

- typed runtime and tool context, so org/user/channel credentials can be passed
  deliberately rather than by loose closure;
- tool approvals for mutating actions such as creating ideas, updating lead state,
  or preparing outreach;
- timeout budgets for total runs, steps, chunks, and tools;
- telemetry/lifecycle events for seeing where expensive or flaky tool loops fail;
- workflow-aware agent options if a future route needs more durability without
  adopting a separate framework.

What it does not decide: AI SDK 7 does not tell us whether `/overview` should
become a scheduled operator, an external digest agent, or an in-app findings
system. It strengthens the existing agent loop; it does not replace product
architecture.

## Mastra Fit

Mastra becomes interesting when Growth work is more workflow than conversation.

Good Mastra candidates:

- daily operator snapshot: gather workspace state, run checks, rank findings,
  dedupe against prior runs, create findings, wait for approval;
- lead enrichment promotion: discover domain, verify fit, cross-check CRM, propose
  send-review promotion, pause for human review;
- lifecycle repair: detect drift between Customer.io, Outreach, and app state,
  propose a correction, wait for approval, then execute;
- content gap workflow: inspect plan imports and calendar gaps, draft ideas, route
  to review, then fan out to channels after approval.

Mastra is less compelling for the current `/overview` chat itself. The chat is
already a good AI SDK use case: stream a response, use tools, keep the user in the
loop. Mastra matters when the operator has to remember where it paused and resume a
specific process later.

## Eve Fit

Eve becomes interesting if the Growth operator becomes a separately deployed actor
rather than a panel inside the app.

Good Eve candidates:

- scheduled morning digest: "what needs attention across content, leads,
  listening, lifecycle, ads, and channel health";
- approval channel: the operator sends a staff-facing message and resumes when a
  human approves or rejects;
- sandboxed analysis: the agent needs isolated file/code execution against exported
  data;
- cross-system operator: the agent connects to multiple tools through MCP/HTTP
  endpoints and has its own run history outside the web app;
- on-call growth analyst: the agent watches failures and nudges the team through a
  channel instead of waiting for someone to open `/overview`.

The `agent/` directory shape is only a packaging detail. The real question is
whether the agent should share the app deployment or run as an external service.
For Growth, start with product-native findings. Move to Eve when the natural user
experience is a schedule, inbox, digest, or channel-based approval loop.

## Proposed Operator State

Do not store operator output as chat messages only. Use structured findings.

Minimum finding shape:

- `id`
- `orgId`
- `domain`
- `kind`
- `severity`
- `title`
- `summary`
- `evidenceJson`
- `route`
- `proposedActionJson`
- `status`
- `createdByRunId`
- `expiresAt`
- `createdAt`
- `resolvedAt`

Minimum run shape:

- `id`
- `orgId`
- `runtime`
- `scope`
- `startedAt`
- `finishedAt`
- `status`
- `inputSnapshotHash`
- `model`
- `cost`
- `errorJson`

This makes the operator inspectable, dismissible, and safe to evolve across
runtimes. A future Mastra workflow or Eve agent can still write the same finding
records through approved app services.

## First Growth Experiments

Run these before choosing a permanent framework:

1. **In-product snapshot:** add a read-only operator run that creates findings for
   stale content slots, engage-worthy mentions, enriched leads waiting for review,
   failed syncs, and broken channel connections.
2. **Finding follow-up:** let `/overview` chat explain one selected finding and
   prepare a draft action without publishing or sending anything.
3. **Batch analyst hardening:** turn the permit-list enrichment pattern into a
   reusable workflow shape with explicit states, retries, and promotion gates.
4. **Digest mock:** manually generate a morning digest from findings and decide
   whether it belongs inside `/overview`, email, Slack, or another channel.
5. **Runtime review:** only after those tests decide whether the next step is AI
   SDK 7-only, an in-app workflow, Mastra, or Eve.

## Decision Signals

Stay with AI SDK plus app services when:

- the user is actively in the product;
- the agent responds to questions or prepares drafts;
- the useful output is a finding or route inside the app;
- writes can go through existing services with review.

Consider Mastra when:

- the process has named steps and resumable approval gates;
- the same workflow runs repeatedly over batches;
- deterministic checks and AI judgment need to be composed;
- failures need step-level retries and state.

Consider Eve when:

- the agent needs to wake on a schedule and talk to people outside the app;
- a staff-facing channel is the primary interaction surface;
- durable sessions and independent run history matter;
- sandboxed file/code execution is needed;
- the agent's operational identity should be separate from the web app.

## Source Notes

- AI SDK 7: Vercel's release notes describe typed tool/runtime context, approvals,
  timeouts, `WorkflowAgent`, and telemetry as production-oriented agent upgrades.
- Eve: Vercel describes Eve as a filesystem-first framework where files under an
  `agent/` directory compile into an app running on Vercel Functions, using
  Workflows, Sandbox, AI Gateway, Connect, and Observability.
- Mastra: Mastra's workflow docs emphasize explicit structured steps, branching,
  suspension/resume, and human-in-the-loop approvals.

References:

- https://vercel.com/blog/ai-sdk-7
- https://vercel.com/docs/eve
- https://vercel.com/eve
- https://mastra.ai/docs/workflows/overview
- https://mastra.ai/docs/workflows/human-in-the-loop
