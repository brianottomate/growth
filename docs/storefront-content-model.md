# Product Atlas and storefront model

Status: implemented v1, 20 July 2026

## Product boundary

A brand is the identity and reputation. A product is the thing a person hires
for a job. One owned brand may therefore have several products.

`product` is the small relational spine. Its typed `atlas` JSONB document holds
the complete graph of:

- jobs;
- journeys and ordered steps;
- stories;
- product surfaces and views;
- story/view connections;
- implementation references;
- lightweight observations.

Stable internal IDs connect graph nodes without creating a database table for
every node type. A view may reference an existing `web_page` row rather than
duplicating Growth Website inventory. The service accepts that reference only
when the page is active and belongs to the product's brand.

Product Atlas is not a backlog, ticket system, or release manager.

## Storefront boundary

One `storefront` row represents one product on one distribution surface.
Initial surface keys are:

- `apple_app_store`
- `google_play_store`
- `chrome_web_store`
- `chatgpt_connector`
- `claude_connector`
- `zoom_app_marketplace`

ChatGPT and Claude are separate records in the shared
`assistant_connector` family. Operators may copy target content between sibling
surfaces; the recipient is then marked stale.

Storefront content is an English-only typed JSONB document with positioning,
copy, platform-specific fields, and Media Library references. Screenshots have
their own ordered array and distinguish `product_ui` from
`marketing_composite`. Icons, screenshots, and promotional assets must
reference ready image assets owned by the product brand. Videos must reference
ready video assets from that same library.

`localized_content_url` is reserved for a future external localization
workflow. Growth does not store localized variants in v1.

## Freshness workflow

The target document in Growth and the external store dashboard are separate
systems:

1. Editing target content, listing state, or external links requires a stale
   note and marks the storefront `stale`.
2. A manager may mark stale without editing the target document.
3. An employee or agent updates the external surface.
4. The operator confirms the storefront `up_to_date`.

Focused columns (`stale_note`, `stale_marked_at`, `confirmed_at`) make the
operations queue cheap to query. A server-managed JSONB changelog retains
actors, timestamps, actions, notes, and changed paths. It is history, not
content versioning; full prior documents are not retained.

All mutations require the previously read `updatedAt` as an ISO timestamp.
Stale clients receive a conflict instead of silently overwriting newer work.

## Interfaces

The human UI and OAuth MCP share one organization-scoped service:

- `/app/product-atlas` and `/app/product-atlas/[productId]`
- `/app/apps` and `/app/apps/[storefrontId]`
- direct `productAtlasRead` / `productAtlasWrite` and
  `storefrontRead` / `storefrontWrite` capabilities

Strict TypeScript types describe stored documents. Zod validates raw JSON,
tRPC, and MCP input at the service boundary. MCP actions cannot rewrite
changelog entries or bypass brand, media, Website, membership, or concurrency
checks.

## Seed and rollout

`bun run db:seed:product-storefronts -- --organization <slug>` idempotently
creates the Wander product, its Product Atlas, and the currently modeled Apple,
ChatGPT, and Claude storefronts. It never overwrites existing rows.

The evidence-aware field playbook remains available at `/app/apps/playbook`.
It describes current marketplace field requirements and tracks source quality.
The database-backed `/app/apps` workspace owns assignments, target content,
freshness, and external publication status.

TestFlight records begin with listing status `testflight`, not `live`.
Freshness begins `unknown` until a person or agent explicitly confirms the
external surface. Google Play and Zoom are available surface types but no
listings are invented.

The repository's incomplete historical Drizzle journal is not extended for
this feature. Schema changes follow the documented controlled push/migration
branch workflow.
