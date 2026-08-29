# Brand map and growth flywheel

**Status:** product direction and implementation map, 2026-07-11.

## Product thesis

the growth workspace helps a human teach AI how a brand is actually shaped.

The raw material lives across many surfaces: brands, channels, websites, blogs,
audiences, media, published posts, ads, conversations, and performance. the growth workspace
does two jobs over that material:

1. give the human a calm visual map where structure can be confirmed, corrected,
   or rejected; and
2. give AI a scoped, portable context surface that can load the whole map or only
   the parts needed for a task.

The AI may propose structure over reality, but it does not silently redefine
reality. Groupings, series, audience profiles, cadence targets, and plans are
reviewable layers. Once confirmed, those layers make future planning better.

```text
observe raw surfaces
  -> map and analyze
  -> propose structure
  -> human review
  -> plan slots
  -> create deliverables
  -> publish and measure
  -> propose learning
  -> human updates the map and strategy
```

This is the product flywheel. Chat is an operator for the flywheel, not a second
product or a hidden source of truth.

## Core vocabulary

- **Surface:** a real area of brand activity or context, such as a channel,
  website, blog, audience, media library, or published timeline.
- **Brand map:** the confirmed cross-surface read model. It shows what the growth workspace
  knows, what is structured, and where evidence or human decisions are missing.
- **Proposal:** an AI-suggested change to structure or strategy. Proposals are
  reviewable and do not masquerade as confirmed facts.
- **Grouping:** a proposal that several platform posts are renderings of one
  canonical content idea.
- **Series:** a durable editorial structure containing multiple distinct ideas.
- **Moment blueprint:** a non-persistent proposal for the shape of a coordinated
  push: verdict, scale, slots, channel renderings, and amplifier asks.
- **Slot:** planned intent: what must exist, where, and when. It is not finished
  copy or a published object.
- **Deliverable:** the canonical created work that fills a slot. Today the closest
  object is `content_post`; a later version boundary should preserve revisions.
- **Rendering:** a platform-specific expression of a deliverable, represented by
  `platform_post`.
- **Learning:** an evidence-backed proposed strategy change from observed outcomes.

## What transfers from Capient

Capient makes one especially useful distinction:

```text
deliverable_slot -> artifact -> artifact_version -> artifact_export
```

The equivalent the growth workspace model is:

```text
content slot -> canonical content idea/deliverable -> revision -> platform rendering
```

The important rule is the same: the planned obligation, the canonical work, and
the output are different objects. A social post, blog article, or exported asset
should not become the only source of truth. Capient's operator-steward model also
supports the the growth workspace Review center: deterministic gaps first, AI judgment second,
visible findings and proposals, and writes routed through application services.

## Three phases

### Phase 1 — one coherent map and operator

Goal: make the existing product legible without rebuilding every surface.

- A visual Brand Map summarizes strategy, distribution, audiences, owned
  surfaces, content structure, and creative media from live data.
- A global Review center collects pending structural decisions and deterministic
  gaps.
- Navigation is organized around Brand map, Plan & create, Observe, Library, and
  Operations.
- The right-side assistant persists across routes and can navigate on explicit
  instruction.
- The same brand-map read model powers the visual page and the assistant.

### Phase 2 — portable, supervised workflows

Goal: every important operation can be run from UI, chat, or a deployed agent
without duplicating business logic.

- The capability registry is the single definition for inputs, access scope,
  execution, read/write hints, and descriptions.
- The in-app assistant adapts it to AI SDK tools with approval cards for writes.
- `/api/mcp` adapts the same registry to authenticated Streamable HTTP MCP.
- Initial operational coverage includes channel discovery, public post scraping,
  owned history sync, website/blog sync, image analysis, grouping/series
  proposals, brand-map inspection, navigation URLs, and strategy learning.
- Planning uses `draftMomentBlueprint` for a side-effect-free proposal and
  `commitMomentPlan` for the approval-gated creation of campaigns and slots.

### Phase 3 — deliverables and compounding learning

Goal: close the loop from a planned slot to measured, reusable work.

- Add an explicit deliverable/revision boundary if `content_post` can no longer
  safely hold both planned intent and canonical work.
- Let Studio fill a slot while preserving the blueprint, sources, human edits,
  approvals, and versions.
- Make publish/schedule deterministic and provider-specific; the model prepares
  work but does not silently publish.
- Preserve performance snapshots over time, not only the latest inline metrics.
- Relate outcomes back to slot, series, audience, channel, format, and strategy.
- Produce learning proposals with evidence and let humans apply them to cadence,
  mix, audience, or series structure.
- Add durable run/finding records when workflows need retries, schedules,
  observability, or suspension for approval.

## Product rules

1. The map is a read model over canonical records, never a second database.
2. Missing structure is shown as a gap, not interpreted as missing reality.
3. AI analysis stays literal and traceable; strategy is a separate proposal.
4. Writes are organization-scoped and use shared application services.
5. Chat may navigate only for explicit navigation requests.
6. UI, chat, and MCP expose the same capability semantics.
7. Long-running work gets a durable run before it gets background autonomy.
8. Human approval sits at structure, commitment, and publication boundaries.

## Current boundary

Phases 1 and the first operational slice of Phase 2 now exist in this repository.
The blueprint-to-slot seam and evidence-backed target proposals establish the two
ends of Phase 3, but canonical deliverable versioning, deterministic publishing,
historical measurement, and scheduled durable workflows remain separate build
slices. The existing blog-loop plan is the clearest first end-to-end proving
ground for that final phase.
