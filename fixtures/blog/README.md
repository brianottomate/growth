# Growth Blog Workbench fixtures

Fixture-backed inputs and immutable run artifacts for `/lab/blog-workbench`,
the lab for inspecting one complete SEO content-generation run
(seo-engine brief in, long-form guide out).

## Provenance rules

- `seo-engine-response.json` is a real SEO Engine content-brief response,
  preserved byte-for-byte (Prettier is told to leave it alone). Never edit it;
  a new example is a new file.
- `grounding/` holds crawl-derived grounding contexts. These are stand-ins
  built from the target business's public site, NOT the production
  `ContentBriefGroundingContext` the monolith writer would receive. Every file
  records how it was derived.
- `runs/<runId>/` is an immutable record of one executed generation run:
  `run.json` (every stage, receipt, and usage number) plus `article.mdx`
  (the serialized artifact). Successful runs are never edited or deleted;
  a rerun appends a new directory and `latest.json` moves.

## Known-missing inputs

The workbench models these explicitly rather than fabricating them: the real
production grounding context, Cam's Opus-generated article for this brief,
Cam's evaluator scorecard, the production writer branch/PR, and the official
SEO-response-to-writer adapter. See `missingInputs` inside any `run.json`.
