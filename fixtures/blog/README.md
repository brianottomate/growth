# Growth Blog Workbench fixtures

Fixture-backed inputs and immutable run artifacts for `/lab/blog-workbench`,
the lab for inspecting one complete SEO content-generation run
(seo-engine brief in, long-form guide out).

## Provenance rules

- `seo-engine-response.json` is a real SEO Engine content-brief response,
  preserved byte-for-byte (Prettier is told to leave it alone). Never edit it;
  a new example is a new file.
- `grounding/` holds crawl-derived grounding contexts. These stand-ins come
  from the target business's public site and remain distinct from the live
  `ContentBriefGroundingContext` the production writer receives. Every file
  records how it was derived.
- `visual-directions.json` names each visual's purpose, placement, constraints,
  and fulfillment owner. A direction is not an approved asset.
- `runs/<runId>/` is an immutable record of one executed generation run:
  `run.json` (every stage, receipt, and usage number) plus `article.mdx`
  (the serialized artifact). Successful runs are never edited or deleted;
  a rerun appends a new directory and `latest.json` moves.

## Known-missing inputs

The workbench models these explicitly rather than fabricating them: the live
production grounding context, a production execution for this exact fixture,
a current brief fetched from the live pipeline, and the official
SEO-response-to-writer adapter. See `missingInputs` inside any new `run.json`.

## Agent-accompanied workflow

Keep ChatGPT, Codex, or Claude Code beside the workbench. Print the current
revision packet with `bun run lab:blog-agent-brief`. The packet carries stable
comment IDs, storyboard ownership, and visual directions into the next run.
