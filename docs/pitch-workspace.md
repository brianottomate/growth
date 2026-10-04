# Performance pitch workspace

`/app/performance/pitch?q=company` is the bookmarkable sales entrance. It searches
prospect/client brands first, then reuses the existing leads search (including
mirrored HubSpot companies). Choosing a lead creates/reuses a prospect and opens
`/app/performance/clients/[brandSlug]/pitch`; enrichment runs in the background.
The existing Prospects page and each brand's Pitch tab also link to the editor.
This does not add live HubSpot search or CRM writes.

## Saved state

One `brand_pitch` row per brand stores flat sparse `overrides` JSONB,
plus `revision`, `updated_at` and `updated_by` columns. Missing override keys inherit. Brand identity remains the default. Empty overrides
restore standard/brand values; empty home selection means all available homes.
Up to three hosted photos can be chosen, or uploaded through the existing R2
media pipeline. Browser-local URLs cannot be persisted.

Save immediately updates the live pitch after both repos have deployed. It never
changes agreed fees, invoices or billing settings. The UPDATE compares the expected
revision atomically; a stale save returns a conflict and requires an explicit
reload that discards edits. In explicit manual mode, AI suggestions edit the local form only after Apply;
Undo restores the previous form. Save remains a separate action.

The app, assistant and MCP share `performanceRead.pitch`,
`performanceRead.draftPitch`, and `performanceWrite.savePitch` through the canonical
capability registry and organization membership checks.

## Gateway contract

`GET /api/performance/v1/pitch` still uses the gateway bearer. Its public `settings`
projection includes only presentation fields and revision, omitting writer/time,
contacts, private notes and billing. Selected homes are filtered from this brand's
own listing feed. wander.com reads this payload without caching, initializes the
studio from it, and ignores stale local identity/photo caches on seeded pitches.
Rep setup edits on wander.com remain temporary overrides; editing in Growth is
how a change becomes shared. Older wander.com deployments ignore `settings`;
the new renderer accepts responses without it, so rollout order is safe.

## Migration and checks

Run the exact additive migration rather than a broad schema push:

```sh
bun --conditions=react-server scripts/apply-pitch-settings.ts
```

Dev and production currently share Neon. The additive migration creates `brand_pitch` and copies any legacy overrides,
without overwriting newer pitch rows. The obsolete brand column is removed by
the new production schema. The workspace dev environment was prepared
with this migration during implementation.

```sh
bun run check
bun test
bun run ai:contracts
bun --conditions=react-server scripts/test-pitch-workspace-db.ts
```

The last check inserts a fixture inside a transaction, checks saving, stale-save
rejection and cross-organization rejection, then deliberately rolls everything
back. Browser QA should use a temporary prospect and archive it afterwards.

For local integration, run Growth on 3102 and wander.com on 3101. Configure the
renderer with `GROWTH_GATEWAY_URL=http://localhost:3102` and the same gateway token
as Growth. Never put that token into a browser URL. Preview links in the Growth
editor use the canonical live wander.com URL; use the local renderer URL for QA.


## Pitch chat and embedded preview

Open in chat starts a fresh brand-scoped pitch conversation. Unadded leads open a
fresh unscoped research conversation; opening it does not create a prospect or
save pitch changes. The assistant can research public pages, suggest changes,
and use the same canonical pitch save action when instructed. Chat refreshes
saved settings in the editor without replacing unsaved manual edits.

The iframe at the bottom loads wander.com's `/internal/performance/:slug/preview`
route, the same public renderer with a narrow Growth origin framing policy.
Normal wander.com routes retain SAMEORIGIN. Local Growth on port 3102 is allowed
only in development. No gateway credential is passed into the iframe.

WanderOS detection now requires a Wander-owned website asset URL. Arbitrary
numbers in HTML are not website IDs. Oversized legacy cached IDs are hidden from
badges and rechecked on listing reads. Maui Kai's erroneous 48-digit ID was
rechecked and cleared; no pitch settings or commercial fields were changed.

## Read-only workspace and automatic defaults

The workspace opens as a read-only snapshot with source labels and Open in chat.
Manual editing is an explicit mode; saving or discarding returns to the snapshot.
Inputs show effective editable text while retaining empty underlying overrides
until the operator changes a field. Reset to default removes that field's override.

The dedicated table’s JSONB stores explicit pitch overrides. Brand name and logo fall back to brand data,
and standard copy and pricing come from `STANDARD_PITCH_DEFAULTS`. Growth resolves the effective values and exposes `resolved` in the gateway
payload. The internal snapshot uses the same resolver, and wander.com renders
that result. Legacy payload fields remain temporarily for safe rollout. Updating defaults does not rewrite existing brands;
explicit overrides stay fixed, including a deliberate zero fee. Older gateway
responses remain compatible with the renderer. Explicit copy query variants
continue to supply their own headline/introduction unless overridden.

### Visual review and export

The read-only pitch workspace displays the resolved logo/icon, a lightweight page opening and sample-ad frame, and featured-photo thumbnails. It reuses the public pitch resolver for brand marks, homes and location; these illustrative frames do not replace the embedded live page. Manual edits update the frames locally and are labelled unsaved until saved. When no home images are available, the workspace explicitly shows the missing asset rather than substituting generic property photography.

New image uploads use the existing R2 media service and are organized into the brand's `Pitch` folder. Selecting an existing library image leaves its folder unchanged. Folder organization is best effort and does not roll back a successful upload. Pitch JSONB retains only hosted asset references.

PDF/PNG controls open in a Growth dialog embedding wander.com's narrow `/preview?exportPanel=1` surface. The renderer captures its own actual saved page, so Growth does not duplicate capture logic or copy the entire pitch UI. The download overlay is excluded from the exported document.
