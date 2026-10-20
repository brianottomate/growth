# Brand context and steering

The brand story is editable prose in `brand.story`. Supporting creative direction is `brand.creativeDirection` JSONB: positioning, an optional archetype, two fixed voice axes (casual to formal and understated to expressive), lead-with themes and language to avoid. Voice positions are generated judgments displayed on deterministic scales, not operator controls. Story regeneration produces both in one structured model call and saves them together. Current accepted content and operator steering are included; a concurrent edit prevents the generated result from overwriting newer work.

Personas retain their IDs, prose and audience references. `persona.profile` contains only an icon key, motivation and one flat list of pills. Pills combine useful needs, selection criteria and concerns as creative prompt context; they are never platform targeting. No persona evidence note is stored in the new format. Destination JSON keeps existing IDs when town membership is unchanged. Origin cities are suggestions unless supported by measured data.

## Shape and tool parity

Shape opens a chat with the brand and resource name/ID. It does not open a hidden generator or apply a change. The assistant reads the resource, then uses a precise update or passes the requested revision as `steer` to a relevant generator. The canonical action schemas are shared by app chat, oRPC and external MCP clients, including ChatGPT and Claude.

`steer` is an optional, trimmed, 1–4000 character instruction for this invocation. `operatorSteeringSection` only formats its prompt section; each applicable tool explicitly declares the field and passes it to the generating service. It does not override ownership, provider approval, schema constraints, selected resources or factual evidence. Durable workflow inputs retain steering across retries. This is not a universal argument for reads, deterministic edits or provider operations.

Supported here: brand story/direction, destinations, persona proposals (including targeted existing persona revisions), campaign audience suggestions, Google text ads, featured-home suggestions, composition copy, catalog photo/copy retries, starter-ad generation and brand mark recommendations. The mark tool's old `direction` argument remains an alias. Existing media/outreach steering and durable email briefs retain their semantics.

Use `brandRead.context` for story/direction/destinations, `personaRead.list` for personas, `brandWrite.updateStory` for a regenerated story, `brandRead.suggestMarkets` followed by `brandWrite.setMarkets` for a destination regrouping, and `personaRead.suggest` with `personaId` followed by `personaWrite.update` for a regenerated existing persona. Preserve IDs and unrelated fields on precise edits.

## Existing content

Migration 0012 is additive: two nullable JSONB columns. Existing content remains readable before regeneration. The one-time backfill adds missing structured data from accepted prose, without changing stories, persona descriptions, IDs or campaign references. It validates inventory and uses source timestamps plus null checks so retries are safe and concurrent operator edits win.

Rehearse on an experiment, then run after the production migration:

```sh
bun run db:experiment brand-context -- bun --conditions=react-server scripts/brand-context/backfill.ts --apply
bun --conditions=react-server scripts/brand-context/backfill.ts # dry-run
bun --conditions=react-server scripts/brand-context/backfill.ts --apply
```

Optional `--brand=slug` limits the backfill. Failures leave original content intact and exit nonzero; rerun to finish missing rows. No legacy prose is dropped. New destinations already use compatible JSON and need no bulk rewrite.

New story generation uses a 6–12 word positioning title (100 characters maximum), an archetype key and 2–5 compact priorities and avoid rules each. The header archetype selector opens a picker; its dictionary owns role instructions and default voice settings. Existing saved voice overrides remain intact.

Persona setup cards show the short name with an icon, one motivation sentence and a single pill group. Icons are selected by generation, with no icon-swap control. Shape remains available. New generation limits names to 60 characters, descriptions and motivations to 160 characters, and pills to 2–5 phrases of at most 50 characters. It does not generate needs/decision/objection categories or evidence notes.

Migration 0024 historically merged the old arrays in order and removed evidenceNote. Runtime reads now accept only the compact schema; there is no compatibility reader. On 2026-10-09 the operator requested a purge of all existing personas, and all 29 records were deleted. Older deployed writers must be retired to prevent old-format records from reappearing. Production migration remains part of the normal release flow.

Destination cards keep Shape, town coverage, up to three reasons to visit, two season names with time windows, and three suggested origin cities. Generation qualifies US origin cities with their states, so the existing campaign flow can derive state suggestions. A city qualifier identifies location; a broader state audience remains a separate planning choice. Included-home lists and extended travel, season and background prose stay out of the destination card. Stored context remains available to chat and other creative workflows.

## Archetypes and voice

`src/lib/brand-direction.ts` owns the archetype dictionary: stable key, label,
short description, prompt instruction, and three default voice positions.
`caregiver` is labelled Caretaker and `creator` is labelled Curator to preserve
existing record identities. Generation selects a key and writes positioning plus
2–5 compact lead-with and avoid phrases; it does not generate independent voice
values or archetype explanations.

The existing `creativeDirection.voice` field is the explicit override. Null uses
archetype defaults; an existing two-axis override preserves those positions and
derives warmth from the archetype. `effectiveVoice` is shared by prompt formatting
and the UI. Setup offers an archetype picker, direct voice adjustment, and a reset
to defaults. Regeneration carries the saved override forward. `archetypeReason` is
accepted for existing records but is no longer generated or displayed.

This expands the existing JSON contract without changing database columns or
rewriting accepted preferences. Existing two-axis records remain readable. Deploy
the new readers before using null overrides on shared production records; older
MCP deployments require a voice object.
