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

During authorization the user chooses one Growth organization. Better Auth
stores that organization in the consent, access token, and refresh token
`referenceId`; it is also signed into the access token as `org_id`. The MCP
endpoint verifies token issuer, audience, expiry, and scope and then re-checks
the user's live organization membership on every request. There is no parallel
connector table and no fallback to the browser session's active or first org.

The MCP tools and the in-app Growth assistant are projections of the same 37-tool
native AI SDK 7 catalog in `src/server/ai/capabilities`. MCP exposes the 35
connector-safe capabilities and omits open-world `researchRead` plus in-app
`driveRead`. Read-only,
destructive, and idempotency annotations are derived from the same action policy
used by chat receipts and approvals. Growth runs
ordinary drafts, plans, and reversible workspace edits immediately once the
operator's intent is clear. A future tool that publishes or sends externally
must opt into user approval in policy; MCP clients can additionally honor the
standard destructive hint.

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

Notable portable workflows:

- inspect the workspace, brands, brand maps, audiences, content, ads, and signals;
- inspect and edit Product Atlas graphs and storefront target content;
- route stale storefront updates and confirm external surfaces after completion;
- return canonical navigation URLs;
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

Local protocol checks pin both paths and verify the connector-safe catalog:

```sh
bun run test:mcp:protocol
```

After deployment, use an OAuth access token without printing it:

```sh
GROWTH_MCP_TOKEN=... bun run smoke:mcp:modern
```
