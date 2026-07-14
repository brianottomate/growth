# the growth workspace MCP capability surface

the growth workspace exposes its canonical AI capability registry over Streamable HTTP at:

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
capability retains its read/write metadata so the grant can become more granular
later without rewriting handlers.

During authorization the user chooses one Wander organization. Better Auth
stores that organization in the consent, access token, and refresh token
`referenceId`; it is also signed into the access token as `org_id`. The MCP
endpoint verifies token issuer, audience, expiry, and scope and then re-checks
the user's live organization membership on every request. There is no parallel
connector table and no fallback to the browser session's active or first org.

The MCP tools and the in-app Growth assistant are adapters over the same registry
in `src/server/ai/capabilities`. Read-only and destructive annotations are derived
from each capability. In chat, mutating capabilities pause for an approval card.
MCP clients should use their normal confirmation policy for tools carrying a
destructive hint.

The external MCP registry omits Wander Growth's `research` capabilities. ChatGPT and
Claude already provide open-world browsing; Wander Growth contributes the durable
workspace, strategy, content, media, and publishing operations.

Notable portable workflows:

- inspect the workspace, brands, brand maps, audiences, content, ads, and signals;
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
