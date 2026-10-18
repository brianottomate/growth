# Reference boards

`/app/landscape/boards` keeps creative references and proposals for an owned brand.
Save a published post from Landscape or add an approved asset from the brand's
media library. Add notes and arrange reference occurrences in the order that
helps tell the story. The same source can appear more than once.

A board holds an editable brief. Each proposal records its destination, working
title, hook, copy, visual direction, CTA, rationale and selected references.
Manual editing and assistant operations share the same service. The assistant
can draft original proposals from the board when asked. This workflow makes no
model or provider calls by itself.

Review a saved proposal, then accept it into one local draft:

- Content creates a `content_post` with the editorial brief. Channel versions,
  artwork and scheduling remain part of the existing content workflow.
- Ad studio creates a brand-owned creative ad shell with its copy. The proposal
  retains visual direction and rationale for the next production step. No
  campaign, media export, provider object or approval is created.

Reference media stays on the board. Capturing a reference does not grant rights
to reuse it as artwork. Choose owned production media in the existing editor.

## Ownership and state

`reference_board` owns the brand, organization and brief. `board_reference`
identifies each ordered occurrence, with a typed FK to a post or media asset.
`board_proposal` owns the proposed direction and its eventual draft link.
Ordinary edits use last-write-wins.

Read and write access rechecks the board's organization and active owning brand.
Post sources must be published and belong to an owned brand or an unowned
reference brand explicitly tracked by an active brand in the current workspace.
Media must be ready, approved and workspace-owned. Source previews are resolved
on read; deletion or a later ownership change makes them unavailable. Notes and
original proposal text remain operator work on the board.

Acceptance locks the board and proposal, checks the exact reviewed document,
then creates the draft and acceptance link in one transaction. An accepted
proposal stays frozen. Repeating acceptance returns the existing receipt;
it never overwrites edits to the downstream draft or recreates a deleted draft.
Archiving a board preserves its references and accepted work.

## Shared surface

`referenceBoardRead` exposes `list`, `get` and `media`.
`referenceBoardWrite` exposes `save`, `addReference`, `editReferences`,
`saveProposal` and `acceptProposal`. These are shared by oRPC, chat and MCP.
They are workspace-local operations. Provider publishing and paid production
retain their existing authorization flows.

## Migration and verification

`drizzle/0040_reference_boards.sql` adds three tables and their foreign keys.
It changes no existing rows. Rehearse committed migrations on a fresh disposable
Neon branch, then run `scripts/database/verify-reference-boards.ts` with
`DB_EXPERIMENT_BRANCH=experiment/reference-boards` and a verified
`BOARDS_TEST_HOST`. The rehearsal protects cross-organization sources,
shared public references, last-write-wins edits, stale acceptance, concurrent
acceptance, downstream edits and deletion, and archived/deleted brand access.

The source gates are `bun run check`, `bun test`, `bun run ai:contracts` and
`bun run db:check`. Verify the authenticated board routes against an isolated
preview before releasing through the normal GitHub Release workflow.
