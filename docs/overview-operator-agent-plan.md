# Overview Operator Agent Plan

**Status:** working plan, 2026-07-08.  
**Purpose:** define how `/overview` can grow from a chat assistant into an
operator that watches the growth workspace and proposes the next useful work.

**Companion:** `agent-runtime-options.md` expands the AI SDK 7, Mastra, Eve, and
deployment-boundary reasoning for Growth.

## Recommendation

Keep the current `/overview` chat agent as the foreground assistant. Add an
operator layer that periodically reads the workspace, creates findings, and
routes the user into the right surface: content, leads, listening, ads,
lifecycle, or channel operations.

The goal is not a more talkative chatbot. The goal is an assistant that knows
what changed, what is stuck, what needs a human decision, and what is ready to
ship.

## Current Product Shape

The workspace already has domain-specific systems:

- content pipeline and calendar;
- plan imports and gap review;
- social listening queues;
- lead pool, enrichment, and outreach review;
- lifecycle and Customer.io sync paths;
- ads performance surfacing;
- channel and brand configuration;
- cron and webhook-driven background jobs.

`/overview` is the natural home because it is already broad, operator-facing,
and not tied to one domain workflow.

## Operator Responsibilities

The operator should watch for:

- content slots due soon with no owner, brief, media, or platform rendering;
- imported plan rows waiting for review or stuck in failed states;
- social mentions marked engage-worthy but not handled;
- listening sources with desired-state drift;
- leads that are enriched but not assigned to an outreach path;
- outreach sync failures between systems;
- ads with spend but weak destination or funnel clarity;
- channels with broken connections or stale follower/performance data;
- recurring jobs that failed, skipped unexpectedly, or have not run recently;
- opportunities where a small draft/action can unblock the team.

Each finding should include the route where the operator can resolve it.

## What It Should Not Do

- Do not silently publish, send, or launch campaigns.
- Do not change lead outreach state without an explicit human review path.
- Do not turn every metric movement into an urgent alert.
- Do not bury operators in summaries when there are no real decisions.
- Do not invent numbers when the workspace has no tool for the data.

## Product Surface

Start as a daily or on-demand "operator snapshot" in `/overview`.

Suggested sections:

- Needs attention: time-sensitive blockers.
- Ready to act: drafts, reviews, or sends waiting for approval.
- System health: syncs, webhooks, crons, and channel connection state.
- Opportunities: low-risk suggestions, such as creating a content idea or
  reviewing a mention.
- Recent changes: compact list of meaningful workspace movement.

The chat assistant can explain any item, but the item itself should exist as
structured state, not only as prose in a conversation.

## Deployment Boundary

An external agent runtime can be packaged as an `agent/` directory, but the folder
shape should not decide the product boundary.

The first operator should live close to `/overview` and use the same app services
that already understand organizations, channels, content, leads, listening, and
sync state. It should write structured findings through product code, not by
inventing a parallel operational state.

A separate agent deployment becomes useful if the operator needs its own schedule,
inbox, digest channel, durable run history, or independent observability. Until
then, the simpler boundary is: in-product snapshot first, external agent later.

## Finding Shape

Use a simple structured finding model:

- `kind`
- `domain`
- `severity`
- `title`
- `summary`
- `evidence`
- `route`
- `actionLabel`
- `actionPayload`
- `status`
- `createdAt`
- `expiresAt`

Statuses should be operational: new, acknowledged, dismissed, resolved, expired.

## Execution Model

Use deterministic checks first:

1. Gather workspace snapshot by organization.
2. Run domain checks for content, listening, leads, ads, channels, and sync jobs.
3. Deduplicate findings against recent runs.
4. Generate short explanations only after the structured finding exists.
5. Surface findings in `/overview`.
6. Let the user drill into chat for context or ask the assistant to prepare a
   draft action.

The existing chat tool loop remains useful for interactive follow-up:
"Why is this stuck?", "Draft the idea", "Show the mentions", "What changed
since yesterday?"

## Framework Fit

The existing AI SDK loop is still the right fit for the interactive `/overview`
assistant.

AI SDK 7 is useful for the current route because it improves typed context,
approvals, telemetry, and durable agent options without changing the UI shape.

Mastra is a good fit if the operator snapshot becomes a durable workflow:
gather -> check -> rank -> dedupe -> create findings -> wait for approval ->
execute approved actions.

Eve is useful if the operator should live in multiple channels, such as scheduled
email or Slack digests, but it is not required for the first in-product version.

## Assumptions To Test

- **The overview snapshot is enough:** structured findings inside `/overview`
  reduce missed follow-ups without needing a separate agent service.
- **Deterministic checks carry most of the value:** due dates, failed jobs, stale
  queues, and missing assignments create useful findings before model judgment is
  added.
- **External channels change the runtime:** if daily digests, approvals, or
  follow-ups naturally happen outside the app, a separate agent deployment becomes
  more attractive.
- **The product remains the write boundary:** even a separate agent should route
  writes through approved app actions so publishing, sending, and outreach remain
  reviewable.

## Build Sequence

1. Add read-only operator checks for content pipeline, listening queue, lead pool,
   and sync health.
2. Render structured findings in `/overview`.
3. Add chat follow-up for a selected finding.
4. Add safe proposal actions, starting with draft-only content ideas.
5. Add scheduled daily snapshots.
6. Add action approvals for anything that writes.
7. Revisit Mastra or Eve when the workflow needs durable orchestration or
   external channels.

## Success Criteria

- `/overview` answers "what needs attention?" without the user prompting.
- Findings route directly to the surface where work gets resolved.
- The operator reduces missed follow-ups, stale queues, and sync blind spots.
- Write actions remain explicit and reviewable.
- The assistant feels like a back-office teammate, not a generic chatbot.
