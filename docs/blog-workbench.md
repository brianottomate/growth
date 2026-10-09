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
- `bun run lab:blog-sync-mdx` refreshes the latest run's editable Velite draft
  under `content/posts/builder-<target-query>.mdx`. New golden runs also run this
  step. Rebuild Velite after changing a draft (`bun run velite:build`).

## Editable Markdown and editorial layouts

Each generation still preserves immutable `run.json`, `article.mdx` and the
DatoCMS draft export. A separate MDX mirror in `content/posts/` is the ongoing
authoring surface. It remains unpublished through a future `publishedAt` date,
and renders with the real Velite component registry inside the gated
`/lab/blog-workbench/preview/<slug>` route. The workbench links to that preview.

Refreshing the mirror replaces its article content with the requested run and
preserves the existing publication date. Draft edits use last-write-wins. Each
generation remains available in its immutable run directory. There is no
automatic CMS or website publication.

The `Editorial building blocks` draft demonstrates Growth-native components:

| Component | Editorial purpose |
| --- | --- |
| `ArticleNote` | Practical logistics, caveats and evidence notes |
| `ArticleSplit` | Short text with one image, consistent prose typography |
| `ArticleBanner` | A section transition with an explicit crop position |
| `ArticleGallery` | Related images/videos; natural, stacked-left or stacked-right |
| `ArticlePlaces` | Compact cards with category/location, status, map and website links |
| `ArticleItinerary` | Ordered stops with sourced durations, notes and optional links |
| `ArticleLinks` | Resource/property cards with a reason for each recommendation |
| `ArticleHero` | Larger image transition; optional panorama or reduced-motion-aware parallax |
| `ArticleVideo` | Standalone native video with controls, poster and caption |
| `ArticleYouTube` | Lazy privacy-enhanced embed with a validated video ID |

All are registered in `src/components/mdx/MDXContent.tsx`. Place cards stack on
phones; media keeps its natural aspect ratio. Gallery images open an accessible
expanded dialog (a drawer on phones), with keyboard dismissal and focus return. Videos use controls and do not
autoplay. Supply meaningful alt text, reviewed captions, current links and
real property photography. Do not substitute generated photos for real homes.
The layout example reuses existing Growth artwork and states that it is not
destination evidence.

Writer and evaluator share `editorial.ts`: prose must advance a travel decision,
not repeat a caption or fact box; local businesses and properties must help the
trip; personal experience cannot be fabricated; media references must survive
layout edits. The model still emits plain Markdown. The serializer escapes JSX
and expression delimiters and rejects module statements before Velite sees it.
An operator adds the reviewed editorial components to the editable MDX.

DatoCMS remains a separate target. Its current exporter serializes the typed
run's prose; it does **not** consume manual MDX component edits. Rich-layout and
manual-copy synchronization back to Dato requires an explicit adapter and CMS
block mappings. Do not describe the targets as synchronized after manual edits.

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


## Discovery publication boundary

Discovery uses WanderOS website pages as its CMS: the backend persists structured
page sections as an unpublished draft with change history, then a separate
publication action makes the page available through the public website API.
The Astro property-site renderer fetches those pages at runtime and renders
shared `@wandercom/page-sections-components`. It does not use Growth DatoCMS or
Growth's Velite drafts.

Keep Velite as Growth's file-based authoring/preview target. A property-site
integration should map reviewed article blocks into the existing page-section
schemas, preserve page identity and revision history, and expose draft review
before the normal publication action. Do not add a second file-based authority
for customer pages or require site rebuilds for customer article edits.
Astro's own content collections are an option if a separate repository-authored
editorial collection is needed; they are not required for the current API flow.

## Live Wander blog layout study (2026-10-02)

The `Wander blog patterns` draft is linked from the lab and uses five additional
components: `ArticleQuickAnswers` (priority/answer/reason), `ArticleComparison`
(caption/columns/rows/sourceNote), `ArticleTradeoffs` (benefits/cautions),
`ArticleUpdate` (change narrative plus reader benefit and optional screenshot),
and `ArticleFigure` (image/caption/credit/creditHref). These are registered in the
same Velite renderer. Comparison tables have header semantics and a focusable
scroll region to keep wide content inside a phone-sized article.

Inspected live references:

- [September announcement](https://www.wander.com/article/september-at-wander-welcome-to-the-direct-booking-revolution): illustrated release sections and operator benefits.
- [Polarity announcement](https://www.wander.com/article/wander-x-polarity): introduction, rationale, implications.
- [Orlando timing guide](https://www.wander.com/article/best-time-to-visit-orlando): priority answers, month comparison, benefits/caveats and seasonal property fit.
- [Big Sur area guide](https://www.wander.com/article/best-places-to-stay-big-sur): area narrative, activities, logistics and property shortlist.
- [Secluded Dunes transport guide](https://www.wander.com/article/wander-secluded-dunes-transportation-guide): airport options, distances, service details and photo attribution.

Adapt the information structure, not unverified destination claims or unattributed
expert quotations. Shared writer/evaluator guidance now requires agreement
between opening answers, tables and conclusions; practical checks for regional
access; genuine quotation attribution; and evidence for release/performance
claims. Useful existing components (`Quote`, `TLDR`, CTA and recommendation cards)
should be reused instead of making parallel versions. New visual components are
operator-authored MDX; model generation still emits inert Markdown and layout
directions, not executable component tags. CMS rich-block adapters remain future
work.

## Frozen-source comparison demo

`bun run lab:blog-compare` uses the captured Orlando seasonal post under
`fixtures/blog/comparisons/orlando/source.json`. The snapshot retains the source
URL, capture timestamp, author/date, body HTML, converted Markdown, and published
image references. The original is a content mirror in Velite, not a pixel-perfect
copy of the live DatoCMS page.

The preparation model extracts a traveler brief and grounding facts, saved in
`extracted-brief.json` and `grounding.json`. The regular storyboard → writer →
revision → metadata → evaluator runner then receives those extracted inputs,
without the original prose. The comparison has its own run directory/pointer and
no previous golden-run comments or synthetic grounding. Default golden-run
behavior is unchanged. This experiment tests regeneration from source-derived
facts, not independent research, live property verification, search performance,
or an end-to-end production Discovery execution.

A separate typed layout pass rearranges the generated article into quick answers,
comparisons, tradeoffs and property link cards. It cannot emit arbitrary component
code: only schema-approved component data is serialized as JSON props; prose is
escaped with the common inert Markdown serializer. Headings/order must match and
card links must trace to grounding. A second evaluator reviews all displayed copy,
including component data. The generated source prose, layout, evaluations and
provider usage are preserved with the immutable run. The comparison page exposes
both verdicts and all deterministic checks, including failures.

`/lab/blog-workbench/compare/orlando` renders frozen original and generated layout
side by side, with links to separate Velite previews and the live DatoCMS post.
Both versions use the same cover image and typography. The generated page does
not present the cover as proof of a recommended home. MDX files remain future-dated
and unpublished. The run includes the existing prose-only Dato draft export;
custom component layouts still need Dato block mappings before publication.

Reruns reuse the frozen extracted assignment and facts, write a new immutable
candidate, and update only the comparison's pointer. The runner sends the public
source-derived content to the configured Anthropic provider. It never writes to
DatoCMS or any live customer site.

The comparison runner now resolves exact property links through the same public
Wander marketplace client used by newsletters. `property-media.json` records the
listing ID, source endpoint, capture time and cover thumbnail for each match;
unresolved links keep a text card rather than borrowing a similar home's photo.
This pass captures photos, location, bedroom/bath counts and available ratings,
without replacing the frozen prose or writing-review receipts. It adds no rates
or savings claims. Native design-system PropertyCards appear
with their seasonal sections. The lab labels this later presentation revision
as not re-evaluated. To refresh this presentation without another model run:
`bun --env-file=.env --conditions=react-server scripts/lab/enrich-blog-comparison.ts`.
