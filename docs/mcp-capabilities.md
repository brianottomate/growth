# Growth MCP tool surface

For the product and architecture handoff, including the chat editing model,
domain design, provider boundaries, and current gaps, read
[`ai-mcp-handoff.md`](ai-mcp-handoff.md).

Growth exposes its canonical AI capability registry over Streamable HTTP at:

```text
POST /api/mcp
GET  /api/mcp
```

The endpoint is an OAuth 2.1 protected resource backed by Better Auth. ChatGPT,
Claude, and other remote MCP clients discover the authorization server through:

```text
GET /.well-known/oauth-protected-resource
GET /.well-known/oauth-authorization-server
GET /.well-known/openid-configuration
```

Dynamic client registration and PKCE are supported. The grant is deliberately
simple (`growth:all` plus the standard identity/offline scopes), but each
tool retains its policy metadata so the grant can become more granular
later without rewriting handlers.

During authorization Growth uses the user's live Wander membership, regardless
of the session's active organization. Users without Wander membership are refused;
there is no workspace selector. Consent submits the signed OAuth query so
continuation retains the client request and rejects tampering. Better Auth stores
Wander in the consent, access token, and refresh token `referenceId` and signs it
into the access token as `org_id`. Token issuance re-checks live Wander membership
and rejects grants for another organization. The MCP endpoint verifies issuer,
audience, expiry, and scope, then re-checks the user's live Wander membership on
every request. There is no parallel connector table or browser-session fallback.

The MCP tools and the in-app Growth assistant are projections of the same
native AI SDK 7 catalog in `src/server/ai/capabilities`. Executable names use
`capability__action`, with required fields and policy hints for that operation.
Hosts should refresh their tool catalog after this naming cutover. MCP exposes connector-safe capabilities and omits open-world `researchRead` and in-app
`driveRead`. Read-only, destructive, and idempotency annotations are derived
from the same action policy used by chat receipts and approvals. Growth runs
drafts, plans, workspace edits and paused provider writes (a push creates
everything paused) immediately once the operator's intent is clear.

Actions whose policy needs a person's yes (starting spend, irreversible
deletes, sends and publishes, and the ad and catalog sign-offs) are exposed
over MCP too. Before running one, the server returns `input_required` with a
form elicitation (protocol revision 2026-07-28, multi-round-trip, so no server
session is needed); the client asks the person and calls again with the
answer. A client set to always allow the tool may answer for its person. A
client that cannot elicit, including any on the 2025 protocol, gets a refusal
and nothing runs. `invoke_growth` cannot ask, so it never gets these actions.

The external MCP projection omits Growth's `researchRead` and `driveRead` tools.
ChatGPT and Claude already provide open-world browsing and their own Drive
connectors. Growth contributes the durable workspace, strategy, content, media,
and publishing operations. A host can still pass resolved Drive file IDs to
Growth's `contentMediaWrite.importFromDrive` action so Growth fetches and stores
the bytes without sending them through the model.

Alongside the precise capability tools, MCP exposes `invoke_growth`. This coarse facade
accepts one natural-language workspace request and delegates it to an internal
Growth run over those same connector-safe tools, bounded to eight steps and
without recursive access to itself. It is useful for hosts that prefer one agent
tool over loading the full detailed interface; the capability tools remain
available for deterministic composition and inspection.

The Performance launch checklist supports atomic bulk milestone updates through
`performanceRead__launchChecklist` and `performanceWrite__recordLaunchChecklist`.
These record progress with provenance without performing the underlying tasks.
See [recorded launch checklist](performance-launch-checklist.md) for item IDs,
workflow completion points, and revision handling.

Notable portable workflows:

- inspect the workspace, brands, brand maps, audiences, content, ads, and signals;
- inspect and edit Product Atlas graphs and storefront target content;
- route stale storefront updates and confirm external surfaces after completion;
- return canonical navigation URLs;
- render selected social post IDs as platform-aware inline MCP App previews;
- show upcoming content, pipeline summaries, production queues, and top ads as interactive MCP Apps (see [workbench](connector-ui-workbench.md));
- discover brand handles and save reviewable channel suggestions;
- scrape public posts with a durable ingest-run record;
- sync owned history, website structure, and blog articles;
- analyze media with human-managed vocabulary and optional steering;
- propose grouping and series structure for human review;
- search content ideas and platform drafts before creating duplicate work;
- import public cloud-design images or prepare/finalize direct uploads from
  local Claude Code artifacts, then turn the ordered pool into platform-native
  carousels;
- draft a non-persistent moment blueprint; accepted work is materialized through
  the product review flow rather than an AI commit macro;
- propose cadence and mix changes from own performance and peer behavior.
- prepare first comments, then approval-gate Zernio schedule, publish-now,
  reschedule, and queued-first-comment updates;
- plan a human amplification request without sending it, then explicitly notify
  one stored Slack member with an idempotent provider receipt;
- read brand-scoped ad performance through the default-deny account registry.

For a content operator connecting a personal Claude client, use
[`claude-mcp-setup.md`](claude-mcp-setup.md).

The in-app assistant receives the operator's current `/app` location as
orientation, including verified entity context on supported detail routes. Page
location does not remove capabilities: the operator can ask for work owned by
another domain, then use `navigateWorkspace` to open the best inspection or
editing surface. Named destinations cover the stable workspace map, while a
safe internal-path fallback keeps new `/app` routes navigable before the named
catalog is updated.

The endpoint is intentionally not anonymous and no longer accepts Better Auth
session tokens as MCP credentials. Use a standards-based OAuth access token with
the MCP resource URL as its audience.

## Protocol compatibility

The production endpoint uses the official TypeScript MCP server and client
packages. Each request receives a fresh server instance, so MCP 2026-07-28 is
stateless and safe to distribute across Vercel instances. Existing clients can
continue negotiating the stateless 2025 transport while ChatGPT and Claude
migrate independently. No server-side MCP session store is required.

The retained local protocol smoke test covers one modern SDK round trip and
verifies the connector-safe catalog. It does not exercise the legacy fallback:

```sh
bun run test:mcp:protocol
```

After deployment, use an OAuth access token without printing it:

```sh
GROWTH_MCP_TOKEN=... bun run smoke:mcp:modern
```

### Individual ad studio work

`adsRead.ideaContext` takes an `adId`, with or without a campaign, and returns
the current editable document/version, ordered image references, the stored
storyboard boards (or poster) of any video, brand voice, and listing facts for
represented houses. Use `adsWrite.saveIdea` to save copy and composition
recipes as a draft. External MCP clients must visually inspect the returned image
references; JSON URLs alone are not image input. The in-app ad card's Work in chat
action starts a fresh thread and supplies numbered contact sheets as model image
inputs, including size-specific source variants. It preserves ad focus in the
thread and leaves approval and publishing to the existing workflow.

### Conversation choices and result contracts

`presentNextOptions` returns grounded answer, request, and editable-detail
choices with an inline MCP Apps resource. Selection sends an ordinary user
message through the host. The same contract drives native chat choices.

Domain result schemas advertise action-specific success envelopes and
structured failures. Every action and native tool declares a complete result
contract, enforced after JSON normalization and before receipts or transport.
Provider extension metadata remains explicit JSON; domain records have named
fields. See [output contracts](ai-output-contracts.md) for coverage and recovery,
and [chat turn control](chat-turn-control.md) for queue, steering, approval
boundaries, migration, and verification details.

Launches is retired from the assistant/MCP catalog and primary navigation. Launch pages and service actions are removed as well. The schema retirement removes the launch table and the three nullable launch links; products, campaigns, series, and content posts remain.

Native operation catalogs preserve each action's input and service result types.
The receipt adapter exposes the JSON wire result contract (dates become ISO
strings) plus the compact error envelope. Dynamic discovery accepts unknown
input only through schema-validated dispatch. Fresh results and replayed
receipts are validated against the same contract; replay rechecks current
membership and surface policy before reading the receipt. Reused call IDs with
different tools or inputs are rejected without repeating the operation. Output
contract failures require inspecting saved state before repeating a write.

### Manual browser listening evidence

`listeningWrite.importBrowserRun` retains one immutable brand-scoped audit record
in the existing content ingest store. The operator supplies the run window,
report, observations, decisions, optional drafts, and any posting receipts with
their authorization. Canonical URL checks reject duplicate post identities,
wrong parent links, and mismatched X receipt accounts. These checks validate the
supplied record; they do not verify public delivery.

`listeningRead.browserRuns` returns recent summaries. Passing `runId` includes
that run's captures. Both actions verify that the selected brand belongs to the
current workspace. A run key replays identical evidence and rejects changed
input. Browser capture, posting, Slack notification, and the global mention
queue remain separate operations. This feature adds no database columns.

Initiatives provide optional workspace-level coordination across organic series,
standalone content posts and paid campaigns. `initiativeRead` exposes `list`,
`get` and eligible membership `options`; `initiativeWrite` exposes `save`, `link`
and `unlink`. These are local operations shared with `/app/initiatives`, with
workspace checks and one typed FK membership table. See [Initiatives](initiatives.md).

## Performance Email sequences

`emailRead` exposes listSequences, getSequence, sequenceEmails, previewSequence and
sequenceStatus. `emailWrite` exposes saveSequence, prepareSequence, pauseSequence,
cancelSequenceEnrollment and archiveSequence. These use the same scoped services
as the Performance Email forms. Draft edits use last-write-wins.

activateSequence, enrollSequence and recoverSequence require in-app approval and
are omitted from MCP and invoke-growth. Ingest credentials remain UI-only.
See [delivery semantics](lifecycle-execution.md).

## Reusable audience seeds

`seedRead` lists a brand's seed lists and where each stands on Meta, and reads
Meta's processing status. `seedWrite` builds a list from a template (the brand's
own past bookers or an email list; Wander travelers by towns, similar homes, a
persona or a description), refreshes it, uploads it to its owner's Meta account
(Wander's for Wander travelers, otherwise the brand's own), builds a lookalike,
records the client's shared copy and attaches it to campaign audiences or
personas. Upload and lookalike creation require operator approval and never
spend. About 1,000 people is a guideline for a useful lookalike, not a gate. Same action definitions
serve `seed.*` oRPC. See [model, existing-versus-new and workflow](seed-audiences.md).

## Reference boards

`referenceBoardRead` lists boards, reads their visible references and proposals,
and lists approved brand media. `referenceBoardWrite` edits boards and reference
occurrences, saves proposals and accepts one reviewed proposal into a local
content idea or ad shell. These share their service with Landscape's board UI.
Acceptance is atomic and replay-safe; source artwork is never copied into the
draft. See [reference boards](reference-boards.md).

## Article review history

Article writing returns a candidate for review. `creativeRead.articleHistory`
and `articleRevision` expose immutable snapshots, while `creativeWrite` adds
`acceptArticle`, `acceptCurrentArticle`, `restoreArticle` and `dismissArticle`.
Edits retain history and clear current editorial acceptance. These local actions
share the editor's service and leave CMS publication separate. See
[article review and recovery](article-history.md).

## Content workbooks

`workbookRead` lists and reads saved workbook mappings and current brand options. `workbookWrite.import` parses CSV/TSV or base64 XLSX without a model; `save` edits the mapping; `apply` accepts the exact reviewed document into local content drafts with a durable receipt. These are the same actions used by the app. No provider delivery runs during import or apply.
