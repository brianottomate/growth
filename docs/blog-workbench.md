# Growth Blog Workbench

`/lab/blog-workbench` is a developer-facing lab for inspecting one complete
SEO content-generation run: SEO Engine brief in, long-form guide out, every
transformation visible. It is fixture-backed by design; nothing here is a
production integration yet.

## The pipeline it executes

`scripts/lab/run-blog-golden.ts` (bun, `--conditions=react-server`) runs:

1. Load `fixtures/blog/seo-engine-response.json`, a real SEO Engine
   content-brief response preserved verbatim (snake_case wire format).
2. Normalize it into Cam's writer contract (`ContentBriefInput`) with the
   draft adapter `seo-response-to-writer/v1-draft` in
   `src/server/services/blog-workbench/contract.ts`.
3. Load the grounding context fixture from `fixtures/blog/grounding/`.
   For a real target site this is crawl-derived (Firecrawl + extractive-only
   Sonnet pass). The golden-run example targets a parked domain, so its
   grounding is a hand-authored `synthetic-fixture/v1` whose provenance says
   exactly that.
4. Render the vendored prompt (`content-brief-page/cam-draft-2026-08-04`,
   verbatim from Cam's draft plus the monolith's `COPY_VOICE_RULES` and
   `COPY_EXEMPLARS`).
5. Generate the article with Opus as plain markdown (structured JSON output
   died on provider validation for long articles; sections split
   deterministically at `##` headings), then SEO metadata via a small Sonnet
   structured call, with a narrow word-boundary transport adapter for
   slightly-over metadata limits.
6. Run deterministic checks: outline coverage, numeric grounding (dollar
   amounts hard-fail), link provenance, lexical voice bans, entity coverage,
   and a metadata gate mirroring the production velite posts limits.
7. Run the independent editorial evaluator (Sonnet), whose rubric includes
   the distilled AI-writing patterns: aphoristic conclusions, manufactured
   punchlines, staccato drama, negative parallelism, forced triads, generic
   signposting, filler conclusions.
8. Persist the run immutably under `fixtures/blog/runs/<runId>/`
   (`run.json` + `article.mdx` with a `publishedAt: 9999-12-31` draft gate)
   and move `latest.json`.

## Honesty rules

- Missing production inputs are modeled, never silently fabricated. The
  register lives in `contract.ts` (`MISSING_INPUTS`) and renders on the
  workbench overview: real grounding context, Cam's Opus article, Cam's
  evaluator scorecard, the production writer branch, the official adapter.
- Successful runs are immutable; reruns append.
- Cost figures are estimates at assumed per-MTok rates; verify before
  quoting.

## Next steps (from the handoffs)

- Persist failed runs as first-class receipts (today a failure before run
  construction only reaches the terminal).
- Run-to-run comparison beyond counts (which sections, claims, and receipt
  statuses changed).
- A bounded editorial-revision pass driven by evaluator comments.
- Connect to the live pipeline once wander PR #21117 (SEO client) and the
  production writer land.
