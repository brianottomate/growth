# Growth MCP tool surface

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

The MCP tools and the in-app Growth assistant are projections of the same 31-tool
native AI SDK 7 catalog in `src/server/ai/capabilities`. MCP exposes the 30
connector-safe capabilities and omits only open-world `researchRead`. Read-only,
destructive, and idempotency annotations are derived from the same action policy
used by chat receipts and approvals. Growth runs
ordinary drafts, plans, and reversible workspace edits immediately once the
operator's intent is clear. A future tool that publishes or sends externally
must opt into user approval in policy; MCP clients can additionally honor the
standard destructive hint.

The external MCP projection omits Growth's `researchRead` tool. ChatGPT and
Claude already provide open-world browsing; Growth contributes the durable
workspace, strategy, content, media, and publishing operations.

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
- draft a non-persistent moment blueprint, then commit an approved plan;
- propose cadence and mix changes from own performance and peer behavior.

The endpoint is intentionally not anonymous and no longer accepts Better Auth
session tokens as MCP credentials. Use a standards-based OAuth access token with
the MCP resource URL as its audience.
