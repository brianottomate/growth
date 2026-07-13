# the growth workspace MCP capability surface

the growth workspace exposes its canonical AI capability registry over Streamable HTTP at:

```text
POST /api/mcp
GET  /api/mcp
```

Authenticate with a Better Auth session token:

```text
Authorization: Bearer <session-token>
```

The token resolves to a user and organization on every request. Capability
handlers repeat organization or tracked-brand access checks; the model never
supplies its own organization id.

The MCP tools and the in-app Growth assistant are adapters over the same registry
in `src/server/ai/capabilities`. Read-only and destructive annotations are derived
from each capability. In chat, mutating capabilities pause for an approval card.
MCP clients should use their normal confirmation policy for tools carrying a
destructive hint.

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

The endpoint is intentionally not anonymous. OAuth discovery and first-class API
key management can be added later; the initial deployed contract reuses signed-in
user sessions so permissions stay aligned with the application.
