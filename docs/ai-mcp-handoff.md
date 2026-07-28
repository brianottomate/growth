# Growth AI and MCP handoff

Status: current as of 2026-07-28.

This document explains how Growth approaches chat editing, domain tools, MCP,
provider access, and product safety. It is meant for engineers and operators who
need to extend the system without reconstructing the decisions from commit
history.

## What we are building

Growth has one model-facing product contract. The in-app assistant, the focused
planner, and the remote MCP server all use projections of the same AI SDK tool
definitions.

The intended product experience is broad: an operator should be able to discuss
work in chat, inspect live organization state, make an agreed workspace edit,
and open the normal product page where the result can be reviewed. The current
page gives the assistant context. It does not fence the assistant into one
feature.

"Everything is editable through chat" is a direction, not a claim that every
tRPC procedure is already an AI action. Growth exposes a domain only when its
model-facing vocabulary, policy, and operator outcome are clear. Provider sends,
publishes, deletes, campaign changes, and other irreversible operations need an
explicit policy and approval path.

## The four product surfaces

| Surface          | Contract                | Purpose                                                                                     |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| Global assistant | 34 canonical tools      | Broad chat across the Growth workspace. Every tool remains available on every page.         |
| Planner chat     | 3 read-only tools       | A focused Form or Chat flow for brand context, research, and a reviewable moment blueprint. |
| Detailed MCP     | 32 connector-safe tools | Deterministic remote access to Growth domains through OAuth.                                |
| `invoke_growth`  | 1 coarse MCP facade     | A bounded internal Growth run for hosts that prefer one natural-language tool.              |

The 34 canonical tools contain 103 advertised actions. The wire-visible MCP
surface has 33 tools: 32 detailed domain tools plus `invoke_growth`.

The planner projection contains `brandRead`, `researchRead`, and
`planningRead`. It does not own another registry and does not limit the global
assistant or MCP.

MCP excludes `researchRead` because the host normally has web access. It also
excludes `driveRead` because ChatGPT, Claude, and other hosts have stronger Drive
connectors. A host can resolve file IDs itself and pass them to
`contentMediaWrite.importFromDrive`. Growth then fetches and stores the bytes
server-side.

## The canonical tool contract

`OVERVIEW_TOOLS` in `src/server/ai/capabilities/index.ts` is the executable
source of truth. It contains ordinary AI SDK tools.

Most product domains use a read tool and a write tool:

- `productAtlasRead` and `productAtlasWrite`
- `storefrontRead` and `storefrontWrite`
- `audienceRead` and `audienceWrite`
- `contentStrategyRead` and `contentStrategyWrite`
- `strategyRead` and `strategyWrite`
- `planningRead` and `planningWrite`
- `lifecycleRead` and `lifecycleWrite`

Each domain tool accepts a root object with an `action` field. The action selects
a strict input schema and a direct handler. For example, `storefrontWrite`
contains create, update, freshness, ownership, sibling-copy, and reference
actions. Those actions share one model vocabulary and one product surface, so a
single tool is easier for the model to choose than eight unrelated top-level
tools.

Not every capability needs a pair. Growth keeps specialized tools when a domain
pair would be artificial or would mix very different consequences:

- `workspaceOverview` gathers a broad operational snapshot.
- `navigateWorkspace` returns a canonical app route.
- `prepareProductionPacket` saves a reviewed creative handoff.
- `adsRead` is intentionally read-only.
- `publishingRead` inspects connections and published work.
- `sourceSyncWrite` runs explicit source discovery and synchronization.
- `contentMediaWrite` owns attachments, imports, uploads, and carousel assembly.

There is no hidden atomic tool registry behind these tools. The handlers are
plain product actions. Chat, MCP, policy, UI labels, and receipts all refer to
the same capability and action IDs.

## Current domain coverage

| Area                     | Current model-facing surface                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Workspace and navigation | Overview, named navigation, and a validated `/app` path fallback                           |
| Brands                   | Brand list, map, and next-action readiness                                                 |
| Product Atlas            | Read and write                                                                             |
| Storefronts              | Read, write, references, freshness, and ownership                                          |
| Audiences                | Read and write                                                                             |
| Content                  | Pipeline, search, work-item reads, canonical edits, cross-posts, and platform posts        |
| Content media            | Attachments, recovery, uploads, remote imports, Drive imports, and carousels               |
| Editorial email          | Read drafts, create slots, save edits, and request a draft job                             |
| Content structure        | Pillars, series, groupings, and organization                                               |
| Ads                      | Scope, performance, alignment diagnosis, and conversion inspection                         |
| Publishing               | Connection state and timeline navigation                                                   |
| Source sync              | Channel discovery, registration, public-post scrape, owned history, website, and blog sync |
| Media analysis           | Durable image and video analysis                                                           |
| Strategy                 | Channel cadence, series cadence, brand mix, and target proposals                           |
| Planning                 | Slot previews, moment blueprints, and cadence-driven slot generation                       |
| Amplification            | Rolodex reads and platform-post amplification requests                                     |
| Leads                    | Headline pipeline summary                                                                  |
| Lifecycle                | Program and step reads and writes, campaign linking, cleanup state, archive, and restore   |
| Listening                | Recent mentions and triage                                                                 |

This table describes the model contract, not every feature in the application.
Several app surfaces intentionally remain outside the global catalog for now.

## Page context and navigation

The assistant rail stays mounted while the operator moves through the app. Every
request includes the current pathname. The server turns that path into an
organization-safe prompt section.

Supported detail routes can add verified entity context such as a content item,
series, Product Atlas product, or storefront. General routes add domain
guidance. A page can suggest which read action should come first, but it cannot
remove tools or grant access.

`navigateWorkspace` has two lanes:

1. Named destinations for the stable workspace map.
2. A validated internal `/app` path for a real route that has not been added to
   the named catalog yet.

The fallback rejects external URLs and non-workspace paths. It keeps navigation
usable while the app grows, but the named catalog should still be updated when a
new surface becomes permanent.

## Execution, policy, and receipts

Every advertised action has one policy entry in
`src/server/ai/kernel/policy.ts`. Policy records:

- allowed surfaces
- consequence type
- approval requirement
- idempotency
- reversibility
- an undo action when one exists

The runtime rechecks organization membership and action policy at execution
time. It does not trust a tool definition merely because the model received it.

Local reversible edits can run after a clear operator request. The chat should
not add a second approval card after the operator has already agreed to the
exact change. Provider sends, publishes, destructive deletes, campaign changes,
and irreversible provider mutations require explicit policy and operator
approval.

Each tool call writes a receipt. The receipt includes the capability, action,
identity, surface, input, output, and run. Replaying the same tool-call ID
returns the prior result instead of repeating the side effect. Assistant runs
and messages are durable, so navigation or a browser disconnect does not cancel
accepted work.

## MCP authentication and organization scope

The production MCP resource is:

```text
https://growth-red.vercel.app/api/mcp
```

It is an OAuth 2.1 protected resource backed by Better Auth. Clients discover
authorization metadata through the standard well-known endpoints. Dynamic
client registration and PKCE are supported.

During authorization, the user chooses one Growth organization. The access
token carries that organization as `org_id`. The MCP route verifies issuer,
audience, expiry, and scope, then checks live organization membership on every
request.

The route does not fall back to the browser session, the first organization, or
a separate connector record. Removing a user from the organization removes MCP
access without waiting for another synchronization job.

MCP registers the same connector-safe tools individually and adds
`invoke_growth`. The coarse facade can use those tools for up to eight steps. It
cannot call itself and it has no open-world research tool.

## Growth-owned provider boundaries

Provider code stays in Growth when it belongs to Growth operations:

- DatoCMS draft publishing
- Google Drive media import
- Customer.io lifecycle and delivery workflows
- Outreach sales engagement
- HubSpot lead context and projections
- Instantly cold-email projections
- BigQuery demand and funnel inputs
- Cloudflare R2 media storage
- direct Gemini and optional Fal creative generation

Being present in the repository does not automatically make a provider
operation available to chat or MCP. The model-facing action still needs a
bounded input, organization scope, policy, and an operator outcome that can be
explained and verified.

DatoCMS is a good example. `contentWrite.publishBlogDraft` creates an external
CMS draft. It does not publish the article live. Drive is another: the in-app
assistant can browse Drive, while remote MCP hosts use their own Drive connector
and hand Growth resolved file IDs.

## Problems that shaped the current design

### Too many atomic tools

The early assistant accumulated many narrow tools. The model had to choose
between implementation-shaped names, and each surface risked building its own
list.

The current catalog groups actions by a model-selectable product domain. The
grouping is direct. It does not hide the old atomic tools under another layer.

### Grouped schemas that providers could not use

Some grouped tools initially produced unions that looked valid in TypeScript but
were rejected by model providers. Flattening everything into one optional-field
object fixed transport compatibility but weakened validation.

The current tool exposes a provider-compatible root object with `action`, then
validates the selected action against a strict discriminated schema before
execution.

### Tool counts treated as a ceiling

Contract checks briefly froze exact tool counts. Adding a legitimate capability
then failed as if catalog growth were an error.

The contract gate now checks registry, catalog, policy, schema, and surface
parity. Counts are useful diagnostics, not a product limit.

### A planner macro with too much authority

The old `commitMomentPlan` macro combined a broad planning decision with a write.
It obscured which product actions would run and made the focused planner harder
to reason about.

The planner is now a three-tool read-only projection. It drafts a reviewable
blueprint. Accepted work is materialized through the product review flow rather
than an AI commit macro.

### Page context became a capability restriction

The persistent assistant once identified every page as the Next surface. The
server used that mode to remove tools from the model. Operators could open a
Product Atlas or storefront page and still lack the matching tools.

Page context now guides the assistant without limiting the canonical catalog.
The operator can request work from another domain, then navigate to the right
page to inspect the result.

### Navigation drifted behind the app

A hard-coded destination enum missed real Growth routes. The named route map now
covers the stable workspace, and the safe internal-path lane handles a new route
until the map catches up.

### Provider duplication widened MCP

Remote hosts often have better web and Drive connectors than Growth. Exposing
weaker duplicates increased tool count and confused responsibility.

MCP leaves research and Drive discovery to the host. Growth keeps the product
operation that imports a resolved Drive file into its own media system.

## Intentional gaps and holds

The global assistant is broad, but several areas are deliberately incomplete:

- Spend is reserved for a dedicated agent.
- The blog is delegated, not a domain pair. `blogAgent` hands one task to a
  sub-agent in `src/server/ai/blog-agent/`, which owns bespoke DatoCMS tools
  (describeModel, listModels, getArticle, createDraft, updateFields,
  insertBlock, previewUrl) for the length of that call. Editing a CMS record is
  a discover-write-verify loop, so seven more top-level tools would widen the
  catalog for an occasional job, and one do-everything action would hide which
  writes ran. The sub-agent returns the trail of tools it called, so individual
  writes stay visible. It works in drafts only: `publishArticle` exists but
  refuses, because publishing is a human decision.
- The initiative and campaign API needs another product pass before it becomes
  a general `campaignRead` and `campaignWrite` contract.
- The inbox does not expose provider reply actions to the global assistant.
- Leads exposes a summary, not the full enrichment, merge, and outreach API.
- Affiliate operations are not in the canonical catalog.
- Listening exposes recent triage, not full source configuration.
- Transactional messages do not have a general AI write surface.

Transactional messages and newsletters are different products. A newsletter is
editorial work with a chosen issue, audience, draft, review, and delivery
process. A transactional message is a product-event email definition such as a
password reset or booking event. Its timing comes from the product event. It
belongs in the transactional registry even when both products use React Email
or the same delivery provider.

These gaps should be visible in page context and documentation. The assistant
must not imply that a missing action exists.

## How to add or expand a domain

Use this sequence:

1. Start with the operator outcome. Define what the user can ask for and what
   evidence proves it happened.
2. Put business logic in a product service. Do not make the AI layer the only
   caller or owner of the behavior.
3. Add a direct action handler under `src/server/ai/capabilities/`.
4. Add the action to an existing coherent domain tool, or create a read and
   write pair when the domain has a compact model vocabulary.
5. Update `src/lib/growth-capabilities.ts`.
6. Add action policy in `src/server/ai/kernel/policy.ts`.
7. Decide which surfaces may advertise it. Provider and host duplication should
   be considered here.
8. Add or update the assistant card only when the result needs a distinct
   visual treatment.
9. Update page guidance and named navigation if the feature has a durable app
   surface.
10. Run the contract and product checks.

Keep a specialized top-level tool when grouping would create an optional-field
bag, combine unrelated consequences, or hide an important product interaction.
Do not create another registry to preserve old tool names.

## Sub-agents

A few jobs are loops rather than actions. Editing a CMS record means: discover
the schema, read the record, write, look at the result, correct. The operator
asks for one outcome, but reaching it takes an unknown number of dependent
steps whose shape depends on what the previous step returned.

Neither existing option fits. A domain read/write pair would push every step
into the global catalog, so the assistant carries eight more tools for a job it
does occasionally. A single do-everything action would hide which writes ran,
which is the `commitMomentPlan` mistake.

A sub-agent is the third shape. One tool in `OVERVIEW_TOOLS` delegates a task
to an agent that owns bespoke tools for the length of that call. The tools are
exposed on demand instead of permanently.

`blogAgent` is the reference implementation:

- `src/server/ai/capabilities/blog.ts` — the single catalog entry. Ordinary
  `growthTool`, registered in `growth-capabilities.ts` and `policy.ts` like
  anything else.
- `src/server/ai/blog-agent/tools.ts` — the bespoke tools (`describeModel`,
  `listModels`, `getArticle`, `createDraft`, `updateFields`, `insertBlock`,
  `previewUrl`, `publishArticle`). Built by `buildBlogTools(ctx)` per call.
- `src/server/ai/blog-agent/persona.ts` — how it works and what it may not do.
- `src/server/ai/blog-agent/run.ts` — the loop.

Rules that keep a sub-agent from becoming a macro:

1. **Return the trail.** Every tool call appends to `ctx.trail`, which comes
   back in the tool result. Delegation must not make writes invisible; a
   reviewer can still see that the agent read before it wrote.
2. **Each inner tool stays one discrete product action.** No inner tool bundles
   a judgment with a write. The loop supplies the sequencing.
3. **Discover, do not hardcode.** The agent reads the live schema rather than
   assuming fields, so a CMS change does not silently corrupt writes.
4. **Bound the loop.** `stopWhen: stepCountIs(20)` — high enough to finish a
   real task, low enough that a confused agent stops.
5. **Gate the dangerous verb explicitly.** `publishArticle` exists with a full
   schema and refuses in its body, so the agent knows publishing exists and
   that it is not its call. Enabling it means adding an approval gate, not
   editing the prompt.
6. **Say what it did not do.** The persona requires naming gaps. An agent that
   quietly drops half a task is worse than one that reports the half it left.

Reach for a sub-agent only when the work is genuinely iterative and the tools
would otherwise be dead weight in the catalog. A one-shot action is still an
action.

## File map

| Concern                                     | Source                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| Canonical catalog                           | `src/server/ai/capabilities/index.ts`                                         |
| Domain assembly                             | `src/server/ai/capabilities/domains.ts`                                       |
| Client-safe IDs and actions                 | `src/lib/growth-capabilities.ts`                                              |
| Action schemas and handlers                 | `src/server/ai/capabilities/*.ts`                                             |
| Consequence and approval policy             | `src/server/ai/kernel/policy.ts`                                              |
| Execution context, membership, and receipts | `src/server/ai/kernel/runtime.ts`                                             |
| Page awareness                              | `src/server/ai/kernel/page-context.ts`                                        |
| Navigation map and safe fallback            | `src/lib/workspace-navigation.ts`                                             |
| In-app assistant route                      | `src/app/api/overview/chat/route.ts`                                          |
| Focused planner route                       | `src/app/api/plan/chat/route.ts`                                              |
| MCP projection and facade                   | `src/server/ai/capabilities/to-mcp-server.ts`                                 |
| OAuth MCP route                             | `src/app/api/mcp/route.ts`                                                    |
| Durable sessions and run journal            | `src/server/db/creative-work-schema.ts` and `src/server/ai/kernel/journal.ts` |
| Existing MCP details                        | `docs/mcp-capabilities.md`                                                    |
| Kernel details                              | `docs/ai-kernel.md`                                                           |

## Local verification

Use Bun.

```bash
bun test
bun run ai:contracts
bun run check
```

`bun run ai:contracts` checks catalog and policy parity, provider-compatible
schemas, MCP projection, and consequence guards. Use `bun run ai:gauntlet` only
with a current non-production Neon branch because it performs isolated live
database and receipt checks.

For local browser work, `GET /api/dev/login` creates a real development session
and returns 404 in deployments. The production application and MCP server deploy
together through the `wanderdev/growth` Vercel project.

## Practical review questions

Before approving a new AI or MCP action, ask:

- Is this a product operation or a provider implementation detail?
- Can the model choose the domain from the operator's language?
- Does the action have one strict input and a verifiable result?
- Is the organization scope checked at execution time?
- Does the consequence require approval?
- Is the host likely to have a better connector already?
- Does the result need a product page, a tool card, or both?
- Does the action belong in the global assistant, detailed MCP, the planner, or
  a dedicated agent?

If those answers are clear, adding the capability is usually mechanical. If
they are not, the domain contract needs more product work first.
