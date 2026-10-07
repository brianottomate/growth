# Brand context and steering

The brand story is editable prose in `brand.story`. Supporting creative direction is `brand.creativeDirection` JSONB: positioning, an optional archetype, four fixed voice axes, lead-with themes and language to avoid. Voice positions are generated judgments displayed on deterministic scales, not operator controls. Story regeneration produces both in one structured model call and saves them together. Current accepted content and operator steering are included; a concurrent edit prevents the generated result from overwriting newer work.

Personas retain their IDs, prose and audience references. `persona.profile` adds motivation, needs, objections, decision criteria, suggested home IDs, a fit explanation and evidence notes. Travel details are optional, with unknown attributes null. Suggested homes must belong to the brand. Personas describe creative planning hypotheses; campaign platform targeting remains separate. Destination JSON keeps existing IDs when town membership is unchanged. Origin cities are suggestions unless supported by measured data.

## Shape and tool parity

Shape opens a chat with the brand and resource name/ID. It does not open a hidden generator or apply a change. The assistant reads the resource, then uses a precise update or passes the requested revision as `steer` to a relevant generator. The canonical action schemas are shared by app chat, oRPC and external MCP clients, including ChatGPT and Claude.

`steer` is an optional, trimmed, 1–4000 character instruction for this invocation. `operatorSteeringSection` only formats its prompt section; each applicable tool explicitly declares the field and passes it to the generating service. It does not override ownership, provider approval, schema constraints, selected resources or factual evidence. Durable workflow inputs retain steering across retries. This is not a universal argument for reads, deterministic edits or provider operations.

Supported here: brand story/direction, destinations, persona proposals (including targeted existing persona revisions), campaign audience suggestions, Google text ads, featured-home suggestions, composition copy, catalog photo/copy retries, starter-ad generation and brand mark recommendations. The mark tool's old `direction` argument remains an alias. Existing media/outreach steering and durable email briefs retain their semantics.

Use `brandRead.context` for story/direction/destinations, `personaRead.list` for personas, `brandWrite.draftStory` / `draftMarkets` for regenerated context, and `personaRead.suggest` with `personaId` followed by `personaWrite.update` for a regenerated existing persona. Preserve IDs and unrelated fields on precise edits.

## Existing content

Migration 0012 is additive: two nullable JSONB columns. Existing content remains readable before regeneration. The one-time backfill adds missing structured data from accepted prose, without changing stories, persona descriptions, IDs or campaign references. It validates inventory and uses source timestamps plus null checks so retries are safe and concurrent operator edits win.

Rehearse on an experiment, then run after the production migration:

```sh
bun run db:experiment brand-context -- bun --conditions=react-server scripts/brand-context/backfill.ts --apply
bun --conditions=react-server scripts/brand-context/backfill.ts # dry-run
bun --conditions=react-server scripts/brand-context/backfill.ts --apply
```

Optional `--brand=slug` limits the backfill. Failures leave original content intact and exit nonzero; rerun to finish missing rows. No legacy prose is dropped. New destinations already use compatible JSON and need no bulk rewrite.
