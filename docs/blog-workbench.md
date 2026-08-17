# Growth Blog Workbench

`/lab/blog-workbench` is a teammate-facing lab for inspecting one complete SEO
content-generation run. It shows the brief, grounding, storyboard, generated
article, review comments, visual requests, usage receipts, and CMS export.

The operating mode is agent-accompanied. Keep ChatGPT, Codex, or Claude Code
beside the workbench. The page makes artifacts and decisions inspectable. The
local agent runs commands and prepares the next immutable revision.

## The pipeline it executes

`scripts/lab/run-blog-golden.ts` (bun, `--conditions=react-server`) runs:

1. Load `fixtures/blog/seo-engine-response.json`, a real SEO Engine
   content-brief response preserved verbatim (snake_case wire format).
2. Normalize it into the site-editor writer contract (`ContentBriefInput`) with the
   draft adapter `seo-response-to-writer/v1-draft` in
   `src/server/services/blog-workbench/contract.ts`.
3. Load the grounding context fixture from `fixtures/blog/grounding/`.
   For a real target site this is crawl-derived (Firecrawl + extractive-only
   Sonnet pass). The golden-run example targets a parked domain, so its
   grounding is a hand-authored `synthetic-fixture/v1` whose provenance says
   exactly that.
4. Plan a typed storyboard before prose. Each section owns one editorial job,
   its evidence needs, promotion decision, and any registered visual request.
5. Render the versioned writer prompt with the production voice rules and
   examples.
6. Generate the article with Opus as plain markdown (structured JSON output
   died on provider validation for long articles; sections split
   deterministically at `##` headings), then SEO metadata via a small Sonnet
   structured call, with a narrow word-boundary transport adapter for
   slightly-over metadata limits.
7. Run one bounded editorial revision pass. The pass receives the storyboard
   and open comments from the previous immutable run.
8. Run deterministic checks: outline coverage, numeric grounding (dollar
   amounts hard-fail), link provenance, lexical voice bans, entity coverage,
   and a metadata gate mirroring the production velite posts limits.
9. Run the independent editorial evaluator (Sonnet), whose rubric includes
   the distilled AI-writing patterns: aphoristic conclusions, manufactured
   punchlines, staccato drama, negative parallelism, forced triads, generic
   signposting, filler conclusions.
10. Persist the run immutably under `fixtures/blog/runs/<runId>/`
    (`run.json` + `article.mdx` with a `publishedAt: 9999-12-31` draft gate)
    and move `latest.json`.

## Publish targets

The typed article is the artifact; serialization targets are pluggable and
derived deterministically from `run.json`:

- **Velite MDX** (`article.mdx`): the workbench's compile gate, mirroring the
  growth blog's production posts schema. Velite stays a workbench-internal
  form; it is not the real wander.com blog's stack.
- **DatoCMS draft** (`datocms-draft.json`, via
  `scripts/lab/export-blog-dato-draft.ts`): the real wander.com blog is
  DatoCMS (`BlogArticleRecord`), whose body is Structured Text (dast), not
  markdown. The export converts markdown to dast with a bounded converter
  (`datocms.ts`, marked lexer over exactly the node set the writer emits) and
  validates it with DatoCMS's own `datocms-structured-text-utils` validator.
  Scalars (title, slug, description, body) are complete; link records (tags,
  author) and the cover image upload are listed as unresolved because they
  need CMA lookups at push time. Pushing needs a CMA token; the configured
  CDA token is read-only, so nothing auto-publishes.
- **Production site-editor pages**: the site editor persists production page
  sections for customer sites and never touches Dato. This lab
  stays a review surface and does not import that runtime.

## Local agent commands

- `bun run lab:blog-run` creates a new immutable generation run.
- `bun run lab:blog-agent-brief` prints the current storyboard, anchored review
  comments, and visual directions for a side-chat agent.
- `bun run lab:blog-export-dato` derives the DatoCMS draft for the latest run.

## Honesty rules

- Missing production inputs are modeled, never silently fabricated. The
  register lives in `contract.ts` (`MISSING_INPUTS`) and renders on the
  workbench overview.
- Visuals start as typed directions with a purpose, placement, constraints,
  and owner. The UI does not present a direction as a finished asset.
- Successful runs are immutable; reruns append.
- Cost figures are estimates at assumed per-MTok rates; verify before
  quoting.

## Next steps (from the handoffs)

- Persist failed runs as first-class receipts (today a failure before run
  construction only reaches the terminal).
- Run-to-run comparison beyond counts (which sections, claims, and receipt
  statuses changed).
- Connect the review artifacts to the live production writer through a stable
  contract after the team has used the local workflow enough to judge it.
