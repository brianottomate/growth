# Growth AI and MCP handoff

Status: current as of 2026-07-29.

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
oRPC procedure is already an AI action. Growth exposes a domain only when its
model-facing vocabulary, policy, and operator outcome are clear. Provider sends,
publishes, deletes, campaign changes, and other irreversible operations need an
explicit policy and approval path.

## The four product surfaces

| Surface          | Contract                | Purpose                                                                                     |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| Global assistant | 40 canonical tools      | Broad chat across the Growth workspace. Every tool remains available on every page.         |
| Planner chat     | 3 read-only tools       | A focused Form or Chat flow for brand context, research, and a reviewable moment blueprint. |
| Detailed MCP     | 37 connector-safe tools | Deterministic remote access to Growth domains through OAuth.                                |
| `invoke_growth`  | 1 coarse MCP facade     | A bounded internal Growth run for hosts that prefer one natural-language tool.              |

The 40 canonical tools contain 130 advertised actions, including approval-only
`adsWrite` actions for Zernio Meta and Google campaign creation. The
wire-visible MCP surface has 38 tools: 37 detailed domain tools plus
`invoke_growth`.

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
- `adsRead` owns performance, alignment, conversion inspection, and allowlisted
  destination discovery.
- `adsWrite` owns approved Zernio Meta and Google campaign mutations and is
  limited to the in-app approval surface.
- `publishingRead` inspects connections and published work.
- `sourceSyncWrite` runs explicit source discovery and synchronization.
- `contentMediaWrite` owns attachments, imports, uploads, and carousel assembly.

There is no hidden atomic tool registry behind these tools. The handlers are
plain product actions. Chat, MCP, policy, UI labels, and receipts all refer to
the same capability and action IDs.

## Current domain coverage

| Area                     | Current model-facing surface                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Workspace and navigation | Overview, named navigation, and a validated `/app` path fallback                             |
| Brands                   | Brand list, map, and next-action readiness                                                   |
| Product Atlas            | Read and write                                                                               |
| Storefronts              | Read, write, references, freshness, and ownership                                            |
| Audiences                | Read and write                                                                               |
| Content                  | Pipeline, search, work-item reads, canonical edits, cross-posts, and platform posts          |
| Content media            | Attachments, recovery, uploads, remote imports, Drive imports, and carousels                 |
| Blog                     | Full draft reads and review, Dato draft creation and editing, image replacement, and preview |
| Editorial email          | Direct read/write actions plus a draft-only newsletter specialist for iterative issue work   |
| Content structure        | Pillars, series, groupings, and organization                                                 |
| Ads                      | Scope, performance, alignment diagnosis, and conversion inspection                           |
| Publishing               | Connection state and timeline navigation                                                     |
| Source sync              | Channel discovery, registration, public-post scrape, owned history, website, and blog sync   |
| Media analysis           | Durable image and video analysis                                                             |
| Strategy                 | Channel cadence, series cadence, brand mix, and target proposals                             |
| Planning                 | Slot previews, moment blueprints, and cadence-driven slot generation                         |
| Amplification            | Rolodex reads and platform-post amplification requests                                       |
| Leads                    | Headline pipeline summary                                                                    |
| Lifecycle                | Program and step reads and writes, campaign linking, cleanup state, archive, and restore     |
| Listening                | Recent mentions and triage                                                                   |

This table describes the model contract, not every feature in the application.
Several app surfaces intentionally remain outside the global catalog for now.

## Page context and navigation

The assistant rail stays mounted while the operator moves through the app. Every
request includes the current pathname. The server turns that path into an
organization-safe prompt section.

Supported detail routes can add verified entity context such as a content item,
series, Product Atlas product, storefront, or Dato-backed blog article. General
routes add domain guidance. A page can suggest which read action should come
first, but it cannot remove tools or grant access.

The blog detail route demonstrates a useful extension of this pattern. On
desktop it opens the assistant beside the draft and supplies the verified
`platform_post` and Dato item IDs. The operator can say "review this article" or
"use this image as the hero" without restating which record is on screen. This
is convenience and grounding, not a separate page-scoped agent.

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

Social publishing follows the same rule. `contentWrite.setFirstComment` only
prepares local copy. `publishingWrite` is the one Zernio provider boundary for
schedule, publish-now, reschedule, and queued-first-comment updates. Every
action requires operator approval, and Growth advances delivery state only from
a Zernio receipt or signed webhook reconciliation.

Amplification keeps planning and contact separate. `amplificationWrite.request`
creates or updates a local target. `amplificationWrite.notify` is a separate,
approval-gated Slack write that tags the amplifier's stored member ID and saves
the returned channel and message timestamp. Repeating a successful notification
returns the saved receipt instead of posting twice.

Chat attachments follow the same boundary. Pasting an image gives the model
visual context, but does not save or upload anything by itself. When the
operator explicitly asks to use the image on the current blog article, Growth
verifies that the R2 URL belongs to that operator, passes it into the temporary
blog-agent run, uploads it to Dato, and patches only the requested image field.
The article remains a draft and still needs a human publish action.

The global in-app assistant is bounded at 20 top-level steps per turn. This is
room for a legitimate read, delegated specialist loop, verification, and
navigation sequence. It does not add tools or expand authority; the consequence
policy and the specialist's own bounds still apply to every call.

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

### An attachment looked writable before it was writable

The global assistant could already see a pasted image, and normal content work
could promote it into Growth's media library. That made "replace this blog
image" appear supported even though the Dato specialist had no way to receive
or upload the attachment.

The fix was not another permanent media tool. The current turn carries an
operator-owned attachment URL into `blogAgent`, and the inner
`uploadAttachment` action exists only for that specialist run. Ownership is
checked again before delegation, and the upload runs only after an explicit
request. This preserves a small global catalog without pretending visual input
and provider mutation are the same capability.

## Intentional gaps and holds

The global assistant is broad, but several areas are deliberately incomplete:

- Spend is reserved for a dedicated agent.
- The blog is delegated, not a domain pair. `blogAgent` hands one task to a
  sub-agent in `src/server/ai/blog-agent/`, which owns bespoke DatoCMS tools
  (`describeModel`, `listModels`, `getArticle`, `uploadAttachment`,
  `createDraft`, `updateFields`, `replaceBody`, `insertBlock`, `linkToGrowth`,
  `previewUrl`, and `publishArticle`) for the length of that call. Editing a CMS
  record is a discover, write, and verify loop, so exposing every specialist
  action globally would widen the catalog for an occasional job, and one
  do-everything action would hide which writes ran. The sub-agent returns the
  trail of tools it called, so individual writes stay visible. It works in
  drafts only: `publishArticle` exists but refuses, because publishing is a
  human decision.
- The campaign and platform campaign API needs another product pass before it becomes
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
into the global catalog, so the assistant carries ten more tools for a job it
does occasionally. A single do-everything action would hide which writes ran,
which is the `commitMomentPlan` mistake.

A sub-agent is the third shape. One tool in `OVERVIEW_TOOLS` delegates a task
to an agent that owns bespoke tools for the length of that call. The tools are
exposed on demand instead of permanently.

`blogAgent` is the reference implementation:

- `src/server/ai/capabilities/blog.ts`: the single catalog entry. Ordinary
  `growthTool`, registered in `growth-capabilities.ts` and `policy.ts` like
  anything else.
- `src/server/ai/blog-agent/tools.ts`: the bespoke tools (`describeModel`,
  `listModels`, `getArticle`, `createDraft`, `updateFields`, `replaceBody`,
  `insertBlock`, `linkToGrowth`, `uploadAttachment`, `previewUrl`,
  `publishArticle`).
  `uploadAttachment` is only useful when the invoking operator supplied an
  owned chat image for that run. Built by `buildBlogTools(ctx)` per call.
- `src/server/ai/blog-agent/persona.ts`: how it works and what it may not do.
- `src/server/ai/blog-agent/run.ts`: the loop.

Rules that keep a sub-agent from becoming a macro:

1. **Return the trail.** Every tool call appends to `ctx.trail`, which comes
   back in the tool result. Delegation must not make writes invisible; a
   reviewer can still see that the agent read before it wrote.
2. **Each inner tool stays one discrete product action.** No inner tool bundles
   a judgment with a write. The loop supplies the sequencing.
3. **Discover, do not hardcode.** The agent reads the live schema rather than
   assuming fields, so a CMS change does not silently corrupt writes.
4. **Bound the loop.** `stopWhen: stepCountIs(20)` is high enough to finish a
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

`newsletterAgent` is the second instance, over `email-document.service`. Its
temporary tools list brands, read an issue, create an issue, save a revision,
and return the review route. `sendIssue` exists but refuses. The specialist
wraps the same product services the newsletter UI calls rather than reaching
into tables directly. A sub-agent is another caller of the product, not a
private path into the database.

## Published mirrors and the platform_post spine

Blog and newsletter both drifted the same way, and it is worth naming so the
next provider integration does not repeat it.

Each product had a _published mirror_: `/app/blog` and `/app/newsletters` read
`platform_post` filtered by `externalKind` (`blog_article`, `broadcast`) and, until
recently, `publishedAt IS NOT NULL`. Drafting lived somewhere else entirely
(Dato records; `email_document` rows). So an artifact being worked on had no
home in the app until it shipped and was synced back.

The rule now: **`platform_post` is the spine for drafts too.** Anything that
creates content in a provider also creates or links its `platform_post` row, with
the provider id in `externalId`. The blog agent's `linkToGrowth` does this, and
`/app/blog` no longer filters to published-only. A record that exists only in a
provider is invisible to the team, which is how content goes missing.

### Ingest

Two ingest paths exist for the blog and they overlap:

- `blog-sync.service` reads the public RSS feed. It can only ever see published
  posts, and only what the feed exposes.
- The DatoCMS Content Delivery API (`datocms-cda.client`) is the same API
  wander.com renders from. With `X-Include-Drafts` it sees drafts too, and
  returns structured content rather than feed summaries.

Prefer the CDA. The feed path should become a fallback for sources that have no
API, not the primary route for our own CMS.

DatoCMS does support webhooks (three are already configured for cache
revalidation), so push ingest is possible. It is not worth it yet: an
on-demand "fetch new articles" reconcile is simpler to reason about, needs no
public endpoint or shared secret, and content volume is low. Revisit if latency
between publishing and appearing in Growth ever matters.

### Newsletter delivery is deliberately not wired

Customer.io is reachable from services and `/api/lab/*` routes, but is NOT
exposed to the AI layer, and `newsletterAgent.sendIssue` refuses. Sending is
irreversible in a way drafting is not.

When we do wire it, the shape should be: a product service that owns delivery,
an approval gate in front of it, and only then an action that calls it. The
same order the rest of the catalog follows. Same reconcile question as the blog:
prefer an on-demand "fetch recent broadcasts" over a Customer.io webhook until
volume justifies the endpoint.

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


## Tool selection and retired actions

Native chat exposes individual `capability__action` operations. Each operation
advertises only its own required inputs and success output. Anthropic BM25 tool
search discovers deferred operations. Workspace overview, brand listing,
next options and job status stay eager. Discovery wraps the shared runtime after
membership, approval and receipt hooks are installed. Saved grouped approvals
receive a temporary compatibility tool for the exact pending action.

MCP advertises the same individually scoped operations with per-operation hints
and surface policy. Provider search belongs to native chat and the invoke facade;
external MCP hosts manage discovery themselves. Clients should refresh tools/list
after this catalog cutover. Saved completed grouped results remain readable.

Eight long-running operations return a job handle: channel discovery, post
scraping, owned-content sync, website sync, blog sync, image analysis, storefront
reference capture and Drive import. Workers run through Next after() and the
shared receipt runtime. `operationRead__status` returns the original validated
result. Runs belong to their initiating user and organization. Platform timeouts
become interrupted after the execution window; inspect saved state before retrying.
This uses Vercel's bounded request lifetime and has no automatic job retry.

The app watches completed write receipts every 30 seconds while visible, and on
focus or chat completion. It invalidates affected query domains and refreshes
server components, covering MCP writes and background completion even with chat
closed. Accepted jobs do not signal a completed write. Failed receipts also
refresh because a write can complete before output validation fails.

Brand enrichment and intake application return source evidence and exact saved
field values. Chat shows an expandable changes-and-sources card. Extracted website
text and intake submissions are source material, not independently verified facts.

Brand offboarding uses the brand settings UI. `brandWrite.previewPurge` and
`brandWrite.purge` were removed from AI definitions and output contracts.
Standard Meta and all Google creation uses local drafts followed by `push`.
`createGoogle` and `createMetaDraft` were removed; the narrower
`createSpecializedMetaDraft` preserves lead generation, lead conversion,
app promotion and catalog sales until the draft compiler supports those goals.
Google platform settings preserve separate display-image crops through push.
